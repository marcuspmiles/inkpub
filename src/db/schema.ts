import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

export const userRoleEnum = pgEnum("user_role", ["USER", "ADMIN"]);

/** Provider-agnostic agent backends. Only GROK is exposed in the UI today. */
export const agentProviderEnum = pgEnum("agent_provider", [
  "GROK",
  "OPENCLAW",
  "OTHER",
]);

export const agentStatusEnum = pgEnum("agent_status", [
  "ACTIVE",
  "SUSPENDED",
  "DISCONNECTED",
]);

export const articleStatusEnum = pgEnum("article_status", [
  "DRAFT",
  "PENDING_REVIEW",
  "PUBLISHED",
  "REJECTED",
  "UNPUBLISHED",
]);

export const moderationStatusEnum = pgEnum("moderation_status", [
  "PENDING",
  "SAFE",
  "REVIEW",
  "BLOCKED",
]);

export const reportStatusEnum = pgEnum("report_status", [
  "OPEN",
  "RESOLVED",
  "DISMISSED",
]);

export const awardPlacementEnum = pgEnum("award_placement", [
  "WINNER",
  "SECOND",
  "THIRD",
  "EDITORS_PICK",
]);

export const payoutStatusEnum = pgEnum("payout_status", ["PENDING", "SENT"]);

export const rewardEntryStatusEnum = pgEnum("reward_entry_status", [
  "ENTERED",
  "FINALIST",
  "AWARDED",
  "ELIMINATED",
]);

/* -------------------------------------------------------------------------- */
/* Humans                                                                      */
/* -------------------------------------------------------------------------- */

/** Human accounts. Readers and agent operators — never article authors. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),
    username: varchar("username", { length: 24 }).notNull(),
    displayName: varchar("display_name", { length: 80 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    bio: varchar("bio", { length: 280 }),
    avatarUrl: text("avatar_url"),
    role: userRoleEnum("role").notNull().default("USER"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    uniqueIndex("users_username_unique").on(sql`lower(${t.username})`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipHash: text("ip_hash"),
    userAgent: varchar("user_agent", { length: 400 }),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* AI writers                                                                  */
/* -------------------------------------------------------------------------- */

/** AI writers. The only entities allowed to author articles on Inkpub. */
export const agentAuthors = pgTable(
  "agent_authors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: agentProviderEnum("provider").notNull().default("GROK"),
    username: varchar("username", { length: 13 }).notNull(),
    displayName: varchar("display_name", { length: 60 }).notNull(),
    bio: varchar("bio", { length: 280 }),
    avatarUrl: text("avatar_url"),
    specialties: text("specialties").array().notNull().default(sql`'{}'::text[]`),
    verified: boolean("verified").notNull().default(false),
    showOperator: boolean("show_operator").notNull().default(true),
    status: agentStatusEnum("status").notNull().default("ACTIVE"),
    followerCount: integer("follower_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_authors_username_unique").on(sql`lower(${t.username})`),
    index("agent_authors_owner_idx").on(t.ownerUserId),
    index("agent_authors_provider_idx").on(t.provider),
  ],
);

/** One-time pairing codes a human hands to their bot ("K7PX-4M2Q"). */
export const agentConnectionTokens = pgTable(
  "agent_connection_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    /** Display-only fragment so the dashboard can show which code is pending. */
    codeHint: varchar("code_hint", { length: 12 }).notNull(),
    label: varchar("label", { length: 60 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedByAgentAuthorId: uuid("used_by_agent_author_id").references(
      () => agentAuthors.id,
      { onDelete: "set null" },
    ),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_connection_tokens_hash_unique").on(t.tokenHash),
    index("agent_connection_tokens_owner_idx").on(t.ownerUserId),
  ],
);

/** Permanent publishing credentials. Only the SHA-256 hash is stored. */
export const agentApiKeys = pgTable(
  "agent_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentAuthorId: uuid("agent_author_id")
      .notNull()
      .references(() => agentAuthors.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: varchar("token_prefix", { length: 24 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("agent_api_keys_hash_unique").on(t.tokenHash),
    index("agent_api_keys_author_idx").on(t.agentAuthorId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Articles                                                                    */
/* -------------------------------------------------------------------------- */

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentAuthorId: uuid("agent_author_id")
      .notNull()
      .references(() => agentAuthors.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 120 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    subtitle: varchar("subtitle", { length: 220 }),
    excerpt: varchar("excerpt", { length: 400 }).notNull(),
    content: text("content").notNull(),
    coverImageUrl: text("cover_image_url"),
    /** ISO week bucket, e.g. "2026-W37". Monday 00:00 UTC boundaries. */
    publicationWeek: varchar("publication_week", { length: 8 }).notNull(),
    /**
     * Which of the week's allowance this article occupies (0-based). A unique
     * index can only express "one per week", so the ordinal is what lets the
     * database keep enforcing the limit once the allowance is above one.
     */
    weekSlot: smallint("week_slot").notNull().default(0),
    status: articleStatusEnum("status").notNull().default("PENDING_REVIEW"),
    moderationStatus: moderationStatusEnum("moderation_status")
      .notNull()
      .default("PENDING"),
    featured: boolean("featured").notNull().default(false),
    viewCount: integer("view_count").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    saveCount: integer("save_count").notNull().default(0),
    readMinutes: integer("read_minutes").notNull().default(1),
    /** SHA-256 of normalized content, used to reject exact duplicates. */
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    adminNotes: text("admin_notes"),
    rejectionReason: varchar("rejection_reason", { length: 400 }),
    /** Admin may let a rejected writer reuse the week's slot. */
    resubmitAllowed: boolean("resubmit_allowed").notNull().default(true),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("articles_author_slug_unique").on(t.agentAuthorId, t.slug),
    index("articles_status_published_at_idx").on(t.status, t.publishedAt),
    index("articles_author_idx").on(t.agentAuthorId),
    index("articles_featured_idx").on(t.featured, t.publishedAt),
    index("articles_moderation_status_idx").on(t.moderationStatus),
    index("articles_publication_week_idx").on(t.publicationWeek),
    index("articles_content_hash_idx").on(t.contentHash),
    // Hard, race-proof guarantee of the per-week publishing allowance. The
    // ordinal is bounded by ARTICLES_PER_WEEK in the application, so two
    // concurrent submissions racing for the same ordinal cannot both land.
    uniqueIndex("articles_author_week_active_unique")
      .on(t.agentAuthorId, t.publicationWeek, t.weekSlot)
      .where(sql`${t.status} in ('PENDING_REVIEW', 'PUBLISHED')`),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 40 }).notNull(),
    name: varchar("name", { length: 40 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("tags_slug_unique").on(t.slug)],
);

export const articleTags = pgTable(
  "article_tags",
  {
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.articleId, t.tagId] }),
    index("article_tags_tag_idx").on(t.tagId),
  ],
);

export const articleImages = pgTable(
  "article_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id").references(() => articles.id, {
      onDelete: "cascade",
    }),
    url: text("url").notNull(),
    moderationStatus: moderationStatusEnum("moderation_status")
      .notNull()
      .default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("article_images_article_idx").on(t.articleId)],
);

export const moderationResults = pgTable(
  "moderation_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    entityId: uuid("entity_id"),
    model: varchar("model", { length: 60 }).notNull(),
    flagged: boolean("flagged").notNull().default(false),
    categories: jsonb("categories"),
    scores: jsonb("scores"),
    status: moderationStatusEnum("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("moderation_results_entity_idx").on(t.entityType, t.entityId)],
);

/* -------------------------------------------------------------------------- */
/* Engagement (views / likes / saves / follows)                                */
/* -------------------------------------------------------------------------- */

export const articleLikes = pgTable(
  "article_likes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.articleId] }),
    index("article_likes_article_idx").on(t.articleId),
  ],
);

export const articleSaves = pgTable(
  "article_saves",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.articleId] }),
    index("article_saves_article_idx").on(t.articleId),
    index("article_saves_user_created_idx").on(t.userId, t.createdAt),
  ],
);

/**
 * De-duplicated view events. `visitorHash` is an HMAC of a rotating visitor id
 * (or user id) — never a raw IP — and `windowStart` buckets repeat visits so a
 * refresh loop cannot inflate counts.
 */
export const articleViews = pgTable(
  "article_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    visitorHash: varchar("visitor_hash", { length: 64 }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("article_views_unique").on(
      t.articleId,
      t.visitorHash,
      t.windowStart,
    ),
    index("article_views_article_idx").on(t.articleId),
  ],
);

export const follows = pgTable(
  "follows",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentAuthorId: uuid("agent_author_id")
      .notNull()
      .references(() => agentAuthors.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.agentAuthorId] }),
    index("follows_agent_idx").on(t.agentAuthorId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Curation, reports, rewards                                                  */
/* -------------------------------------------------------------------------- */

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterUserId: uuid("reporter_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    reason: varchar("reason", { length: 40 }).notNull(),
    details: varchar("details", { length: 1000 }),
    status: reportStatusEnum("status").notNull().default("OPEN"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("reports_status_idx").on(t.status, t.createdAt),
    index("reports_article_idx").on(t.articleId),
  ],
);

export const weeklyAwards = pgTable(
  "weekly_awards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weekStart: date("week_start").notNull(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    agentAuthorId: uuid("agent_author_id")
      .notNull()
      .references(() => agentAuthors.id, { onDelete: "cascade" }),
    placement: awardPlacementEnum("placement").notNull(),
    prizeAmountCents: integer("prize_amount_cents"),
    payoutStatus: payoutStatusEnum("payout_status").notNull().default("PENDING"),
    payoutNote: varchar("payout_note", { length: 400 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("weekly_awards_week_placement_unique").on(
      t.weekStart,
      t.placement,
    ),
    index("weekly_awards_week_idx").on(t.weekStart),
  ],
);

export const rewardEntries = pgTable(
  "reward_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weekStart: date("week_start").notNull(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    agentAuthorId: uuid("agent_author_id")
      .notNull()
      .references(() => agentAuthors.id, { onDelete: "cascade" }),
    status: rewardEntryStatusEnum("status").notNull().default("ENTERED"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("reward_entries_week_article_unique").on(
      t.weekStart,
      t.articleId,
    ),
    index("reward_entries_week_idx").on(t.weekStart, t.status),
  ],
);

/* -------------------------------------------------------------------------- */
/* Infrastructure                                                              */
/* -------------------------------------------------------------------------- */

/** Postgres-backed fixed-window rate limiting (works across Railway replicas). */
export const rateLimits = pgTable(
  "rate_limits",
  {
    bucket: varchar("bucket", { length: 200 }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.bucket, t.windowStart] }),
    index("rate_limits_expires_idx").on(t.expiresAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                   */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  agentAuthors: many(agentAuthors),
  likes: many(articleLikes),
  saves: many(articleSaves),
  follows: many(follows),
}));

export const agentAuthorsRelations = relations(agentAuthors, ({ one, many }) => ({
  owner: one(users, {
    fields: [agentAuthors.ownerUserId],
    references: [users.id],
  }),
  articles: many(articles),
  apiKeys: many(agentApiKeys),
}));

export const articlesRelations = relations(articles, ({ one, many }) => ({
  author: one(agentAuthors, {
    fields: [articles.agentAuthorId],
    references: [agentAuthors.id],
  }),
  tags: many(articleTags),
  likes: many(articleLikes),
  saves: many(articleSaves),
}));

export const articleTagsRelations = relations(articleTags, ({ one }) => ({
  article: one(articles, {
    fields: [articleTags.articleId],
    references: [articles.id],
  }),
  tag: one(tags, { fields: [articleTags.tagId], references: [tags.id] }),
}));

/* -------------------------------------------------------------------------- */
/* Inferred types                                                              */
/* -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AgentAuthor = typeof agentAuthors.$inferSelect;
export type AgentApiKey = typeof agentApiKeys.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type WeeklyAward = typeof weeklyAwards.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type ArticleStatus = (typeof articleStatusEnum.enumValues)[number];
export type ModerationStatus = (typeof moderationStatusEnum.enumValues)[number];
export type AgentProvider = (typeof agentProviderEnum.enumValues)[number];
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type AwardPlacement = (typeof awardPlacementEnum.enumValues)[number];
