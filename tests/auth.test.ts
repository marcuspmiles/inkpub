import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import {
  createSession,
  destroyAllSessions,
  destroySession,
  hashPassword,
  purgeExpiredSessions,
  verifyPassword,
} from "@/lib/auth";
import { hashSessionToken } from "@/lib/tokens";
import { createUser, isUsernameTaken } from "@/server/accounts";

import { connectWriter, makeUser } from "./helpers";

describe("password hashing", () => {
  it("produces an argon2id hash, never the plaintext", async () => {
    const hash = await hashPassword("correct-horse-battery");

    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain("correct-horse-battery");
  });

  it("salts every hash so identical passwords differ", async () => {
    const [a, b] = await Promise.all([
      hashPassword("correct-horse-battery"),
      hashPassword("correct-horse-battery"),
    ]);

    expect(a).not.toBe(b);
  });

  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("correct-horse-battery");

    expect(await verifyPassword(hash, "correct-horse-battery")).toBe(true);
    expect(await verifyPassword(hash, "Correct-horse-battery")).toBe(false);
    expect(await verifyPassword(hash, "")).toBe(false);
  });

  it("returns false rather than throwing on a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });
});

describe("signup", () => {
  it("creates an account and stores only the hash", async () => {
    const result = await createUser({
      email: "reader@example.com",
      username: "curious_reader",
      displayName: "Curious Reader",
      password: "correct-horse-battery",
    });

    expect(result.ok).toBe(true);

    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.username, "curious_reader"));

    expect(row!.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(row!.role).toBe("USER");
  });

  it("rejects a duplicate email regardless of case", async () => {
    await makeUser({ email: "taken@example.com" });

    const result = await createUser({
      email: "TAKEN@example.com",
      username: "someone_else",
      displayName: "Someone Else",
      password: "correct-horse-battery",
    });

    expect(result).toMatchObject({ ok: false, field: "email" });
  });

  it("rejects a duplicate human handle", async () => {
    await makeUser({ username: "curious_reader" });

    const result = await createUser({
      email: "new@example.com",
      username: "Curious_Reader",
      displayName: "Impostor",
      password: "correct-horse-battery",
    });

    expect(result).toMatchObject({ ok: false, field: "username" });
  });

  it("refuses a handle already claimed by an AI writer", async () => {
    const owner = await makeUser();
    await connectWriter(owner.id, { username: "signalforge" });

    expect(await isUsernameTaken("SignalForge")).toBe(true);

    const result = await createUser({
      email: "impostor@example.com",
      username: "signalforge",
      displayName: "Impostor",
      password: "correct-horse-battery",
    });

    expect(result).toMatchObject({ ok: false, field: "username" });
  });

  it("never assigns ADMIN unless asked for explicitly", async () => {
    const result = await createUser({
      email: "reader@example.com",
      username: "curious_reader",
      displayName: "Curious Reader",
      password: "correct-horse-battery",
    });

    expect(result.ok).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.username, "curious_reader"));
    expect(row!.role).toBe("USER");
  });
});

describe("login", () => {
  it("accepts the correct password for a stored account", async () => {
    const user = await makeUser({ password: "correct-horse-battery" });

    const [row] = await db.select().from(users).where(eq(users.id, user.id));

    expect(await verifyPassword(row!.passwordHash, "correct-horse-battery")).toBe(true);
    expect(await verifyPassword(row!.passwordHash, "wrong-password-here")).toBe(false);
  });
});

describe("sessions", () => {
  it("stores only a hash of the session token", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id);

    const [row] = await db.select().from(sessions).where(eq(sessions.userId, user.id));

    expect(row!.tokenHash).not.toBe(token);
    expect(row!.tokenHash).toBe(hashSessionToken(token));
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes the IP rather than storing it", async () => {
    const user = await makeUser();
    await createSession(user.id, { ip: "203.0.113.7", userAgent: "vitest" });

    const [row] = await db.select().from(sessions).where(eq(sessions.userId, user.id));

    expect(row!.ipHash).toBeTruthy();
    expect(row!.ipHash).not.toContain("203.0.113");
  });

  it("expires roughly thirty days out", async () => {
    const user = await makeUser();
    const { expiresAt } = await createSession(user.id);

    const days = (expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.5);
    expect(days).toBeLessThan(30.5);
  });

  it("issues a distinct token every time", async () => {
    const user = await makeUser();
    const [a, b] = [await createSession(user.id), await createSession(user.id)];

    expect(a.token).not.toBe(b.token);
  });

  it("revokes a single session on logout", async () => {
    const user = await makeUser();
    const keep = await createSession(user.id);
    const drop = await createSession(user.id);

    await destroySession(drop.token);

    const rows = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashSessionToken(keep.token));
  });

  it("revokes every session for an account", async () => {
    const user = await makeUser();
    await createSession(user.id);
    await createSession(user.id);

    await destroyAllSessions(user.id);

    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
  });

  it("deletes sessions with the account", async () => {
    const user = await makeUser();
    await createSession(user.id);

    await db.delete(users).where(eq(users.id, user.id));

    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
  });

  it("purges expired rows", async () => {
    const user = await makeUser();
    await createSession(user.id);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, user.id));

    await purgeExpiredSessions();

    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
  });
});
