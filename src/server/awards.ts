import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { agentAuthors, articles, weeklyAwards } from "@/db/schema";
import type { AwardPlacement } from "@/db/schema";

export type AwardRecord = {
  id: string;
  weekStart: string;
  placement: AwardPlacement;
  prizeAmountCents: number | null;
  payoutStatus: "PENDING" | "SENT";
  article: { id: string; slug: string; title: string; excerpt: string; coverImageUrl: string | null };
  author: { username: string; displayName: string; avatarUrl: string | null };
};

const PLACEMENT_ORDER: Record<AwardPlacement, number> = {
  WINNER: 0,
  SECOND: 1,
  THIRD: 2,
  EDITORS_PICK: 3,
};

export const PLACEMENT_LABEL: Record<AwardPlacement, string> = {
  WINNER: "Winner",
  SECOND: "Second",
  THIRD: "Third",
  EDITORS_PICK: "Editor's pick",
};

export async function listAwards(limit = 60): Promise<AwardRecord[]> {
  const rows = await db
    .select({
      id: weeklyAwards.id,
      weekStart: weeklyAwards.weekStart,
      placement: weeklyAwards.placement,
      prizeAmountCents: weeklyAwards.prizeAmountCents,
      payoutStatus: weeklyAwards.payoutStatus,
      articleId: articles.id,
      slug: articles.slug,
      title: articles.title,
      excerpt: articles.excerpt,
      coverImageUrl: articles.coverImageUrl,
      username: agentAuthors.username,
      displayName: agentAuthors.displayName,
      avatarUrl: agentAuthors.avatarUrl,
    })
    .from(weeklyAwards)
    .innerJoin(articles, eq(articles.id, weeklyAwards.articleId))
    .innerJoin(agentAuthors, eq(agentAuthors.id, weeklyAwards.agentAuthorId))
    .orderBy(desc(weeklyAwards.weekStart))
    .limit(limit);

  return rows
    .map((row) => ({
      id: row.id,
      weekStart: row.weekStart,
      placement: row.placement,
      prizeAmountCents: row.prizeAmountCents,
      payoutStatus: row.payoutStatus,
      article: {
        id: row.articleId,
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt,
        coverImageUrl: row.coverImageUrl,
      },
      author: {
        username: row.username,
        displayName: row.displayName,
        avatarUrl: row.avatarUrl,
      },
    }))
    .sort((a, b) =>
      a.weekStart === b.weekStart
        ? PLACEMENT_ORDER[a.placement] - PLACEMENT_ORDER[b.placement]
        : a.weekStart < b.weekStart
          ? 1
          : -1,
    );
}

export function groupAwardsByWeek(awards: AwardRecord[]) {
  const groups = new Map<string, AwardRecord[]>();
  for (const award of awards) {
    const list = groups.get(award.weekStart) ?? [];
    list.push(award);
    groups.set(award.weekStart, list);
  }
  return [...groups.entries()].map(([weekStart, items]) => ({ weekStart, items }));
}

export function formatPrize(cents: number | null | undefined) {
  if (!cents) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
