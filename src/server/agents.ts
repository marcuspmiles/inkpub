import "server-only";

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  agentApiKeys,
  agentAuthors,
  agentConnectionTokens,
  articleTags,
  articles,
  moderationResults,
  tags,
  type AgentAuthor,
  type Article,
  type ModerationStatus,
} from "@/db/schema";
import {
  buildExcerpt,
  contentHash,
  extractImageUrls,
  readingMinutes,
  slugify,
} from "@/lib/content";
import { env } from "@/lib/env";
import { moderateArticle } from "@/lib/moderation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  generateAgentApiKey,
  generatePairingCode,
  hashPairingCode,
  pairingCodeHint,
} from "@/lib/tokens";
import { suggestUsernames, validateUsername } from "@/lib/usernames";
import {
  ARTICLES_PER_WEEK,
  articleCountLabel,
  getPublicationWeek,
  nextWeekStart,
} from "@/lib/weeks";
import { isUniqueViolation, isUsernameTaken, uniqueViolationConstraint } from "@/server/accounts";

/* -------------------------------------------------------------------------- */
/* Pairing codes                                                               */
/* -------------------------------------------------------------------------- */

export const PAIRING_CODE_TTL_MINUTES = 45;
export const MAX_WRITERS_PER_OWNER = 5;

export type PairingCode = {
  code: string;
  expiresAt: Date;
  id: string;
};

export async function createPairingCode(
  ownerUserId: string,
  label?: string | null,
): Promise<PairingCode> {
  // Retire any outstanding codes so only one is live per operator at a time.
  await db
    .update(agentConnectionTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(agentConnectionTokens.ownerUserId, ownerUserId),
        isNull(agentConnectionTokens.usedAt),
        isNull(agentConnectionTokens.revokedAt),
      ),
    );

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MINUTES * 60_000);

  const [row] = await db
    .insert(agentConnectionTokens)
    .values({
      ownerUserId,
      tokenHash: hashPairingCode(code),
      codeHint: pairingCodeHint(code),
      label: label?.trim() || null,
      expiresAt,
    })
    .returning({ id: agentConnectionTokens.id });

  return { code, expiresAt, id: row!.id };
}

export async function revokePairingCodes(ownerUserId: string) {
  await db
    .update(agentConnectionTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(agentConnectionTokens.ownerUserId, ownerUserId),
        isNull(agentConnectionTokens.usedAt),
        isNull(agentConnectionTokens.revokedAt),
      ),
    );
}

export async function getPendingPairingCode(ownerUserId: string) {
  const rows = await db
    .select({
      id: agentConnectionTokens.id,
      codeHint: agentConnectionTokens.codeHint,
      label: agentConnectionTokens.label,
      expiresAt: agentConnectionTokens.expiresAt,
      createdAt: agentConnectionTokens.createdAt,
    })
    .from(agentConnectionTokens)
    .where(
      and(
        eq(agentConnectionTokens.ownerUserId, ownerUserId),
        isNull(agentConnectionTokens.usedAt),
        isNull(agentConnectionTokens.revokedAt),
        sql`${agentConnectionTokens.expiresAt} > now()`,
      ),
    )
    .orderBy(desc(agentConnectionTokens.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Registration                                                                */
/* -------------------------------------------------------------------------- */

export type RegisterInput = {
  code: string;
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  provider: "GROK" | "OPENCLAW" | "OTHER";
  specialties?: string[];
};

export type RegisterResult =
  | {
      ok: true;
      author: AgentAuthor;
      apiKey: string;
    }
  | {
      ok: false;
      code: "invalid_code" | "expired_code" | "username_taken" | "invalid_username" | "limit";
      message: string;
      suggestions?: string[];
    };

export async function registerAgent(input: RegisterInput): Promise<RegisterResult> {
  const usernameCheck = validateUsername(input.username, "agent");
  if (!usernameCheck.ok) {
    return {
      ok: false,
      code: "invalid_username",
      message: usernameCheck.reason,
      suggestions: suggestUsernames(input.username),
    };
  }
  const username = usernameCheck.username;

  const tokenRows = await db
    .select()
    .from(agentConnectionTokens)
    .where(eq(agentConnectionTokens.tokenHash, hashPairingCode(input.code)))
    .limit(1);

  const token = tokenRows[0];
  if (!token || token.revokedAt) {
    return {
      ok: false,
      code: "invalid_code",
      message:
        "That pairing code is not valid. Ask your operator for a fresh code from " +
        "their Inkpub dashboard.",
    };
  }
  if (token.usedAt) {
    return {
      ok: false,
      code: "invalid_code",
      message: "That pairing code has already been used.",
    };
  }
  if (token.expiresAt.getTime() < Date.now()) {
    return {
      ok: false,
      code: "expired_code",
      message: "That pairing code has expired. Ask your operator for a new one.",
    };
  }

  const existingWriters = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentAuthors)
    .where(eq(agentAuthors.ownerUserId, token.ownerUserId));

  if (Number(existingWriters[0]?.count ?? 0) >= MAX_WRITERS_PER_OWNER) {
    return {
      ok: false,
      code: "limit",
      message: "This operator has reached the maximum number of connected writers.",
    };
  }

  if (await isUsernameTaken(username)) {
    return {
      ok: false,
      code: "username_taken",
      message: `@${username} is taken. Choose another username and try again.`,
      suggestions: suggestUsernames(username),
    };
  }

  try {
    return await db.transaction(async (tx) => {
      const claimed = await tx
        .update(agentConnectionTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(agentConnectionTokens.id, token.id),
            isNull(agentConnectionTokens.usedAt),
          ),
        )
        .returning({ id: agentConnectionTokens.id });

      if (claimed.length === 0) {
        return {
          ok: false as const,
          code: "invalid_code" as const,
          message: "That pairing code has already been used.",
        };
      }

      const [author] = await tx
        .insert(agentAuthors)
        .values({
          ownerUserId: token.ownerUserId,
          provider: input.provider,
          username,
          displayName: input.displayName.trim(),
          bio: input.bio?.trim() || null,
          avatarUrl: input.avatarUrl?.trim() || null,
          specialties: (input.specialties ?? []).slice(0, 6),
        })
        .returning();

      await tx
        .update(agentConnectionTokens)
        .set({ usedByAgentAuthorId: author!.id })
        .where(eq(agentConnectionTokens.id, token.id));

      const key = generateAgentApiKey();
      await tx.insert(agentApiKeys).values({
        agentAuthorId: author!.id,
        tokenHash: key.tokenHash,
        tokenPrefix: key.tokenPrefix,
      });

      return { ok: true as const, author: author!, apiKey: key.token };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        code: "username_taken",
        message: `@${username} was claimed a moment ago. Choose another username.`,
        suggestions: suggestUsernames(username),
      };
    }
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* API key lifecycle                                                           */
/* -------------------------------------------------------------------------- */

export async function rotateApiKey(agentAuthorId: string) {
  const key = generateAgentApiKey();

  await db.transaction(async (tx) => {
    await tx
      .update(agentApiKeys)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(agentApiKeys.agentAuthorId, agentAuthorId), isNull(agentApiKeys.revokedAt)),
      );

    await tx.insert(agentApiKeys).values({
      agentAuthorId,
      tokenHash: key.tokenHash,
      tokenPrefix: key.tokenPrefix,
    });
  });

  return key.token;
}

export async function revokeApiKeys(agentAuthorId: string) {
  await db
    .update(agentApiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(agentApiKeys.agentAuthorId, agentAuthorId), isNull(agentApiKeys.revokedAt)),
    );
}

export async function disconnectWriter(agentAuthorId: string) {
  await revokeApiKeys(agentAuthorId);
  await db
    .update(agentAuthors)
    .set({ status: "DISCONNECTED", updatedAt: new Date() })
    .where(eq(agentAuthors.id, agentAuthorId));
}

export async function reconnectWriter(agentAuthorId: string) {
  await db
    .update(agentAuthors)
    .set({ status: "ACTIVE", updatedAt: new Date() })
    .where(eq(agentAuthors.id, agentAuthorId));
}

/* -------------------------------------------------------------------------- */
/* Weekly publishing slot                                                      */
/* -------------------------------------------------------------------------- */

export const WEEKLY_LIMIT_MESSAGE =
  `You've used this week's full Inkpub publishing allowance of ` +
  `${articleCountLabel(ARTICLES_PER_WEEK)}. Your next slot opens on Monday.`;

export type WeeklySlot = {
  week: string;
  /** True once the whole week's allowance is taken. */
  used: boolean;
  limit: number;
  usedCount: number;
  remaining: number;
  articles: Array<Pick<Article, "id" | "slug" | "title" | "status">>;
  /** The most recent submission this week, or null. Convenience for callers. */
  article: Pick<Article, "id" | "slug" | "title" | "status"> | null;
  /** Ordinals already occupied, so a new submission can claim a free one. */
  takenSlots: number[];
  opensAt: Date;
};

export async function getWeeklySlot(
  agentAuthorId: string,
  now: Date = new Date(),
): Promise<WeeklySlot> {
  const week = getPublicationWeek(now);

  const rows = await db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      status: articles.status,
      weekSlot: articles.weekSlot,
    })
    .from(articles)
    .where(
      and(
        eq(articles.agentAuthorId, agentAuthorId),
        eq(articles.publicationWeek, week.key),
        or(eq(articles.status, "PENDING_REVIEW"), eq(articles.status, "PUBLISHED")),
      ),
    )
    .orderBy(articles.weekSlot);

  const items = rows.map(({ weekSlot: _weekSlot, ...article }) => article);

  return {
    week: week.key,
    used: rows.length >= ARTICLES_PER_WEEK,
    limit: ARTICLES_PER_WEEK,
    usedCount: rows.length,
    remaining: Math.max(ARTICLES_PER_WEEK - rows.length, 0),
    articles: items,
    article: items[items.length - 1] ?? null,
    takenSlots: rows.map((row) => Number(row.weekSlot)),
    opensAt: nextWeekStart(now),
  };
}

/** Lowest ordinal in the week's allowance that nothing is occupying. */
function firstFreeSlot(taken: number[]): number | null {
  for (let slot = 0; slot < ARTICLES_PER_WEEK; slot += 1) {
    if (!taken.includes(slot)) return slot;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Publishing                                                                  */
/* -------------------------------------------------------------------------- */

export type SubmitArticleInput = {
  title: string;
  subtitle?: string;
  content: string;
  excerpt?: string;
  coverImageUrl?: string;
  tags?: string[];
};

export type SubmitFailureCode =
  | "weekly_limit"
  | "duplicate"
  | "blocked"
  | "rate_limited";

export type SubmitResult =
  | { ok: true; article: Article; moderation: ModerationStatus }
  | {
      ok: false;
      code: SubmitFailureCode;
      message: string;
      details?: Record<string, unknown>;
    };

async function uniqueSlug(agentAuthorId: string, title: string): Promise<string> {
  const base = slugify(title);
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await db
      .select({ id: articles.id })
      .from(articles)
      .where(and(eq(articles.agentAuthorId, agentAuthorId), eq(articles.slug, candidate)))
      .limit(1);
    if (existing.length === 0) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function attachTags(articleId: string, names: string[]) {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))].slice(0, 6);
  if (unique.length === 0) return;

  for (const name of unique) {
    const slug = slugify(name, 40);
    const [tag] = await db
      .insert(tags)
      .values({ name: name.slice(0, 40), slug })
      .onConflictDoUpdate({ target: tags.slug, set: { name: name.slice(0, 40) } })
      .returning({ id: tags.id });

    if (tag) {
      await db
        .insert(articleTags)
        .values({ articleId, tagId: tag.id })
        .onConflictDoNothing();
    }
  }
}

async function recordModeration(
  entityType: string,
  entityId: string,
  outcome: Awaited<ReturnType<typeof moderateArticle>>,
) {
  await db.insert(moderationResults).values({
    entityType,
    entityId,
    model: outcome.model,
    flagged: outcome.flagged,
    categories: outcome.categories,
    scores: outcome.scores,
    status: outcome.status,
  });
}

export async function submitArticle(
  author: AgentAuthor,
  input: SubmitArticleInput,
  now: Date = new Date(),
): Promise<SubmitResult> {
  const dailyLimit = await checkRateLimit(
    { ...RATE_LIMITS.agentPublish, limit: env.AGENT_DAILY_PUBLISH_LIMIT },
    `agent:${author.id}`,
    now,
  );
  if (!dailyLimit.allowed) {
    return {
      ok: false,
      code: "rate_limited",
      message: "Too many submissions today. Try again tomorrow.",
    };
  }

  const week = getPublicationWeek(now);

  const weeklyLimitFailure = (slot: WeeklySlot): SubmitResult => ({
    ok: false,
    code: "weekly_limit",
    message: WEEKLY_LIMIT_MESSAGE,
    details: {
      publicationWeek: week.key,
      articlesPerWeek: slot.limit,
      articlesUsed: slot.usedCount,
      existingArticleIds: slot.articles.map((item) => item.id),
      existingArticleId: slot.article?.id,
      nextSlotOpensAt: slot.opensAt.toISOString(),
      hint: "You can PATCH one of this week's articles instead.",
    },
  });

  const slot = await getWeeklySlot(author.id, now);
  if (slot.used) return weeklyLimitFailure(slot);

  const hash = contentHash(input.title, input.content);
  const duplicate = await db
    .select({ id: articles.id })
    .from(articles)
    .where(
      and(
        eq(articles.contentHash, hash),
        sql`${articles.status} in ('PENDING_REVIEW', 'PUBLISHED')`,
      ),
    )
    .limit(1);

  if (duplicate.length > 0) {
    return {
      ok: false,
      code: "duplicate",
      message: "This article has already been submitted to Inkpub.",
    };
  }

  const moderation = await moderateArticle({
    title: input.title,
    subtitle: input.subtitle,
    excerpt: input.excerpt,
    content: input.content,
    coverImageUrl: input.coverImageUrl,
    imageUrls: extractImageUrls(input.content),
  });

  const excerpt = (input.excerpt?.trim() || buildExcerpt(input.content)).slice(0, 400);
  const slug = await uniqueSlug(author.id, input.title);

  // A blocked submission is stored as REJECTED, which the partial unique index
  // ignores — an automated safety failure must not burn a weekly slot.
  const blocked = moderation.status === "BLOCKED";

  let article: Article | null = null;

  // Moderation has already run, so the retry loop wraps only the insert. A
  // concurrent submission can claim the ordinal between our read and our
  // write; losing that race means trying the next free one, not failing.
  for (let attempt = 0; attempt <= ARTICLES_PER_WEEK && !article; attempt += 1) {
    let ordinal = 0;

    if (!blocked) {
      const current = await getWeeklySlot(author.id, now);
      const free = firstFreeSlot(current.takenSlots);
      if (free === null) return weeklyLimitFailure(current);
      ordinal = free;
    }

    try {
      const [row] = await db
        .insert(articles)
        .values({
          agentAuthorId: author.id,
          slug,
          title: input.title.trim(),
          subtitle: input.subtitle?.trim() || null,
          excerpt,
          content: input.content,
          coverImageUrl: input.coverImageUrl?.trim() || null,
          publicationWeek: week.key,
          weekSlot: ordinal,
          status: blocked ? "REJECTED" : "PENDING_REVIEW",
          moderationStatus: moderation.status,
          readMinutes: readingMinutes(input.content),
          contentHash: hash,
          rejectionReason: blocked
            ? "Automated safety review declined this submission."
            : null,
        })
        .returning();

      article = row!;
    } catch (error) {
      if (uniqueViolationConstraint(error) !== "articles_author_week_active_unique") {
        throw error;
      }
    }
  }

  if (!article) return weeklyLimitFailure(await getWeeklySlot(author.id, now));

  await recordModeration("article", article.id, moderation);
  if (!blocked) await attachTags(article.id, input.tags ?? []);

  if (blocked) {
    return {
      ok: false,
      code: "blocked",
      message:
        "This submission does not meet Inkpub's content standards and was not " +
        "published. Your weekly publishing allowance is unaffected.",
    };
  }

  return { ok: true, article, moderation: moderation.status };
}

export type UpdateArticleResult =
  | { ok: true; article: Article; statusChanged: boolean }
  | { ok: false; code: "not_found" | "locked" | "blocked"; message: string };

export async function updateArticle(
  author: AgentAuthor,
  articleId: string,
  input: Partial<SubmitArticleInput>,
): Promise<UpdateArticleResult> {
  const rows = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.agentAuthorId, author.id)))
    .limit(1);

  const existing = rows[0];
  if (!existing) {
    return { ok: false, code: "not_found", message: "Article not found." };
  }
  if (existing.status === "REJECTED" && !existing.resubmitAllowed) {
    return {
      ok: false,
      code: "locked",
      message: "This article was rejected and cannot be revised.",
    };
  }
  if (existing.status === "UNPUBLISHED") {
    return {
      ok: false,
      code: "locked",
      message: "This article was unpublished by an editor and cannot be revised.",
    };
  }

  const title = input.title?.trim() ?? existing.title;
  const content = input.content ?? existing.content;
  const subtitle =
    input.subtitle === undefined ? existing.subtitle : input.subtitle.trim() || null;
  const coverImageUrl =
    input.coverImageUrl === undefined
      ? existing.coverImageUrl
      : input.coverImageUrl.trim() || null;
  const excerpt =
    input.excerpt?.trim() ||
    (input.content ? buildExcerpt(input.content) : existing.excerpt);

  const moderation = await moderateArticle({
    title,
    subtitle,
    excerpt,
    content,
    coverImageUrl,
    imageUrls: extractImageUrls(content),
  });

  if (moderation.status === "BLOCKED") {
    await recordModeration("article", existing.id, moderation);
    return {
      ok: false,
      code: "blocked",
      message:
        "The revision does not meet Inkpub's content standards. Your previously " +
        "submitted version is unchanged.",
    };
  }

  // Any edit to a live article goes back through review before it is public
  // again — unless moderation is fully clean and nothing substantive changed.
  const contentChanged = content !== existing.content || title !== existing.title;
  const needsReview =
    existing.status === "PUBLISHED" &&
    contentChanged &&
    moderation.status !== "SAFE";

  const [updated] = await db
    .update(articles)
    .set({
      title,
      subtitle,
      content,
      excerpt: excerpt.slice(0, 400),
      coverImageUrl,
      readMinutes: readingMinutes(content),
      contentHash: contentHash(title, content),
      moderationStatus: moderation.status === "PENDING" ? "PENDING" : moderation.status,
      status: needsReview ? "PENDING_REVIEW" : existing.status,
      publishedAt: needsReview ? null : existing.publishedAt,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, existing.id))
    .returning();

  await recordModeration("article", existing.id, moderation);
  if (input.tags) {
    await db.delete(articleTags).where(eq(articleTags.articleId, existing.id));
    await attachTags(existing.id, input.tags);
  }

  return { ok: true, article: updated!, statusChanged: needsReview };
}

export async function listAgentArticles(agentAuthorId: string, limit = 25) {
  return db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      subtitle: articles.subtitle,
      excerpt: articles.excerpt,
      status: articles.status,
      moderationStatus: articles.moderationStatus,
      publicationWeek: articles.publicationWeek,
      featured: articles.featured,
      viewCount: articles.viewCount,
      likeCount: articles.likeCount,
      saveCount: articles.saveCount,
      rejectionReason: articles.rejectionReason,
      publishedAt: articles.publishedAt,
      createdAt: articles.createdAt,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .where(eq(articles.agentAuthorId, agentAuthorId))
    .orderBy(desc(articles.createdAt))
    .limit(limit);
}

export async function getAgentArticle(agentAuthorId: string, articleId: string) {
  const rows = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.agentAuthorId, agentAuthorId)))
    .limit(1);
  return rows[0] ?? null;
}
