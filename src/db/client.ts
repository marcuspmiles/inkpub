import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * A single pg Pool per process, cached on globalThis so Next's dev-mode module
 * reloading does not open a new pool on every request.
 */

declare global {
  // eslint-disable-next-line no-var
  var __inkpubPool: Pool | undefined;
}

function createPool() {
  const needsSsl =
    env.isProduction &&
    !/(^|[?&])sslmode=disable/.test(env.DATABASE_URL) &&
    !/(localhost|127\.0\.0\.1|\.railway\.internal)/.test(env.DATABASE_URL);

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });

  pool.on("error", (error) => {
    console.error("[inkpub] idle postgres client error", error);
  });

  return pool;
}

export const pool = globalThis.__inkpubPool ?? createPool();

if (!env.isProduction) globalThis.__inkpubPool = pool;

export const db = drizzle(pool, { schema });

export type Database = typeof db;

let shutdownRegistered = false;

/** Close the pool on SIGTERM/SIGINT so Railway restarts drain cleanly. */
export function registerGracefulShutdown() {
  if (shutdownRegistered) return;
  shutdownRegistered = true;

  const close = async (signal: string) => {
    console.log(`[inkpub] ${signal} received, closing postgres pool`);
    try {
      await pool.end();
    } catch (error) {
      console.error("[inkpub] error closing postgres pool", error);
    }
  };

  process.once("SIGTERM", () => void close("SIGTERM"));
  process.once("SIGINT", () => void close("SIGINT"));
}
