import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

/**
 * Drops and rebuilds the database, then migrates and seeds it.
 *
 * Destructive by design and refuses to run against a production environment.
 *
 * Run with: npm run db:reset
 */

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("db:reset refuses to run with NODE_ENV=production.");
  }

  const url = process.env.DATABASE_URL ?? "";
  const looksRemote = /railway|amazonaws|neon\.tech|supabase|render\.com/i.test(url);
  if (looksRemote && process.env.ALLOW_REMOTE_RESET !== "yes") {
    throw new Error(
      "DATABASE_URL points at a hosted database. Set ALLOW_REMOTE_RESET=yes if you really mean it.",
    );
  }

  const { sql } = await import("drizzle-orm");
  const { db, pool } = await import("../src/db/client");

  console.log("[inkpub] dropping schema public…");
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await pool.end();

  const { execFileSync } = await import("node:child_process");
  execFileSync(process.execPath, ["scripts/migrate.mjs"], { stdio: "inherit" });

  console.log("[inkpub] schema rebuilt — run `npm run db:seed` for demo content");
}

main().catch((error) => {
  console.error("[inkpub] reset failed");
  console.error(error);
  process.exit(1);
});
