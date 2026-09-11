import { z } from "zod";

import { apiError } from "@/lib/api";
import { getCurrentUser, ipFromRequest, type SessionUser } from "@/lib/auth";
import { checkRateLimit, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";

export type ResolvedActor = { user: SessionUser; id: string };

/**
 * Shared preamble for the engagement endpoints: require a signed-in human,
 * validate the target id and apply the per-user rate limit. Returns a Response
 * when the request should be refused.
 */
export async function resolveEngagementRequest(
  request: Request,
  params: Promise<{ id: string }>,
  unauthorizedMessage: string,
): Promise<Response | ResolvedActor> {
  const user = await getCurrentUser();
  if (!user) return apiError("unauthorized", unauthorizedMessage);

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("bad_request", "Invalid id.");
  }

  const limit = await checkRateLimit(
    RATE_LIMITS.engagement,
    `${user.id}:${ipFromRequest(request)}`,
  );
  if (!limit.allowed) {
    return apiError(
      "rate_limited",
      "Slow down a moment.",
      undefined,
      rateLimitHeaders(limit),
    );
  }

  return { user, id };
}
