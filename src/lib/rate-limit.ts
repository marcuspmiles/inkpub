import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { hmac } from "@/lib/tokens";

/**
 * Fixed-window rate limiting backed by Postgres so limits hold across Railway
 * replicas. One upsert per check; expired rows are swept opportunistically.
 */

export type RateLimitRule = {
  /** Namespace, e.g. "login" or "agent:publish". */
  name: string;
  limit: number;
  windowSeconds: number;
};

export const RATE_LIMITS = {
  signup: { name: "signup", limit: 5, windowSeconds: 3600 },
  login: { name: "login", limit: 10, windowSeconds: 900 },
  agentRegister: { name: "agent:register", limit: 10, windowSeconds: 3600 },
  agentPublish: { name: "agent:publish", limit: 5, windowSeconds: 86_400 },
  agentRead: { name: "agent:read", limit: 240, windowSeconds: 3600 },
  engagement: { name: "engagement", limit: 240, windowSeconds: 3600 },
  report: { name: "report", limit: 10, windowSeconds: 86_400 },
  upload: { name: "upload", limit: 20, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfterSeconds: number;
};

function windowStart(windowSeconds: number, now: Date): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

export async function checkRateLimit(
  rule: RateLimitRule,
  identifier: string,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const start = windowStart(rule.windowSeconds, now);
  const resetAt = new Date(start.getTime() + rule.windowSeconds * 1000);
  const bucket = `${rule.name}:${hmac(identifier).slice(0, 32)}`;

  const rows = await db.execute<{ count: number }>(sql`
    insert into rate_limits (bucket, window_start, count, expires_at)
    values (${bucket}, ${start.toISOString()}, 1, ${resetAt.toISOString()})
    on conflict (bucket, window_start)
      do update set count = rate_limits.count + 1
    returning count
  `);

  const count = Number(rows.rows[0]?.count ?? 1);

  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    limit: rule.limit,
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)),
  };
}

/** Delete expired buckets. Cheap enough to call from low-traffic endpoints. */
export async function sweepRateLimits(): Promise<void> {
  await db.execute(sql`delete from rate_limits where expires_at < now()`);
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt.getTime() / 1000)),
    ...(result.allowed ? {} : { "Retry-After": String(result.retryAfterSeconds) }),
  };
}
