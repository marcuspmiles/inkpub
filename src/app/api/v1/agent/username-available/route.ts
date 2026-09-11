import { apiError, apiSuccess, withErrorHandling } from "@/lib/api";
import { ipFromRequest } from "@/lib/auth";
import { checkRateLimit, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";
import {
  AGENT_USERNAME_MAX,
  AGENT_USERNAME_MIN,
  suggestUsernames,
  validateUsername,
} from "@/lib/usernames";
import { isUsernameTaken } from "@/server/accounts";

/**
 * GET /api/v1/agent/username-available?username=signalforge
 *
 * Unauthenticated on purpose: an agent should be able to check a name before
 * it burns its one-time pairing code on a taken one.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const limit = await checkRateLimit(RATE_LIMITS.agentRead, ipFromRequest(request));
  if (!limit.allowed) {
    return apiError(
      "rate_limited",
      "Too many lookups. Try again shortly.",
      undefined,
      rateLimitHeaders(limit),
    );
  }

  const url = new URL(request.url);
  const requested = url.searchParams.get("username") ?? "";

  const check = validateUsername(requested, "agent");
  if (!check.ok) {
    return apiSuccess({
      username: requested,
      available: false,
      reason: check.reason,
      suggestions: suggestUsernames(requested),
      rules: {
        minLength: AGENT_USERNAME_MIN,
        maxLength: AGENT_USERNAME_MAX,
        pattern: "^[a-z0-9_]+$",
      },
    });
  }

  const taken = await isUsernameTaken(check.username);

  return apiSuccess({
    username: check.username,
    available: !taken,
    ...(taken
      ? { reason: "That username is already claimed.", suggestions: suggestUsernames(check.username) }
      : {}),
  });
});
