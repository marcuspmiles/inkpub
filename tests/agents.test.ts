import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { agentApiKeys, agentAuthors, agentConnectionTokens, users } from "@/db/schema";
import { authenticateAgent, bearerToken } from "@/lib/agent-auth";
import { hashPairingCode, normalizePairingCode, sha256 } from "@/lib/tokens";
import {
  MAX_WRITERS_PER_OWNER,
  createPairingCode,
  disconnectWriter,
  registerAgent,
  rotateApiKey,
} from "@/server/agents";

import { bearer, connectWriter, makeUser, setWriterStatus } from "./helpers";

describe("pairing codes", () => {
  it("issues a readable code and stores only its hash", async () => {
    const owner = await makeUser();
    const { code } = await createPairingCode(owner.id);

    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    // Ambiguous glyphs are excluded so the code can be read aloud to a bot.
    expect(code).not.toMatch(/[ILOU01]/);

    const [row] = await db
      .select()
      .from(agentConnectionTokens)
      .where(eq(agentConnectionTokens.ownerUserId, owner.id));

    expect(row!.tokenHash).toBe(hashPairingCode(code));
    expect(row!.tokenHash).not.toContain(code);
    expect(row!.codeHint).not.toBe(code);
  });

  it("normalises however the bot echoes the code back", () => {
    for (const variant of ["k7px4m2q", "K7PX-4M2Q", " k7px 4m2q ", "K7PX_4M2Q"]) {
      expect(normalizePairingCode(variant)).toBe("K7PX-4M2Q");
    }
  });

  it("retires the previous code when a new one is generated", async () => {
    const owner = await makeUser();
    const first = await createPairingCode(owner.id);
    await createPairingCode(owner.id);

    const result = await registerAgent({
      code: first.code,
      username: "signalforge",
      displayName: "Signal Forge",
      provider: "GROK",
    });

    expect(result).toMatchObject({ ok: false, code: "invalid_code" });
  });

  it("rejects an expired code", async () => {
    const owner = await makeUser();
    const { code, id } = await createPairingCode(owner.id);

    await db
      .update(agentConnectionTokens)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(agentConnectionTokens.id, id));

    expect(
      await registerAgent({
        code,
        username: "signalforge",
        displayName: "Signal Forge",
        provider: "GROK",
      }),
    ).toMatchObject({ ok: false, code: "expired_code" });
  });

  it("rejects a code that was never issued", async () => {
    expect(
      await registerAgent({
        code: "AAAA-BBBB",
        username: "signalforge",
        displayName: "Signal Forge",
        provider: "GROK",
      }),
    ).toMatchObject({ ok: false, code: "invalid_code" });
  });
});

describe("writer registration", () => {
  it("lets the bot choose its own username and returns a key once", async () => {
    const owner = await makeUser();
    const { code } = await createPairingCode(owner.id);

    const result = await registerAgent({
      code,
      username: "SignalForge",
      displayName: "Signal Forge",
      bio: "Writes about infrastructure.",
      provider: "GROK",
      specialties: ["Infrastructure", "Databases"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.author.username).toBe("signalforge");
    expect(result.author.ownerUserId).toBe(owner.id);
    expect(result.author.provider).toBe("GROK");
    expect(result.apiKey.startsWith("inkpub_sk_")).toBe(true);

    const [key] = await db
      .select()
      .from(agentApiKeys)
      .where(eq(agentApiKeys.agentAuthorId, result.author.id));

    expect(key!.tokenHash).toBe(sha256(result.apiKey));
    expect(key!.tokenHash).not.toContain(result.apiKey);
  });

  it("consumes the pairing code so it cannot be replayed", async () => {
    const owner = await makeUser();
    const { code } = await createPairingCode(owner.id);

    expect(
      (
        await registerAgent({
          code,
          username: "firstbot",
          displayName: "First Bot",
          provider: "GROK",
        })
      ).ok,
    ).toBe(true);

    expect(
      await registerAgent({
        code,
        username: "secondbot",
        displayName: "Second Bot",
        provider: "GROK",
      }),
    ).toMatchObject({ ok: false, code: "invalid_code" });
  });

  it("rejects a username over 13 characters and suggests alternatives", async () => {
    const owner = await makeUser();
    const { code } = await createPairingCode(owner.id);

    const result = await registerAgent({
      code,
      username: "averyverylongbotname",
      displayName: "Long Name",
      provider: "GROK",
    });

    expect(result).toMatchObject({ ok: false, code: "invalid_username" });
    if (result.ok) return;
    expect(result.suggestions?.length).toBeGreaterThan(0);
  });

  it("rejects a duplicate handle and leaves the code usable", async () => {
    const first = await makeUser();
    await connectWriter(first.id, { username: "signalforge" });

    const second = await makeUser();
    const { code } = await createPairingCode(second.id);

    const clash = await registerAgent({
      code,
      username: "SIGNALFORGE",
      displayName: "Impostor",
      provider: "GROK",
    });

    expect(clash).toMatchObject({ ok: false, code: "username_taken" });

    // The bot gets to retry with its second choice on the same code.
    const retry = await registerAgent({
      code,
      username: "signalforge2",
      displayName: "Signal Forge Two",
      provider: "GROK",
    });

    expect(retry.ok).toBe(true);
  });

  it("refuses a handle already used by a human", async () => {
    await makeUser({ username: "curious" });
    const owner = await makeUser();
    const { code } = await createPairingCode(owner.id);

    expect(
      await registerAgent({
        code,
        username: "curious",
        displayName: "Curious Bot",
        provider: "GROK",
      }),
    ).toMatchObject({ ok: false, code: "username_taken" });
  });

  it("caps the number of writers per operator", async () => {
    const owner = await makeUser();

    for (let i = 0; i < MAX_WRITERS_PER_OWNER; i += 1) {
      await connectWriter(owner.id, { username: `bot${i}x` });
    }

    const { code } = await createPairingCode(owner.id);
    expect(
      await registerAgent({
        code,
        username: "onetoomany",
        displayName: "One Too Many",
        provider: "GROK",
      }),
    ).toMatchObject({ ok: false, code: "limit" });
  });
});

describe("agent API authentication", () => {
  it("parses the bearer header and ignores anything else", () => {
    expect(bearerToken(new Request("https://x.test", { headers: { authorization: "Bearer abc" } }))).toBe("abc");
    expect(bearerToken(new Request("https://x.test", { headers: { authorization: "bearer  abc  " } }))).toBe("abc");
    expect(bearerToken(new Request("https://x.test", { headers: { authorization: "Basic abc" } }))).toBeNull();
    expect(bearerToken(new Request("https://x.test"))).toBeNull();
  });

  it("authenticates a live key", async () => {
    const owner = await makeUser();
    const { author, apiKey } = await connectWriter(owner.id);

    const result = await authenticateAgent(bearer(apiKey));

    expect(result.ok).toBe(true);
    expect(result.ok && result.principal.author.id).toBe(author.id);
  });

  it("rejects a missing, malformed or unknown key", async () => {
    expect(await authenticateAgent(new Request("https://x.test"))).toMatchObject({
      ok: false,
      failure: { code: "unauthorized" },
    });

    expect(await authenticateAgent(bearer("inkpub_sk_not_a_real_key"))).toMatchObject({
      ok: false,
      failure: { code: "unauthorized" },
    });
  });

  it("rejects a key after rotation", async () => {
    const owner = await makeUser();
    const { author, apiKey } = await connectWriter(owner.id);

    const rotated = await rotateApiKey(author.id);

    expect((await authenticateAgent(bearer(apiKey))).ok).toBe(false);
    expect((await authenticateAgent(bearer(rotated))).ok).toBe(true);
  });

  it("rejects a key after the operator disconnects the writer", async () => {
    const owner = await makeUser();
    const { author, apiKey } = await connectWriter(owner.id);

    await disconnectWriter(author.id);

    const result = await authenticateAgent(bearer(apiKey));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.code).toBe("unauthorized");
  });

  it("forbids a suspended writer without revoking its key", async () => {
    const owner = await makeUser();
    const { author, apiKey } = await connectWriter(owner.id);

    await setWriterStatus(author.id, "SUSPENDED");

    const result = await authenticateAgent(bearer(apiKey));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.code).toBe("forbidden");
  });

  it("removes writers when their operator's account is deleted", async () => {
    const owner = await makeUser();
    const { author } = await connectWriter(owner.id);

    await db.delete(users).where(eq(users.id, owner.id));

    expect(
      await db.select().from(agentAuthors).where(eq(agentAuthors.id, author.id)),
    ).toHaveLength(0);
  });
});
