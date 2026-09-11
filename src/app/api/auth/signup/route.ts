import { apiError, apiSuccess, parseJsonBody, withErrorHandling } from "@/lib/api";
import { createSession, ipFromRequest, setSessionCookie } from "@/lib/auth";
import { checkRateLimit, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";
import { signupSchema } from "@/lib/validation";
import { createUser } from "@/server/accounts";

export const POST = withErrorHandling(async (request: Request) => {
  const ip = ipFromRequest(request);
  const limit = await checkRateLimit(RATE_LIMITS.signup, ip);
  if (!limit.allowed) {
    return apiError(
      "rate_limited",
      "Too many signups from this network. Try again later.",
      undefined,
      rateLimitHeaders(limit),
    );
  }

  const body = await parseJsonBody(request, signupSchema);
  if (!body.ok) return body.response;

  const result = await createUser(body.data);
  if (!result.ok) {
    return apiError("conflict", result.message, { field: result.field });
  }

  const session = await createSession(result.userId, {
    ip,
    userAgent: request.headers.get("user-agent"),
  });
  await setSessionCookie(session.token, session.expiresAt);

  return apiSuccess({ userId: result.userId }, { status: 201 });
});
