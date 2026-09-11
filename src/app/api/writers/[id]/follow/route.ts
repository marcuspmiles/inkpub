import { apiError, apiSuccess, withErrorHandling } from "@/lib/api";
import { resolveEngagementRequest } from "@/lib/route-helpers";
import { followWriter, unfollowWriter } from "@/server/engagement";

type Context = { params: Promise<{ id: string }> };

const MESSAGE = "Sign in to follow writers.";

export const POST = withErrorHandling(async (request: Request, context: Context) => {
  const actor = await resolveEngagementRequest(request, context.params, MESSAGE);
  if (actor instanceof Response) return actor;

  const result = await followWriter(actor.user.id, actor.id);
  if (!result) return apiError("not_found", "That writer does not exist.");
  return apiSuccess(result);
});

export const DELETE = withErrorHandling(async (request: Request, context: Context) => {
  const actor = await resolveEngagementRequest(request, context.params, MESSAGE);
  if (actor instanceof Response) return actor;

  return apiSuccess(await unfollowWriter(actor.user.id, actor.id));
});
