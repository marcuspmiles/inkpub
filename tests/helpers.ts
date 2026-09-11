import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { agentApiKeys, agentAuthors, users, type AgentAuthor } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { createPairingCode, registerAgent } from "@/server/agents";

/** Shared factories. Every helper writes real rows — nothing here is mocked. */

let counter = 0;
const next = () => (counter += 1);

export async function makeUser(
  overrides: Partial<{
    email: string;
    username: string;
    displayName: string;
    password: string;
    role: "USER" | "ADMIN";
  }> = {},
) {
  const n = next();
  const password = overrides.password ?? "correct-horse-battery";

  const [user] = await db
    .insert(users)
    .values({
      email: overrides.email ?? `user${n}@example.com`,
      username: overrides.username ?? `human_${n}`,
      displayName: overrides.displayName ?? `Human ${n}`,
      passwordHash: await hashPassword(password),
      role: overrides.role ?? "USER",
    })
    .returning();

  return { ...user!, password };
}

/** Runs the real pairing-code flow, so tests exercise the production path. */
export async function connectWriter(
  ownerUserId: string,
  overrides: Partial<{ username: string; displayName: string }> = {},
): Promise<{ author: AgentAuthor; apiKey: string }> {
  const n = next();
  const { code } = await createPairingCode(ownerUserId);

  const result = await registerAgent({
    code,
    username: overrides.username ?? `bot${n}`,
    displayName: overrides.displayName ?? `Bot ${n}`,
    provider: "GROK",
  });

  if (!result.ok) throw new Error(`connectWriter failed: ${result.message}`);
  return { author: result.author, apiKey: result.apiKey };
}

export async function revokeKeys(agentAuthorId: string) {
  await db
    .update(agentApiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(agentApiKeys.agentAuthorId, agentAuthorId));
}

export async function setWriterStatus(
  agentAuthorId: string,
  status: "ACTIVE" | "SUSPENDED" | "DISCONNECTED",
) {
  await db.update(agentAuthors).set({ status }).where(eq(agentAuthors.id, agentAuthorId));
}

export function bearer(token: string, init: RequestInit = {}) {
  return new Request("https://inkpub.test/api/v1/agent/me", {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
}

/** Body long enough to satisfy the 600-character minimum. */
export function articleBody(topic = "systems"): string {
  return (
    `## On ${topic}\n\n` +
    `This is a demonstration article about ${topic}, written for the automated ` +
    "test suite. It needs to be long enough to clear the minimum body length " +
    "that the agent publishing schema enforces, which is six hundred characters, " +
    "so it continues for several sentences of ordinary editorial prose.\n\n" +
    "The point of the length requirement is to keep one-line spam submissions " +
    "out of the review queue without imposing an arbitrary editorial standard on " +
    "the writers themselves. A genuine article clears it without trying.\n\n" +
    "Here is a third paragraph so that the reading-time estimate resolves to " +
    "something sensible and the excerpt builder has real sentences to work with " +
    "when no explicit excerpt was supplied by the agent."
  );
}
