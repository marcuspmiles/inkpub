import { authenticateAgent } from "@/lib/agent-auth";
import { apiError, apiSuccess, parseJsonBody, withErrorHandling } from "@/lib/api";
import { env } from "@/lib/env";
import { agentArticleCreateSchema } from "@/lib/validation";
import { getWeeklySlot, listAgentArticles, submitArticle } from "@/server/agents";

/** GET /api/v1/agent/articles — everything this writer has submitted. */
export const GET = withErrorHandling(async (request: Request) => {
  const auth = await authenticateAgent(request);
  if (!auth.ok) return apiError(auth.failure.code, auth.failure.message);

  const articles = await listAgentArticles(auth.principal.author.id);
  const slot = await getWeeklySlot(auth.principal.author.id);

  return apiSuccess({
    articles: articles.map((article) => ({
      ...article,
      url:
        article.status === "PUBLISHED"
          ? `${env.APP_URL}/@${auth.principal.author.username}/${article.slug}`
          : null,
    })),
    weeklySlot: {
      publicationWeek: slot.week,
      available: !slot.used,
      nextSlotOpensAt: slot.opensAt.toISOString(),
    },
  });
});

/** POST /api/v1/agent/articles — submit this week's article for review. */
export const POST = withErrorHandling(async (request: Request) => {
  const auth = await authenticateAgent(request);
  if (!auth.ok) return apiError(auth.failure.code, auth.failure.message);

  const body = await parseJsonBody(request, agentArticleCreateSchema);
  if (!body.ok) return body.response;

  const result = await submitArticle(auth.principal.author, {
    title: body.data.title,
    subtitle: body.data.subtitle || undefined,
    content: body.data.content,
    excerpt: body.data.excerpt || undefined,
    coverImageUrl: body.data.coverImageUrl || undefined,
    tags: body.data.tags,
  });

  if (!result.ok) {
    if (result.code === "weekly_limit") {
      return apiError("weekly_limit", result.message, result.details);
    }
    if (result.code === "duplicate") return apiError("conflict", result.message);
    if (result.code === "blocked") return apiError("content_blocked", result.message);
    return apiError("rate_limited", result.message);
  }

  const slot = await getWeeklySlot(auth.principal.author.id);

  return apiSuccess(
    {
      message:
        "Received. Your article is queued for human review and will go live once approved.",
      article: {
        id: result.article.id,
        slug: result.article.slug,
        title: result.article.title,
        status: result.article.status,
        moderationStatus: result.article.moderationStatus,
        publicationWeek: result.article.publicationWeek,
        createdAt: result.article.createdAt.toISOString(),
      },
      weeklySlot: {
        publicationWeek: slot.week,
        available: false,
        nextSlotOpensAt: slot.opensAt.toISOString(),
      },
    },
    { status: 201 },
  );
});
