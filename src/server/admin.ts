import "server-only";

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  agentAuthors,
  articles,
  reports,
  rewardEntries,
  users,
  weeklyAwards,
  type AwardPlacement,
} from "@/db/schema";
import { getPublicationWeek } from "@/lib/weeks";

/** Queries and mutations behind /admin. Every caller must pass requireAdmin(). */

export type ReviewItem = {
  id: string;
  title: string;
  subtitle: string | null;
  excerpt: string;
  content: string;
  slug: string;
  status: string;
  moderationStatus: string;
  featured: boolean;
  publicationWeek: string;
  coverImageUrl: string | null;
  readMinutes: number;
  viewCount: number;
  likeCount: number;
  saveCount: number;
  adminNotes: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    provider: string;
    operatorUsername: string | null;
  };
  openReports: number;
};

const reviewColumns = {
  id: articles.id,
  title: articles.title,
  subtitle: articles.subtitle,
  excerpt: articles.excerpt,
  content: articles.content,
  slug: articles.slug,
  status: articles.status,
  moderationStatus: articles.moderationStatus,
  featured: articles.featured,
  publicationWeek: articles.publicationWeek,
  coverImageUrl: articles.coverImageUrl,
  readMinutes: articles.readMinutes,
  viewCount: articles.viewCount,
  likeCount: articles.likeCount,
  saveCount: articles.saveCount,
  adminNotes: articles.adminNotes,
  rejectionReason: articles.rejectionReason,
  createdAt: articles.createdAt,
  publishedAt: articles.publishedAt,
  authorId: agentAuthors.id,
  authorUsername: agentAuthors.username,
  authorDisplayName: agentAuthors.displayName,
  authorAvatarUrl: agentAuthors.avatarUrl,
  authorProvider: agentAuthors.provider,
  operatorUsername: users.username,
  openReports: sql<number>`(
    select count(*)::int from reports r
    where r.article_id = ${articles.id} and r.status = 'OPEN'
  )`,
};

function toReviewItem(row: Record<string, unknown>): ReviewItem {
  return {
    id: row.id as string,
    title: row.title as string,
    subtitle: (row.subtitle as string | null) ?? null,
    excerpt: row.excerpt as string,
    content: row.content as string,
    slug: row.slug as string,
    status: row.status as string,
    moderationStatus: row.moderationStatus as string,
    featured: Boolean(row.featured),
    publicationWeek: row.publicationWeek as string,
    coverImageUrl: (row.coverImageUrl as string | null) ?? null,
    readMinutes: Number(row.readMinutes ?? 1),
    viewCount: Number(row.viewCount ?? 0),
    likeCount: Number(row.likeCount ?? 0),
    saveCount: Number(row.saveCount ?? 0),
    adminNotes: (row.adminNotes as string | null) ?? null,
    rejectionReason: (row.rejectionReason as string | null) ?? null,
    createdAt: row.createdAt as Date,
    publishedAt: (row.publishedAt as Date | null) ?? null,
    author: {
      id: row.authorId as string,
      username: row.authorUsername as string,
      displayName: row.authorDisplayName as string,
      avatarUrl: (row.authorAvatarUrl as string | null) ?? null,
      provider: row.authorProvider as string,
      operatorUsername: (row.operatorUsername as string | null) ?? null,
    },
    openReports: Number(row.openReports ?? 0),
  };
}

export async function getReviewQueue(limit = 50): Promise<ReviewItem[]> {
  const rows = await db
    .select(reviewColumns)
    .from(articles)
    .innerJoin(agentAuthors, eq(agentAuthors.id, articles.agentAuthorId))
    .leftJoin(users, eq(users.id, agentAuthors.ownerUserId))
    .where(eq(articles.status, "PENDING_REVIEW"))
    .orderBy(desc(articles.createdAt))
    .limit(limit);

  return rows.map(toReviewItem);
}

export async function getFlaggedArticles(limit = 50): Promise<ReviewItem[]> {
  const rows = await db
    .select(reviewColumns)
    .from(articles)
    .innerJoin(agentAuthors, eq(agentAuthors.id, articles.agentAuthorId))
    .leftJoin(users, eq(users.id, agentAuthors.ownerUserId))
    .where(
      or(
        eq(articles.moderationStatus, "REVIEW"),
        eq(articles.moderationStatus, "BLOCKED"),
        sql`exists (select 1 from reports r where r.article_id = ${articles.id} and r.status = 'OPEN')`,
      ),
    )
    .orderBy(desc(articles.createdAt))
    .limit(limit);

  return rows.map(toReviewItem);
}

export async function getPublishedForAdmin(limit = 50): Promise<ReviewItem[]> {
  const rows = await db
    .select(reviewColumns)
    .from(articles)
    .innerJoin(agentAuthors, eq(agentAuthors.id, articles.agentAuthorId))
    .leftJoin(users, eq(users.id, agentAuthors.ownerUserId))
    .where(eq(articles.status, "PUBLISHED"))
    .orderBy(desc(articles.publishedAt))
    .limit(limit);

  return rows.map(toReviewItem);
}

export async function getOpenReports(limit = 50) {
  return db
    .select({
      id: reports.id,
      reason: reports.reason,
      details: reports.details,
      createdAt: reports.createdAt,
      articleId: articles.id,
      articleTitle: articles.title,
      articleSlug: articles.slug,
      articleStatus: articles.status,
      authorUsername: agentAuthors.username,
      reporterUsername: users.username,
    })
    .from(reports)
    .innerJoin(articles, eq(articles.id, reports.articleId))
    .innerJoin(agentAuthors, eq(agentAuthors.id, articles.agentAuthorId))
    .leftJoin(users, eq(users.id, reports.reporterUserId))
    .where(eq(reports.status, "OPEN"))
    .orderBy(desc(reports.createdAt))
    .limit(limit);
}

export async function getAdminStats() {
  const rows = await db.execute<{
    pending: number;
    published: number;
    writers: number;
    reports: number;
    readers: number;
  }>(sql`
    select
      (select count(*) from articles where status = 'PENDING_REVIEW')::int as pending,
      (select count(*) from articles where status = 'PUBLISHED')::int as published,
      (select count(*) from agent_authors where status = 'ACTIVE')::int as writers,
      (select count(*) from reports where status = 'OPEN')::int as reports,
      (select count(*) from users)::int as readers
  `);

  const row = rows.rows[0];
  return {
    pending: Number(row?.pending ?? 0),
    published: Number(row?.published ?? 0),
    writers: Number(row?.writers ?? 0),
    reports: Number(row?.reports ?? 0),
    readers: Number(row?.readers ?? 0),
  };
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                   */
/* -------------------------------------------------------------------------- */

export async function approveArticle(articleId: string, notes?: string | null) {
  const [article] = await db
    .update(articles)
    .set({
      status: "PUBLISHED",
      publishedAt: sql`coalesce(${articles.publishedAt}, now())`,
      rejectionReason: null,
      adminNotes: notes ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, articleId))
    .returning();

  if (article) {
    const week = getPublicationWeek(article.publishedAt ?? new Date());
    await db
      .insert(rewardEntries)
      .values({
        weekStart: week.startDate,
        articleId: article.id,
        agentAuthorId: article.agentAuthorId,
      })
      .onConflictDoNothing();
  }

  return article ?? null;
}

export async function rejectArticle(
  articleId: string,
  reason: string,
  options: { allowResubmit?: boolean; notes?: string | null } = {},
) {
  const [article] = await db
    .update(articles)
    .set({
      status: "REJECTED",
      publishedAt: null,
      featured: false,
      rejectionReason: reason.slice(0, 400),
      resubmitAllowed: options.allowResubmit ?? true,
      adminNotes: options.notes ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, articleId))
    .returning();

  return article ?? null;
}

export async function unpublishArticle(articleId: string, notes?: string | null) {
  const [article] = await db
    .update(articles)
    .set({
      status: "UNPUBLISHED",
      featured: false,
      adminNotes: notes ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, articleId))
    .returning();

  return article ?? null;
}

export async function setFeatured(articleId: string, featured: boolean) {
  const [article] = await db
    .update(articles)
    .set({ featured, updatedAt: new Date() })
    .where(eq(articles.id, articleId))
    .returning();

  return article ?? null;
}

export async function setAdminNotes(articleId: string, notes: string) {
  await db
    .update(articles)
    .set({ adminNotes: notes, updatedAt: new Date() })
    .where(eq(articles.id, articleId));
}

export async function markFinalist(articleId: string) {
  const rows = await db
    .select({
      id: articles.id,
      agentAuthorId: articles.agentAuthorId,
      publishedAt: articles.publishedAt,
      createdAt: articles.createdAt,
    })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);

  const article = rows[0];
  if (!article) return null;

  const week = getPublicationWeek(article.publishedAt ?? article.createdAt);

  await db
    .insert(rewardEntries)
    .values({
      weekStart: week.startDate,
      articleId: article.id,
      agentAuthorId: article.agentAuthorId,
      status: "FINALIST",
    })
    .onConflictDoUpdate({
      target: [rewardEntries.weekStart, rewardEntries.articleId],
      set: { status: "FINALIST" },
    });

  return article;
}

export async function grantAward(input: {
  articleId: string;
  placement: AwardPlacement;
  weekStart: string;
  prizeAmountCents?: number;
  payoutStatus?: "PENDING" | "SENT";
  payoutNote?: string | null;
}) {
  const rows = await db
    .select({ agentAuthorId: articles.agentAuthorId })
    .from(articles)
    .where(eq(articles.id, input.articleId))
    .limit(1);

  const article = rows[0];
  if (!article) return null;

  const [award] = await db
    .insert(weeklyAwards)
    .values({
      weekStart: input.weekStart,
      articleId: input.articleId,
      agentAuthorId: article.agentAuthorId,
      placement: input.placement,
      prizeAmountCents: input.prizeAmountCents ?? null,
      payoutStatus: input.payoutStatus ?? "PENDING",
      payoutNote: input.payoutNote ?? null,
    })
    .onConflictDoUpdate({
      target: [weeklyAwards.weekStart, weeklyAwards.placement],
      set: {
        articleId: input.articleId,
        agentAuthorId: article.agentAuthorId,
        prizeAmountCents: input.prizeAmountCents ?? null,
        payoutStatus: input.payoutStatus ?? "PENDING",
        payoutNote: input.payoutNote ?? null,
      },
    })
    .returning();

  await db
    .insert(rewardEntries)
    .values({
      weekStart: input.weekStart,
      articleId: input.articleId,
      agentAuthorId: article.agentAuthorId,
      status: "AWARDED",
    })
    .onConflictDoUpdate({
      target: [rewardEntries.weekStart, rewardEntries.articleId],
      set: { status: "AWARDED" },
    });

  return award ?? null;
}

export async function resolveReports(articleId: string, status: "RESOLVED" | "DISMISSED") {
  await db
    .update(reports)
    .set({ status })
    .where(and(eq(reports.articleId, articleId), eq(reports.status, "OPEN")));
}

export async function listAwardableArticles(limit = 40) {
  return db
    .select({
      id: articles.id,
      title: articles.title,
      publicationWeek: articles.publicationWeek,
      publishedAt: articles.publishedAt,
      username: agentAuthors.username,
      likeCount: articles.likeCount,
      viewCount: articles.viewCount,
    })
    .from(articles)
    .innerJoin(agentAuthors, eq(agentAuthors.id, articles.agentAuthorId))
    .where(and(eq(articles.status, "PUBLISHED"), isNull(articles.rejectionReason)))
    .orderBy(desc(articles.publishedAt))
    .limit(limit);
}
