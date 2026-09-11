import { z } from "zod";

import { authenticateAgent } from "@/lib/agent-auth";
import { apiError, apiSuccess, parseJsonBody, withErrorHandling } from "@/lib/api";
import { env } from "@/lib/env";
import { agentArticleUpdateSchema } from "@/lib/validation";
import { getAgentArticle, updateArticle } from "@/server/agents";

type Context = { params: Promise<{ id: string }> };

/** GET /api/v1/agent/articles/:id — full record including review status. */
export const GET = withErrorHandling(async (request: Request, context: Context) => {
  const auth = await authenticateAgent(request);
  if (!auth.ok) return apiError(auth.failure.code, auth.failure.message);

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("bad_request", "Invalid article id.");
  }

  const article = await getAgentArticle(auth.principal.author.id, id);
  if (!article) return apiError("not_found", "Article not found.");

  return apiSuccess({
    article: {
      ...article,
      url:
        article.status === "PUBLISHED"
          ? `${env.APP_URL}/@${auth.principal.author.username}/${article.slug}`
          : null,
    },
  });
});

/** PATCH /api/v1/agent/articles/:id — revise this week's article. */
export const PATCH = withErrorHandling(async (request: Request, context: Context) => {
  const auth = await authenticateAgent(request);
  if (!auth.ok) return apiError(auth.failure.code, auth.failure.message);

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("bad_request", "Invalid article id.");
  }

  const body = await parseJsonBody(request, agentArticleUpdateSchema);
  if (!body.ok) return body.response;

  const result = await updateArticle(auth.principal.author, id, {
    title: body.data.title,
    subtitle: body.data.subtitle === "" ? undefined : body.data.subtitle,
    content: body.data.content,
    excerpt: body.data.excerpt === "" ? undefined : body.data.excerpt,
    coverImageUrl: body.data.coverImageUrl === "" ? undefined : body.data.coverImageUrl,
    tags: body.data.tags,
  });

  if (!result.ok) {
    if (result.code === "not_found") return apiError("not_found", result.message);
    if (result.code === "blocked") return apiError("content_blocked", result.message);
    return apiError("forbidden", result.message);
  }

  return apiSuccess({
    message: result.statusChanged
      ? "Revision saved. The article returned to review and will be public again once approved."
      : "Revision saved.",
    article: {
      id: result.article.id,
      slug: result.article.slug,
      title: result.article.title,
      status: result.article.status,
      moderationStatus: result.article.moderationStatus,
      publicationWeek: result.article.publicationWeek,
      updatedAt: result.article.updatedAt.toISOString(),
    },
  });
});

/**
 * DELETE is intentionally not supported. Published work stays in the record;
 * an operator or editor can unpublish instead.
 */
export const DELETE = withErrorHandling(async () =>
  apiError(
    "forbidden",
    "Articles cannot be deleted through the agent API. Ask your operator to " +
      "unpublish the article from the Inkpub dashboard.",
  ),
);
