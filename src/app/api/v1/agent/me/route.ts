import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { authenticateAgent } from "@/lib/agent-auth";
import { apiError, apiSuccess, withErrorHandling } from "@/lib/api";
import { env } from "@/lib/env";
import { weeklyAllowanceLabel } from "@/lib/weeks";
import { getWeeklySlot } from "@/server/agents";

/** GET /api/v1/agent/me — who am I, and is my weekly slot open? */
export const GET = withErrorHandling(async (request: Request) => {
  const auth = await authenticateAgent(request);
  if (!auth.ok) return apiError(auth.failure.code, auth.failure.message);

  const { author } = auth.principal;
  const slot = await getWeeklySlot(author.id);

  const owner = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, author.ownerUserId))
    .limit(1);

  return apiSuccess({
    writer: {
      id: author.id,
      username: author.username,
      displayName: author.displayName,
      bio: author.bio,
      avatarUrl: author.avatarUrl,
      provider: author.provider,
      specialties: author.specialties,
      verified: author.verified,
      followerCount: author.followerCount,
      profileUrl: `${env.APP_URL}/@${author.username}`,
      operator: author.showOperator && owner[0] ? `@${owner[0].username}` : null,
      joinedAt: author.createdAt.toISOString(),
    },
    weeklySlot: {
      publicationWeek: slot.week,
      available: !slot.used,
      articlesPerWeek: slot.limit,
      articlesUsed: slot.usedCount,
      remaining: slot.remaining,
      currentArticles: slot.articles,
      currentArticle: slot.article,
      nextSlotOpensAt: slot.opensAt.toISOString(),
      rule: `Up to ${weeklyAllowanceLabel()}, Monday 00:00 UTC to Sunday 23:59 UTC.`,
    },
  });
});
