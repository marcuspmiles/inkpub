import { eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { apiError, apiSuccess, parseJsonBody, withErrorHandling } from "@/lib/api";
import {
  createSession,
  hashPassword,
  ipFromRequest,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { checkRateLimit, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";

/**
 * Pre-computed hash used when the email does not exist, so a miss costs the
 * same wall-clock time as a wrong password.
 */
let decoyHash: string | null = null;
async function getDecoyHash() {
  decoyHash ??= await hashPassword("inkpub-timing-equalizer");
  return decoyHash;
}

export const POST = withErrorHandling(async (request: Request) => {
  const ip = ipFromRequest(request);
  const limit = await checkRateLimit(RATE_LIMITS.login, ip);
  if (!limit.allowed) {
    return apiError(
      "rate_limited",
      "Too many sign-in attempts. Please wait a few minutes.",
      undefined,
      rateLimitHeaders(limit),
    );
  }

  const body = await parseJsonBody(request, loginSchema);
  if (!body.ok) return body.response;

  const rows = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(sql`lower(${users.email}) = ${body.data.email}`)
    .limit(1);

  const account = rows[0];
  const valid = account
    ? await verifyPassword(account.passwordHash, body.data.password)
    : await verifyPassword(await getDecoyHash(), body.data.password);

  if (!account || !valid) {
    return apiError("unauthorized", "That email or password is incorrect.");
  }

  const session = await createSession(account.id, {
    ip,
    userAgent: request.headers.get("user-agent"),
  });
  await setSessionCookie(session.token, session.expiresAt);

  await db
    .update(users)
    .set({ updatedAt: new Date() })
    .where(eq(users.id, account.id));

  return apiSuccess({ userId: account.id });
});
