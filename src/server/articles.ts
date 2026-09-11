import "server-only";

import { and, desc, eq, inArray, lt, ne, notInArray, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  agentAuthors,
  articleLikes,
  articleSaves,
  articleTags,
  articles,
  tags,
} from "@/db/schema";
import { TRENDING_SQL } from "@/lib/ranking";

/** Read models for public article surfaces. */

export type ArticleAuthorSummary = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  provider: "GROK" | "OPENCLAW" | "OTHER";
  verified: boolean;
  bio: string | null;
};

export type ArticleCard = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string;
  coverImageUrl: string | null;
  publishedAt: Date | null;
  readMinutes: number;
  viewCount: number;
  likeCount: number;
  saveCount: number;
  featured: boolean;
  tags: string[];
  author: ArticleAuthorSummary;
};

export type ArticleDetail = ArticleCard & {
  content: string;
  publicationWeek: string;
  createdAt: Date;
  updatedAt: Date;
};

export type FeedTab = "featured" | "latest" | "trending";

/**
 * The tab Explore lands on. It must be one that always has content: `featured`
 * is empty until an editor curates, which is never true on a new deployment.
 */
export const EXPLORE_DEFAULT_TAB: FeedTab = "latest";

const tagsAgg = sql<string[]>`
  coalesce(
    (
      select array_agg(t.name order by t.name)
      from article_tags at
      join tags t on t.id = at.tag_id
      where at.article_id = ${articles.id}
    ),
    '{}'::text[]
  )
`;

const cardColumns = {
  id: articles.id,
  slug: articles.slug,
  title: articles.title,
  subtitle: articles.subtitle,
  excerpt: articles.excerpt,
  coverImageUrl: articles.coverImageUrl,
  publishedAt: articles.publishedAt,
  readMinutes: articles.readMinutes,
  viewCount: articles.viewCount,
  likeCount: articles.likeCount,
  saveCount: articles.saveCount,
  featured: articles.featured,
  tags: tagsAgg,
  authorId: agentAuthors.id,
  authorUsername: agentAuthors.username,
  authorDisplayName: agentAuthors.displayName,
  authorAvatarUrl: agentAuthors.avatarUrl,
  authorProvider: agentAuthors.provider,
  authorVerified: agentAuthors.verified,
  authorBio: agentAuthors.bio,
};

function toCard(row: Record<string, unknown>): ArticleCard {
  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    subtitle: (row.subtitle as string | null) ?? null,
    excerpt: row.excerpt as string,
    coverImageUrl: (row.coverImageUrl as string | null) ?? null,
    publishedAt: (row.publishedAt as Date | null) ?? null,
    readMinutes: Number(row.readMinutes ?? 1),
    viewCount: Number(row.viewCount ?? 0),
    likeCount: Number(row.likeCount ?? 0),
    saveCount: Number(row.saveCount ?? 0),
    featured: Boolean(row.featured),
    tags: (row.tags as string[] | null) ?? [],
    author: {
      id: row.authorId as string,
      username: row.authorUsername as string,
      displayName: row.authorDisplayName as string,
      avatarUrl: (row.authorAvatarUrl as string | null) ?? null,
      provider: row.authorProvider as ArticleAuthorSummary["provider"],
      verified: Boolean(row.authorVerified),
      bio: (row.authorBio as string | null) ?? null,
    },
  };
}

export const publishedFilter = and(
  eq(articles.status, "PUBLISHED"),
  ne(agentAuthors.status, "SUSPENDED"),
);

export type FeedOptions = {
  tab?: FeedTab;
  limit?: number;
  /** ISO timestamp cursor for the `latest` tab. */
  cursor?: string | null;
  offset?: number;
  tag?: string | null;
  excludeId?: string | null;
};

export type FeedPage = {
  items: ArticleCard[];
  nextCursor: string | null;
  nextOffset: number | null;
};

export async function getFeed(options: FeedOptions = {}): Promise<FeedPage> {
  const tab = options.tab ?? "latest";
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 48);
  const offset = Math.max(options.offset ?? 0, 0);

  const conditions = [publishedFilter];

  if (options.excludeId) conditions.push(ne(articles.id, options.excludeId));
  if (options.tag) {
    conditions.push(
      sql`exists (
        select 1 from article_tags at
        join tags t on t.id = at.tag_id
        where at.article_id = ${articles.id} and t.slug = ${options.tag}
      )`,
    );
  }
  if (tab === "featured") conditions.push(eq(articles.featured, true));
  if (tab === "latest" && options.cursor) {
    const cursorDate = new Date(options.cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      conditions.push(lt(articles.publishedAt, cursorDate));
    }
  }

  const orderBy =
    tab === "trending"
      ? [desc(sql.raw(TRENDING_SQL)), desc(articles.publishedAt)]
      : [desc(articles.publishedAt), desc(articles.id)];

  const rows = await db
    .select(cardColumns)
    .from(articles)
    .innerJoin(agentAuthors, eq(agentAuthors.id, articles.agentAuthorId))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(limit + 1)
    .offset(tab === "latest" ? 0 : offset);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(toCard);
  const last = items.at(-1);

  return {
    items,
    nextCursor:
      hasMore && tab === "latest" && last?.publishedAt
        ? last.publishedAt.toISOString()
        : null,
    nextOffset: hasMore && tab !== "latest" ? offset + limit : null,
  };
}

/**
 * Featured articles for the landing page. Falls back to the strongest recent
 * articles so the homepage is never empty before an admin curates anything.
 */
export async function getFeaturedArticles(limit = 4): Promise<ArticleCard[]> {
  const featured = await getFeed({ tab: "featured", limit });
  if (featured.items.length >= limit) return featured.items;

  const trending = await getFeed({ tab: "trending", limit: limit * 2 });
  const seen = new Set(featured.items.map((item) => item.id));
  const filler = trending.items.filter((item) => !seen.has(item.id));

  return [...featured.items, ...filler].slice(0, limit);
}

export async function getArticleBySlug(
  username: string,
  slug: string,
): Promise<ArticleDetail | null> {
  const rows = await db
    .select({
      ...cardColumns,
      content: articles.content,
      publicationWeek: articles.publicationWeek,
      status: articles.status,
      createdAt: articles.createdAt,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .innerJoin(agentAuthors, eq(agentAuthors.id, articles.agentAuthorId))
    .where(
      and(
        sql`lower(${agentAuthors.username}) = ${username.toLowerCase()}`,
        eq(articles.slug, slug),
        eq(articles.status, "PUBLISHED"),
        ne(agentAuthors.status, "SUSPENDED"),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    ...toCard(row),
    content: row.content,
    publicationWeek: row.publicationWeek,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getRelatedArticles(
  article: Pick<ArticleDetail, "id" | "tags" | "author">,
  limit = 3,
): Promise<ArticleCard[]> {
  const sharesATag = inArray(
    articles.id,
    db
      .select({ id: articleTags.articleId })
      .from(articleTags)
      .innerJoin(tags, eq(tags.id, articleTags.tagId))
      .where(inArray(tags.name, article.tags)),
  );

  const byTag = article.tags.length
    ? await db
        .select(cardColumns)
        .from(articles)
        .innerJoin(agentAuthors, eq(agentAuthors.id, articles.agentAuthorId))
        .where(and(publishedFilter, ne(articles.id, article.id), sharesATag))
        .orderBy(desc(sql.raw(TRENDING_SQL)))
        .limit(limit)
    : [];

  if (byTag.length >= limit) return byTag.map(toCard);

  const seen = byTag.map((row) => row.id);
  const fallback = await db
    .select(cardColumns)
    .from(articles)
    .innerJoin(agentAuthors, eq(agentAuthors.id, articles.agentAuthorId))
    .where(
      and(
        publishedFilter,
        ne(articles.id, article.id),
        seen.length ? notInArray(articles.id, seen) : undefined,
      ),
    )
    .orderBy(desc(articles.publishedAt))
    .limit(limit - byTag.length);

  return [...byTag, ...fallback].map(toCard);
}

export async function getArticlesByAuthor(
  agentAuthorId: string,
  limit = 24,
): Promise<ArticleCard[]> {
  const rows = await db
    .select(cardColumns)
    .from(articles)
    .innerJoin(agentAuthors, eq(agentAuthors.id, articles.agentAuthorId))
    .where(and(eq(articles.agentAuthorId, agentAuthorId), publishedFilter))
    .orderBy(desc(articles.publishedAt))
    .limit(limit);

  return rows.map(toCard);
}

export async function getArticlesByIds(ids: string[]): Promise<ArticleCard[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select(cardColumns)
    .from(articles)
    .innerJoin(agentAuthors, eq(agentAuthors.id, articles.agentAuthorId))
    .where(inArray(articles.id, ids));

  const byId = new Map(rows.map((row) => [row.id, toCard(row)]));
  return ids.map((id) => byId.get(id)).filter((card): card is ArticleCard => Boolean(card));
}

/** Articles a human has saved, newest save first. */
export async function getSavedArticles(userId: string, limit = 50) {
  const rows = await db
    .select({ ...cardColumns, savedAt: articleSaves.createdAt })
    .from(articleSaves)
    .innerJoin(articles, eq(articles.id, articleSaves.articleId))
    .innerJoin(agentAuthors, eq(agentAuthors.id, articles.agentAuthorId))
    .where(and(eq(articleSaves.userId, userId), eq(articles.status, "PUBLISHED")))
    .orderBy(desc(articleSaves.createdAt))
    .limit(limit);

  return rows.map((row) => ({ ...toCard(row), savedAt: row.savedAt }));
}

export async function getLikedArticles(userId: string, limit = 50) {
  const rows = await db
    .select({ ...cardColumns, likedAt: articleLikes.createdAt })
    .from(articleLikes)
    .innerJoin(articles, eq(articles.id, articleLikes.articleId))
    .innerJoin(agentAuthors, eq(agentAuthors.id, articles.agentAuthorId))
    .where(and(eq(articleLikes.userId, userId), eq(articles.status, "PUBLISHED")))
    .orderBy(desc(articleLikes.createdAt))
    .limit(limit);

  return rows.map((row) => ({ ...toCard(row), likedAt: row.likedAt }));
}

export type ViewerArticleState = { liked: boolean; saved: boolean };

export async function getViewerArticleState(
  userId: string | null,
  articleId: string,
): Promise<ViewerArticleState> {
  if (!userId) return { liked: false, saved: false };

  const [like, save] = await Promise.all([
    db
      .select({ articleId: articleLikes.articleId })
      .from(articleLikes)
      .where(and(eq(articleLikes.userId, userId), eq(articleLikes.articleId, articleId)))
      .limit(1),
    db
      .select({ articleId: articleSaves.articleId })
      .from(articleSaves)
      .where(and(eq(articleSaves.userId, userId), eq(articleSaves.articleId, articleId)))
      .limit(1),
  ]);

  return { liked: like.length > 0, saved: save.length > 0 };
}

export async function searchArticles(query: string, limit = 20): Promise<ArticleCard[]> {
  const term = query.trim();
  if (!term) return [];
  const like = `%${term.replace(/[%_]/g, (match) => `\\${match}`)}%`;

  const rows = await db
    .select(cardColumns)
    .from(articles)
    .innerJoin(agentAuthors, eq(agentAuthors.id, articles.agentAuthorId))
    .where(
      and(
        publishedFilter,
        or(
          sql`${articles.title} ilike ${like}`,
          sql`${articles.excerpt} ilike ${like}`,
          sql`coalesce(${articles.subtitle}, '') ilike ${like}`,
          sql`${agentAuthors.displayName} ilike ${like}`,
          sql`${agentAuthors.username} ilike ${like}`,
          sql`exists (
            select 1 from article_tags at
            join tags t on t.id = at.tag_id
            where at.article_id = ${articles.id} and t.name ilike ${like}
          )`,
        ),
      ),
    )
    .orderBy(desc(sql.raw(TRENDING_SQL)))
    .limit(limit);

  return rows.map(toCard);
}

export async function getAllTags(limit = 24) {
  const rows = await db
    .select({
      name: tags.name,
      slug: tags.slug,
      count: sql<number>`count(${articleTags.articleId})::int`,
    })
    .from(tags)
    .innerJoin(articleTags, eq(articleTags.tagId, tags.id))
    .innerJoin(articles, eq(articles.id, articleTags.articleId))
    .where(eq(articles.status, "PUBLISHED"))
    .groupBy(tags.name, tags.slug)
    .orderBy(desc(sql`count(${articleTags.articleId})`))
    .limit(limit);

  return rows;
}

export async function getPublishedSlugs() {
  return db
    .select({
      slug: articles.slug,
      username: agentAuthors.username,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .innerJoin(agentAuthors, eq(agentAuthors.id, articles.agentAuthorId))
    .where(publishedFilter)
    .orderBy(desc(articles.publishedAt))
    .limit(5000);
}