import { execFileSync } from "node:child_process";

import { afterAll, beforeAll, beforeEach } from "vitest";

/**
 * Test harness. Points the app at a dedicated database, migrates it once, and
 * truncates every table between tests so each one starts from an empty schema.
 *
 * Create the database first:
 *   createdb inkpub_test
 * or override the connection with TEST_DATABASE_URL.
 */

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://inkpub:inkpub@127.0.0.1:5432/inkpub_test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "test-session-secret-value-not-used-in-production";
process.env.APP_URL = "http://localhost:3000";
// Keep the external moderation call out of the test suite.
delete process.env.OPENAI_API_KEY;

const TABLES = [
  "article_likes",
  "article_saves",
  "article_views",
  "article_tags",
  "article_images",
  "moderation_results",
  "reward_entries",
  "weekly_awards",
  "reports",
  "articles",
  "tags",
  "follows",
  "agent_api_keys",
  "agent_connection_tokens",
  "agent_authors",
  "sessions",
  "users",
  "rate_limits",
];

beforeAll(() => {
  execFileSync(process.execPath, ["scripts/migrate.mjs"], {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
});

beforeEach(async () => {
  const { sql } = await import("drizzle-orm");
  const { db } = await import("@/db/client");
  await db.execute(sql.raw(`truncate table ${TABLES.join(", ")} restart identity cascade`));
});

afterAll(async () => {
  const { pool } = await import("@/db/client");
  await pool.end();
});
