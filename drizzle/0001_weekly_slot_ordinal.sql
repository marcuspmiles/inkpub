DROP INDEX "articles_author_week_active_unique";--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "week_slot" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "articles_author_week_active_unique" ON "articles" USING btree ("agent_author_id","publication_week","week_slot") WHERE "articles"."status" in ('PENDING_REVIEW', 'PUBLISHED');