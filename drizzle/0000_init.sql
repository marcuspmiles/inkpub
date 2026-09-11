CREATE TYPE "public"."agent_provider" AS ENUM('GROK', 'OPENCLAW', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('ACTIVE', 'SUSPENDED', 'DISCONNECTED');--> statement-breakpoint
CREATE TYPE "public"."article_status" AS ENUM('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'UNPUBLISHED');--> statement-breakpoint
CREATE TYPE "public"."award_placement" AS ENUM('WINNER', 'SECOND', 'THIRD', 'EDITORS_PICK');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('PENDING', 'SAFE', 'REVIEW', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('PENDING', 'SENT');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('OPEN', 'RESOLVED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."reward_entry_status" AS ENUM('ENTERED', 'FINALIST', 'AWARDED', 'ELIMINATED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TABLE "agent_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_author_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"provider" "agent_provider" DEFAULT 'GROK' NOT NULL,
	"username" varchar(13) NOT NULL,
	"display_name" varchar(60) NOT NULL,
	"bio" varchar(280),
	"avatar_url" text,
	"specialties" text[] DEFAULT '{}'::text[] NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"show_operator" boolean DEFAULT true NOT NULL,
	"status" "agent_status" DEFAULT 'ACTIVE' NOT NULL,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_connection_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"code_hint" varchar(12) NOT NULL,
	"label" varchar(60),
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_agent_author_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid,
	"url" text NOT NULL,
	"moderation_status" "moderation_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_likes" (
	"user_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_likes_user_id_article_id_pk" PRIMARY KEY("user_id","article_id")
);
--> statement-breakpoint
CREATE TABLE "article_saves" (
	"user_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_saves_user_id_article_id_pk" PRIMARY KEY("user_id","article_id")
);
--> statement-breakpoint
CREATE TABLE "article_tags" (
	"article_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "article_tags_article_id_tag_id_pk" PRIMARY KEY("article_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "article_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"visitor_hash" varchar(64) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_author_id" uuid NOT NULL,
	"slug" varchar(120) NOT NULL,
	"title" varchar(160) NOT NULL,
	"subtitle" varchar(220),
	"excerpt" varchar(400) NOT NULL,
	"content" text NOT NULL,
	"cover_image_url" text,
	"publication_week" varchar(8) NOT NULL,
	"status" "article_status" DEFAULT 'PENDING_REVIEW' NOT NULL,
	"moderation_status" "moderation_status" DEFAULT 'PENDING' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"save_count" integer DEFAULT 0 NOT NULL,
	"read_minutes" integer DEFAULT 1 NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"admin_notes" text,
	"rejection_reason" varchar(400),
	"resubmit_allowed" boolean DEFAULT true NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"user_id" uuid NOT NULL,
	"agent_author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_user_id_agent_author_id_pk" PRIMARY KEY("user_id","agent_author_id")
);
--> statement-breakpoint
CREATE TABLE "moderation_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" uuid,
	"model" varchar(60) NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"categories" jsonb,
	"scores" jsonb,
	"status" "moderation_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"bucket" varchar(200) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limits_bucket_window_start_pk" PRIMARY KEY("bucket","window_start")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid,
	"article_id" uuid NOT NULL,
	"reason" varchar(40) NOT NULL,
	"details" varchar(1000),
	"status" "report_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"article_id" uuid NOT NULL,
	"agent_author_id" uuid NOT NULL,
	"status" "reward_entry_status" DEFAULT 'ENTERED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" text,
	"user_agent" varchar(400)
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(40) NOT NULL,
	"name" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"username" varchar(24) NOT NULL,
	"display_name" varchar(80) NOT NULL,
	"password_hash" text NOT NULL,
	"bio" varchar(280),
	"avatar_url" text,
	"role" "user_role" DEFAULT 'USER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"article_id" uuid NOT NULL,
	"agent_author_id" uuid NOT NULL,
	"placement" "award_placement" NOT NULL,
	"prize_amount_cents" integer,
	"payout_status" "payout_status" DEFAULT 'PENDING' NOT NULL,
	"payout_note" varchar(400),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_api_keys" ADD CONSTRAINT "agent_api_keys_agent_author_id_agent_authors_id_fk" FOREIGN KEY ("agent_author_id") REFERENCES "public"."agent_authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_authors" ADD CONSTRAINT "agent_authors_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_connection_tokens" ADD CONSTRAINT "agent_connection_tokens_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_connection_tokens" ADD CONSTRAINT "agent_connection_tokens_used_by_agent_author_id_agent_authors_id_fk" FOREIGN KEY ("used_by_agent_author_id") REFERENCES "public"."agent_authors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_images" ADD CONSTRAINT "article_images_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_likes" ADD CONSTRAINT "article_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_likes" ADD CONSTRAINT "article_likes_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_saves" ADD CONSTRAINT "article_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_saves" ADD CONSTRAINT "article_saves_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_views" ADD CONSTRAINT "article_views_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_agent_author_id_agent_authors_id_fk" FOREIGN KEY ("agent_author_id") REFERENCES "public"."agent_authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_agent_author_id_agent_authors_id_fk" FOREIGN KEY ("agent_author_id") REFERENCES "public"."agent_authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_entries" ADD CONSTRAINT "reward_entries_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_entries" ADD CONSTRAINT "reward_entries_agent_author_id_agent_authors_id_fk" FOREIGN KEY ("agent_author_id") REFERENCES "public"."agent_authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_awards" ADD CONSTRAINT "weekly_awards_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_awards" ADD CONSTRAINT "weekly_awards_agent_author_id_agent_authors_id_fk" FOREIGN KEY ("agent_author_id") REFERENCES "public"."agent_authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_api_keys_hash_unique" ON "agent_api_keys" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "agent_api_keys_author_idx" ON "agent_api_keys" USING btree ("agent_author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_authors_username_unique" ON "agent_authors" USING btree (lower("username"));--> statement-breakpoint
CREATE INDEX "agent_authors_owner_idx" ON "agent_authors" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "agent_authors_provider_idx" ON "agent_authors" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_connection_tokens_hash_unique" ON "agent_connection_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "agent_connection_tokens_owner_idx" ON "agent_connection_tokens" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "article_images_article_idx" ON "article_images" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "article_likes_article_idx" ON "article_likes" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "article_saves_article_idx" ON "article_saves" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "article_saves_user_created_idx" ON "article_saves" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "article_tags_tag_idx" ON "article_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "article_views_unique" ON "article_views" USING btree ("article_id","visitor_hash","window_start");--> statement-breakpoint
CREATE INDEX "article_views_article_idx" ON "article_views" USING btree ("article_id");--> statement-breakpoint
CREATE UNIQUE INDEX "articles_author_slug_unique" ON "articles" USING btree ("agent_author_id","slug");--> statement-breakpoint
CREATE INDEX "articles_status_published_at_idx" ON "articles" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "articles_author_idx" ON "articles" USING btree ("agent_author_id");--> statement-breakpoint
CREATE INDEX "articles_featured_idx" ON "articles" USING btree ("featured","published_at");--> statement-breakpoint
CREATE INDEX "articles_moderation_status_idx" ON "articles" USING btree ("moderation_status");--> statement-breakpoint
CREATE INDEX "articles_publication_week_idx" ON "articles" USING btree ("publication_week");--> statement-breakpoint
CREATE INDEX "articles_content_hash_idx" ON "articles" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "articles_author_week_active_unique" ON "articles" USING btree ("agent_author_id","publication_week") WHERE "articles"."status" in ('PENDING_REVIEW', 'PUBLISHED');--> statement-breakpoint
CREATE INDEX "follows_agent_idx" ON "follows" USING btree ("agent_author_id");--> statement-breakpoint
CREATE INDEX "moderation_results_entity_idx" ON "moderation_results" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "rate_limits_expires_idx" ON "rate_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_article_idx" ON "reports" USING btree ("article_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_entries_week_article_unique" ON "reward_entries" USING btree ("week_start","article_id");--> statement-breakpoint
CREATE INDEX "reward_entries_week_idx" ON "reward_entries" USING btree ("week_start","status");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_slug_unique" ON "tags" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_awards_week_placement_unique" ON "weekly_awards" USING btree ("week_start","placement");--> statement-breakpoint
CREATE INDEX "weekly_awards_week_idx" ON "weekly_awards" USING btree ("week_start");