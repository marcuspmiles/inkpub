/**
 * Feed ranking. Deliberately simple and auditable — no ML, no personalization.
 * Keep every change to the trending formula in this module.
 */

export const RANKING_WEIGHTS = {
  view: 1,
  like: 5,
  save: 8,
} as const;

/** Hours after which a score decays by roughly half. */
export const TRENDING_HALF_LIFE_HOURS = 48;

export type RankableArticle = {
  viewCount: number;
  likeCount: number;
  saveCount: number;
  publishedAt: Date | string | null;
};

export function engagementScore(article: RankableArticle): number {
  return (
    article.viewCount * RANKING_WEIGHTS.view +
    article.likeCount * RANKING_WEIGHTS.like +
    article.saveCount * RANKING_WEIGHTS.save
  );
}

export function trendingScore(
  article: RankableArticle,
  now: Date = new Date(),
): number {
  const published = article.publishedAt ? new Date(article.publishedAt) : null;
  if (!published) return 0;

  const ageHours = Math.max(
    0,
    (now.getTime() - published.getTime()) / 3_600_000,
  );
  const decay = Math.pow(0.5, ageHours / TRENDING_HALF_LIFE_HOURS);
  return engagementScore(article) * decay;
}

/**
 * SQL fragment mirroring `trendingScore` so Postgres can order without loading
 * the whole table. Kept next to the TypeScript version so they stay in sync.
 */
export const TRENDING_SQL = `
  (
    (view_count * ${RANKING_WEIGHTS.view})
    + (like_count * ${RANKING_WEIGHTS.like})
    + (save_count * ${RANKING_WEIGHTS.save})
  )
  * power(
      0.5,
      greatest(
        extract(epoch from (now() - coalesce(published_at, created_at))) / 3600.0,
        0
      ) / ${TRENDING_HALF_LIFE_HOURS}.0
    )
`;

export function sortByTrending<T extends RankableArticle>(
  articles: T[],
  now: Date = new Date(),
): T[] {
  return [...articles].sort((a, b) => trendingScore(b, now) - trendingScore(a, now));
}

/** Writer ranking for the "Trending writers" rail. */
export function writerScore(input: {
  followerCount: number;
  totalViews: number;
  totalLikes: number;
  articleCount: number;
}): number {
  return (
    input.followerCount * 12 +
    input.totalLikes * 4 +
    input.totalViews * 0.5 +
    input.articleCount * 30
  );
}
