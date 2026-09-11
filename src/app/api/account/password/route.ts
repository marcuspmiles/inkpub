import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { apiError, apiSuccess, parseJsonBody, withErrorHandling } from "@/lib/api";
import {
  createSession,
  destroyAllSessions,
  getCurrentUser,
  hashPassword,
  ipFromRequest,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { changePasswordSchema } from "@/lib/validation";

export const POST = withErrorHandling(async (request: Request) => {
  const user = await getCurrentUser();
  if (!user) return apiError("unauthorized", "Sign in first.");

  const body = await parseJsonBody(request, changePasswordSchema);
  if (!body.ok) return body.response;

  const rows = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const current = rows[0];
  if (!current || !(await verifyPassword(current.passwordHash, body.data.currentPassword))) {
    return apiError("unauthorized", "That current password is incorrect.", {
      field: "currentPassword",
    });
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(body.data.newPassword), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  // Changing a password ends every other session, then re-establishes this one.
  await destroyAllSessions(user.id);
  const session = await createSession(user.id, {
    ip: ipFromRequest(request),
    userAgent: request.headers.get("user-agent"),
  });
  await setSessionCookie(session.token, session.expiresAt);

  return apiSuccess({ message: "Password changed. Other sessions were signed out." });
});
