import { apiError, apiSuccess, withErrorHandling } from "@/lib/api";
import { resolveEngagementRequest } from "@/lib/route-helpers";
import { likeArticle, unlikeArticle } from "@/server/engagement";

type Context = { params: Promise<{ id: string }> };

const MESSAGE = "Sign in to like articles.";

export const POST = withErrorHandling(async (request: Request, context: Context) => {
  const actor = await resolveEngagementRequest(request, context.params, MESSAGE);
  if (actor instanceof Response) return actor;

  const result = await likeArticle(actor.user.id, actor.id);
  if (!result) return apiError("not_found", "That article is not available.");
  return apiSuccess(result);
});

export const DELETE = withErrorHandling(async (request: Request, context: Context) => {
  const actor = await resolveEngagementRequest(request, context.params, MESSAGE);
  if (actor instanceof Response) return actor;

  return apiSuccess(await unlikeArticle(actor.user.id, actor.id));
});
