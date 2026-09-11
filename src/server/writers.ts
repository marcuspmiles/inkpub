import "server-only";

import { and, desc, eq, ilike, ne, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { agentAuthors, articles, follows, users } from "@/db/schema";

/** Read models for AI writer profiles. */

export type WriterSummary = {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  provider: "GROK" | "OPENCLAW" | "OTHER";
  verified: boolean;
  specialties: string[];
  followerCount: number;
  articleCount: number;
  totalViews: number;
  totalLikes: number;
};

export type WriterProfile = WriterSummary & {
  createdAt: Date;
  awardCount: number;
  operator: { username: string; displayName: string } | null;
};

const writerStats = {
  articleCount: sql<number>`(
    select count(*)::int from articles a
    where a.agent_author_id = ${agentAuthors.id} and a.status = 'PUBLISHED'
  )`,
  totalViews: sql<number>`(
    select coalesce(sum(a.view_count), 0)::int from articles a
    where a.agent_author_id = ${agentAuthors.id} and a.status = 'PUBLISHED'
  )`,
  totalLikes: sql<number>`(
    select coalesce(sum(a.like_count), 0)::int from articles a
    where a.agent_author_id = ${agentAuthors.id} and a.status = 'PUBLISHED'
  )`,
};

const writerColumns = {
  id: agentAuthors.id,
  username: agentAuthors.username,
  displayName: agentAuthors.displayName,
  bio: agentAuthors.bio,
  avatarUrl: agentAuthors.avatarUrl,
  provider: agentAuthors.provider,
  verified: agentAuthors.verified,
  specialties: agentAuthors.specialties,
  followerCount: agentAuthors.followerCount,
  ...writerStats,
};

export async function getTrendingWriters(limit = 6): Promise<WriterSummary[]> {
  const rows = await db
    .select(writerColumns)
    .from(agentAuthors)
    .where(eq(agentAuthors.status, "ACTIVE"))
    .orderBy(
      desc(sql`(
        ${agentAuthors.followerCount} * 12
        + (select coalesce(sum(a.like_count), 0) from articles a
            where a.agent_author_id = ${agentAuthors.id} and a.status = 'PUBLISHED') * 4
        + (select coalesce(sum(a.view_count), 0) from articles a
            where a.agent_author_id = ${agentAuthors.id} and a.status = 'PUBLISHED') * 0.5
      )`),
    )
    .limit(limit);

  return rows as WriterSummary[];
}

export async function listWriters(limit = 48): Promise<WriterSummary[]> {
  const rows = await db
    .select(writerColumns)
    .from(agentAuthors)
    .where(ne(agentAuthors.status, "SUSPENDED"))
    .orderBy(desc(agentAuthors.followerCount))
    .limit(limit);

  return rows as WriterSummary[];
}

export async function getWriterByUsername(
  username: string,
): Promise<WriterProfile | null> {
  const rows = await db
    .select({
      ...writerColumns,
      createdAt: agentAuthors.createdAt,
      status: agentAuthors.status,
      showOperator: agentAuthors.showOperator,
      operatorUsername: users.username,
      operatorDisplayName: users.displayName,
      awardCount: sql<number>`(
        select count(*)::int from weekly_awards w
        where w.agent_author_id = ${agentAuthors.id}
      )`,
    })
    .from(agentAuthors)
    .leftJoin(users, eq(users.id, agentAuthors.ownerUserId))
    .where(sql`lower(${agentAuthors.username}) = ${username.toLowerCase()}`)
    .limit(1);

  const row = rows[0];
  if (!row || row.status === "SUSPENDED") return null;

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    provider: row.provider,
    verified: row.verified,
    specialties: row.specialties ?? [],
    followerCount: row.followerCount,
    articleCount: Number(row.articleCount ?? 0),
    totalViews: Number(row.totalViews ?? 0),
    totalLikes: Number(row.totalLikes ?? 0),
    createdAt: row.createdAt,
    awardCount: Number(row.awardCount ?? 0),
    operator:
      row.showOperator && row.operatorUsername
        ? {
            username: row.operatorUsername,
            displayName: row.operatorDisplayName ?? row.operatorUsername,
          }
        : null,
  };
}

export async function isFollowing(userId: string | null, agentAuthorId: string) {
  if (!userId) return false;
  const rows = await db
    .select({ userId: follows.userId })
    .from(follows)
    .where(and(eq(follows.userId, userId), eq(follows.agentAuthorId, agentAuthorId)))
    .limit(1);
  return rows.length > 0;
}

export async function getFollowedWriters(userId: string): Promise<WriterSummary[]> {
  const rows = await db
    .select(writerColumns)
    .from(follows)
    .innerJoin(agentAuthors, eq(agentAuthors.id, follows.agentAuthorId))
    .where(eq(follows.userId, userId))
    .orderBy(desc(follows.createdAt));

  return rows as WriterSummary[];
}

export async function searchWriters(query: string, limit = 8): Promise<WriterSummary[]> {
  const term = query.trim();
  if (!term) return [];
  const like = `%${term.replace(/[%_]/g, (match) => `\\${match}`)}%`;

  const rows = await db
    .select(writerColumns)
    .from(agentAuthors)
    .where(
      and(
        ne(agentAuthors.status, "SUSPENDED"),
        or(ilike(agentAuthors.displayName, like), ilike(agentAuthors.username, like)),
      ),
    )
    .limit(limit);

  return rows as WriterSummary[];
}

export async function getWriterUsernames() {
  return db
    .select({ username: agentAuthors.username, updatedAt: agentAuthors.updatedAt })
    .from(agentAuthors)
    .where(ne(agentAuthors.status, "SUSPENDED"))
    .limit(5000);
}

/** Writers owned by a human account, with their weekly-slot state. */
export async function getWritersForOwner(ownerUserId: string) {
  const rows = await db
    .select({
      ...writerColumns,
      status: agentAuthors.status,
      createdAt: agentAuthors.createdAt,
      showOperator: agentAuthors.showOperator,
      pendingCount: sql<number>`(
        select count(*)::int from articles a
        where a.agent_author_id = ${agentAuthors.id} and a.status = 'PENDING_REVIEW'
      )`,
      lastPublishedAt: sql<Date | null>`(
        select max(a.published_at) from articles a
        where a.agent_author_id = ${agentAuthors.id} and a.status = 'PUBLISHED'
      )`,
      hasApiKey: sql<boolean>`exists (
        select 1 from agent_api_keys k
        where k.agent_author_id = ${agentAuthors.id} and k.revoked_at is null
      )`,
    })
    .from(agentAuthors)
    .where(eq(agentAuthors.ownerUserId, ownerUserId))
    .orderBy(desc(agentAuthors.createdAt));

  return rows;
}

export async function countArticlesInWeek(agentAuthorId: string, publicationWeek: string) {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(articles)
    .where(
      and(
        eq(articles.agentAuthorId, agentAuthorId),
        eq(articles.publicationWeek, publicationWeek),
        sql`${articles.status} in ('PENDING_REVIEW', 'PUBLISHED')`,
      ),
    );
  return Number(rows[0]?.count ?? 0);
}
