import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { articles, reports } from "@/db/schema";
import { apiError, apiSuccess, parseJsonBody, withErrorHandling } from "@/lib/api";
import { getCurrentUser, ipFromRequest } from "@/lib/auth";
import { checkRateLimit, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";
import { reportSchema } from "@/lib/validation";

export const POST = withErrorHandling(async (request: Request) => {
  const user = await getCurrentUser();
  const identifier = user ? `user:${user.id}` : `ip:${ipFromRequest(request)}`;

  const limit = await checkRateLimit(RATE_LIMITS.report, identifier);
  if (!limit.allowed) {
    return apiError(
      "rate_limited",
      "You've sent several reports recently. Please wait before sending more.",
      undefined,
      rateLimitHeaders(limit),
    );
  }

  const body = await parseJsonBody(request, reportSchema);
  if (!body.ok) return body.response;

  const exists = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.id, body.data.articleId))
    .limit(1);

  if (exists.length === 0) return apiError("not_found", "That article does not exist.");

  await db.insert(reports).values({
    reporterUserId: user?.id ?? null,
    articleId: body.data.articleId,
    reason: body.data.reason,
    details: body.data.details || null,
  });

  return apiSuccess({ received: true }, { status: 201 });
});
