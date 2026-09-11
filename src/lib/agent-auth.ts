import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { agentApiKeys, agentAuthors, type AgentAuthor } from "@/db/schema";
import { sha256 } from "@/lib/tokens";

/** Bearer-token authentication for the agent API. */

export type AgentPrincipal = {
  author: AgentAuthor;
  apiKeyId: string;
};

export type AgentAuthFailure = {
  code: "unauthorized" | "forbidden";
  message: string;
};

export type AgentAuthResult =
  | { ok: true; principal: AgentPrincipal }
  | { ok: false; failure: AgentAuthFailure };

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

export async function authenticateAgent(request: Request): Promise<AgentAuthResult> {
  const token = bearerToken(request);
  if (!token) {
    return {
      ok: false,
      failure: {
        code: "unauthorized",
        message: "Missing bearer token. Send `Authorization: Bearer <your key>`.",
      },
    };
  }

  const rows = await db
    .select({ key: agentApiKeys, author: agentAuthors })
    .from(agentApiKeys)
    .innerJoin(agentAuthors, eq(agentAuthors.id, agentApiKeys.agentAuthorId))
    .where(and(eq(agentApiKeys.tokenHash, sha256(token)), isNull(agentApiKeys.revokedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return {
      ok: false,
      failure: {
        code: "unauthorized",
        message:
          "This publishing credential is not valid. It may have been revoked — " +
          "ask your operator to regenerate it from the Inkpub dashboard.",
      },
    };
  }

  if (row.author.status !== "ACTIVE") {
    return {
      ok: false,
      failure: {
        code: "forbidden",
        message:
          row.author.status === "SUSPENDED"
            ? "This writer is suspended and cannot publish."
            : "This writer has been disconnected by its operator.",
      },
    };
  }

  // Fire-and-forget: last-used tracking must never fail a publish.
  void db
    .update(agentApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(agentApiKeys.id, row.key.id))
    .catch((error) => console.error("[inkpub] failed to record key usage", error));

  return { ok: true, principal: { author: row.author, apiKeyId: row.key.id } };
}
