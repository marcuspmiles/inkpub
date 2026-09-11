#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import pg from "pg";

/**
 * Applies the SQL files in ./drizzle.
 *
 * Written in plain JavaScript against `pg` alone so the exact same code path
 * runs locally and as Railway's pre-deploy command, where the container has no
 * TypeScript toolchain. The migration table, hashing and ordering match
 * drizzle-kit's own migrator, so the two stay interchangeable.
 *
 * Run with: npm run db:migrate
 */

const ROOT = process.cwd();
const FOLDER = path.join(ROOT, "drizzle");

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
  }
}

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env"));

function readMigrations() {
  const journalPath = path.join(FOLDER, "meta", "_journal.json");
  if (!existsSync(journalPath)) {
    throw new Error(`No migration journal at ${journalPath}. Run: npm run db:generate`);
  }

  const journal = JSON.parse(readFileSync(journalPath, "utf8"));

  return journal.entries.map((entry) => {
    const file = path.join(FOLDER, `${entry.tag}.sql`);
    if (!existsSync(file)) throw new Error(`Missing migration file: ${file}`);
    const query = readFileSync(file, "utf8");
    return {
      tag: entry.tag,
      when: entry.when,
      statements: query.split("--> statement-breakpoint"),
      hash: createHash("sha256").update(query).digest("hex"),
    };
  });
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");

  const needsSsl =
    process.env.NODE_ENV === "production" &&
    !/(^|[?&])sslmode=disable/.test(connectionString) &&
    !/(localhost|127\.0\.0\.1|\.railway\.internal)/.test(connectionString);

  const client = new pg.Client({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 30_000,
  });

  await client.connect();

  try {
    await client.query(`create schema if not exists "drizzle"`);
    await client.query(`
      create table if not exists "drizzle"."__drizzle_migrations" (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `);

    const { rows } = await client.query(
      `select created_at from "drizzle"."__drizzle_migrations" order by created_at desc limit 1`,
    );
    const lastApplied = rows[0] ? Number(rows[0].created_at) : null;

    const pending = readMigrations().filter(
      (migration) => lastApplied === null || lastApplied < migration.when,
    );

    if (pending.length === 0) {
      console.log("[inkpub] database is up to date");
      return;
    }

    await client.query("begin");
    try {
      for (const migration of pending) {
        console.log(`[inkpub] applying ${migration.tag}`);
        for (const statement of migration.statements) {
          if (statement.trim()) await client.query(statement);
        }
        await client.query(
          `insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values ($1, $2)`,
          [migration.hash, migration.when],
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    console.log(`[inkpub] applied ${pending.length} migration(s)`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[inkpub] migration failed");
  console.error(error);
  process.exit(1);
});
