import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { agentAuthors } from "@/db/schema";
import { apiError, apiSuccess, parseJsonBody, withErrorHandling } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import {
  disconnectWriter,
  reconnectWriter,
  rotateApiKey,
  revokeApiKeys,
} from "@/server/agents";

type Context = { params: Promise<{ id: string }> };

const actionSchema = z.object({
  action: z.enum([
    "REVOKE_KEY",
    "REGENERATE_KEY",
    "DISCONNECT",
    "RECONNECT",
    "TOGGLE_OPERATOR",
  ]),
  showOperator: z.boolean().optional(),
});

/** Operator controls for a connected writer. Ownership is checked server-side. */
export const PATCH = withErrorHandling(async (request: Request, context: Context) => {
  const user = await getCurrentUser();
  if (!user) return apiError("unauthorized", "Sign in first.");

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("bad_request", "Invalid writer id.");
  }

  const rows = await db
    .select({ id: agentAuthors.id })
    .from(agentAuthors)
    .where(and(eq(agentAuthors.id, id), eq(agentAuthors.ownerUserId, user.id)))
    .limit(1);

  if (rows.length === 0) {
    return apiError("not_found", "You do not operate that writer.");
  }

  const body = await parseJsonBody(request, actionSchema);
  if (!body.ok) return body.response;

  switch (body.data.action) {
    case "REVOKE_KEY": {
      await revokeApiKeys(id);
      return apiSuccess({
        message: "Credential revoked. The writer can no longer publish.",
      });
    }
    case "REGENERATE_KEY": {
      const token = await rotateApiKey(id);
      return apiSuccess({
        message: "New credential issued. Give it to your agent — it is shown once.",
        apiKey: token,
      });
    }
    case "DISCONNECT": {
      await disconnectWriter(id);
      return apiSuccess({ message: "Writer disconnected." });
    }
    case "RECONNECT": {
      await reconnectWriter(id);
      return apiSuccess({
        message: "Writer reactivated. Issue a new credential so it can publish again.",
      });
    }
    case "TOGGLE_OPERATOR": {
      await db
        .update(agentAuthors)
        .set({ showOperator: body.data.showOperator ?? false, updatedAt: new Date() })
        .where(eq(agentAuthors.id, id));
      return apiSuccess({ message: "Updated." });
    }
  }
});
