import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  agentAuthors,
  articleLikes,
  articleSaves,
  articleViews,
  articles,
  follows,
} from "@/db/schema";

/**
 * Likes, saves, follows and views. Counters live on the parent row and are only
 * moved when the membership row actually changed, so double-clicks and retries
 * cannot drift the totals.
 */

async function isPublished(articleId: string) {
  const rows = await db
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.status, "PUBLISHED")))
    .limit(1);
  return rows.length > 0;
}

export type ToggleResult = { active: boolean; count: number };

export async function likeArticle(
  userId: string,
  articleId: string,
): Promise<ToggleResult | null> {
  if (!(await isPublished(articleId))) return null;

  const inserted = await db.execute<{ user_id: string }>(sql`
    insert into article_likes (user_id, article_id)
    values (${userId}, ${articleId})
    on conflict do nothing
    returning user_id
  `);

  if (inserted.rowCount) {
    await db
      .update(articles)
      .set({ likeCount: sql`${articles.likeCount} + 1` })
      .where(eq(articles.id, articleId));
  }

  return { active: true, count: await likeCount(articleId) };
}

export async function unlikeArticle(
  userId: string,
  articleId: string,
): Promise<ToggleResult> {
  const deleted = await db
    .delete(articleLikes)
    .where(and(eq(articleLikes.userId, userId), eq(articleLikes.articleId, articleId)))
    .returning({ userId: articleLikes.userId });

  if (deleted.length) {
    await db
      .update(articles)
      .set({ likeCount: sql`greatest(${articles.likeCount} - 1, 0)` })
      .where(eq(articles.id, articleId));
  }

  return { active: false, count: await likeCount(articleId) };
}

export async function saveArticle(
  userId: string,
  articleId: string,
): Promise<ToggleResult | null> {
  if (!(await isPublished(articleId))) return null;

  const inserted = await db.execute<{ user_id: string }>(sql`
    insert into article_saves (user_id, article_id)
    values (${userId}, ${articleId})
    on conflict do nothing
    returning user_id
  `);

  if (inserted.rowCount) {
    await db
      .update(articles)
      .set({ saveCount: sql`${articles.saveCount} + 1` })
      .where(eq(articles.id, articleId));
  }

  return { active: true, count: await saveCount(articleId) };
}

export async function unsaveArticle(
  userId: string,
  articleId: string,
): Promise<ToggleResult> {
  const deleted = await db
    .delete(articleSaves)
    .where(and(eq(articleSaves.userId, userId), eq(articleSaves.articleId, articleId)))
    .returning({ userId: articleSaves.userId });

  if (deleted.length) {
    await db
      .update(articles)
      .set({ saveCount: sql`greatest(${articles.saveCount} - 1, 0)` })
      .where(eq(articles.id, articleId));
  }

  return { active: false, count: await saveCount(articleId) };
}

async function likeCount(articleId: string) {
  const rows = await db
    .select({ count: articles.likeCount })
    .from(articles)
    .where(eq(articles.id, articleId));
  return Number(rows[0]?.count ?? 0);
}

async function saveCount(articleId: string) {
  const rows = await db
    .select({ count: articles.saveCount })
    .from(articles)
    .where(eq(articles.id, articleId));
  return Number(rows[0]?.count ?? 0);
}

/* -------------------------------------------------------------------------- */
/* Views                                                                       */
/* -------------------------------------------------------------------------- */

/** A visitor may add at most one view per article per window. */
export const VIEW_WINDOW_HOURS = 6;

export async function recordView(
  articleId: string,
  visitor: string,
  now: Date = new Date(),
): Promise<{ counted: boolean; views: number }> {
  const windowMs = VIEW_WINDOW_HOURS * 3_600_000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);

  const inserted = await db
    .insert(articleViews)
    .values({ articleId, visitorHash: visitor, windowStart })
    .onConflictDoNothing()
    .returning({ id: articleViews.id });

  if (inserted.length === 0) {
    const rows = await db
      .select({ views: articles.viewCount })
      .from(articles)
      .where(eq(articles.id, articleId));
    return { counted: false, views: Number(rows[0]?.views ?? 0) };
  }

  const updated = await db
    .update(articles)
    .set({ viewCount: sql`${articles.viewCount} + 1` })
    .where(and(eq(articles.id, articleId), eq(articles.status, "PUBLISHED")))
    .returning({ views: articles.viewCount });

  return { counted: updated.length > 0, views: Number(updated[0]?.views ?? 0) };
}

/* -------------------------------------------------------------------------- */
/* Follows                                                                     */
/* -------------------------------------------------------------------------- */

export async function followWriter(
  userId: string,
  agentAuthorId: string,
): Promise<ToggleResult | null> {
  const exists = await db
    .select({ id: agentAuthors.id })
    .from(agentAuthors)
    .where(eq(agentAuthors.id, agentAuthorId))
    .limit(1);
  if (exists.length === 0) return null;

  const inserted = await db
    .insert(follows)
    .values({ userId, agentAuthorId })
    .onConflictDoNothing()
    .returning({ userId: follows.userId });

  if (inserted.length) {
    await db
      .update(agentAuthors)
      .set({ followerCount: sql`${agentAuthors.followerCount} + 1` })
      .where(eq(agentAuthors.id, agentAuthorId));
  }

  return { active: true, count: await followerCount(agentAuthorId) };
}

export async function unfollowWriter(
  userId: string,
  agentAuthorId: string,
): Promise<ToggleResult> {
  const deleted = await db
    .delete(follows)
    .where(and(eq(follows.userId, userId), eq(follows.agentAuthorId, agentAuthorId)))
    .returning({ userId: follows.userId });

  if (deleted.length) {
    await db
      .update(agentAuthors)
      .set({ followerCount: sql`greatest(${agentAuthors.followerCount} - 1, 0)` })
      .where(eq(agentAuthors.id, agentAuthorId));
  }

  return { active: false, count: await followerCount(agentAuthorId) };
}

async function followerCount(agentAuthorId: string) {
  const rows = await db
    .select({ count: agentAuthors.followerCount })
    .from(agentAuthors)
    .where(eq(agentAuthors.id, agentAuthorId));
  return Number(rows[0]?.count ?? 0);
}
