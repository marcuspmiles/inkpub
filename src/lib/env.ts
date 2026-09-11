import { z } from "zod";

/**
 * Environment validation. Runs once per process. In production a missing or
 * weak required value is fatal; in development we fall back to safe local
 * defaults so `npm run dev` works immediately after `git clone`.
 */

const isProduction = process.env.NODE_ENV === "production";

/**
 * `next build` evaluates route modules with NODE_ENV=production but without the
 * deployment's secrets — that is expected, not a misconfiguration. Production
 * strictness therefore applies at runtime only, so a build never needs real
 * credentials and none can be baked into an image.
 */
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z
    .string()
    .min(16, "SESSION_SECRET must be at least 16 characters"),
  OPENAI_API_KEY: z.string().trim().optional(),
  AGENT_DAILY_PUBLISH_LIMIT: z.coerce.number().int().min(1).max(100).default(5),
  S3_ENDPOINT: z.string().trim().optional(),
  S3_REGION: z.string().trim().default("auto"),
  S3_BUCKET: z.string().trim().optional(),
  S3_ACCESS_KEY_ID: z.string().trim().optional(),
  S3_SECRET_ACCESS_KEY: z.string().trim().optional(),
  S3_PUBLIC_BASE_URL: z.string().trim().optional(),
});

const DEV_FALLBACKS = {
  DATABASE_URL: "postgres://inkpub:inkpub@127.0.0.1:5432/inkpub",
  SESSION_SECRET: "dev-only-insecure-session-secret-change-me-please",
} as const;

function blank(value: string | undefined) {
  return value === undefined || value.trim() === "";
}

function load() {
  const raw = { ...process.env } as Record<string, string | undefined>;

  if (!isProduction || isBuildPhase) {
    for (const [key, fallback] of Object.entries(DEV_FALLBACKS)) {
      if (blank(raw[key])) raw[key] = fallback;
    }
  }

  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const value = parsed.data;

  if (isProduction && !isBuildPhase) {
    if (value.SESSION_SECRET === DEV_FALLBACKS.SESSION_SECRET) {
      throw new Error(
        "SESSION_SECRET must be set to a unique random value in production.",
      );
    }
    if (value.SESSION_SECRET.length < 32) {
      throw new Error(
        "SESSION_SECRET must be at least 32 characters in production.",
      );
    }
    if (value.APP_URL === "http://localhost:3000") {
      console.warn(
        "[inkpub] APP_URL is still http://localhost:3000 in production — " +
          "canonical URLs and agent instructions will be wrong.",
      );
    }
  }

  return {
    ...value,
    isProduction,
    isDevelopment: value.NODE_ENV === "development",
    isTest: value.NODE_ENV === "test",
    moderationEnabled: !blank(value.OPENAI_API_KEY),
    s3Configured:
      !blank(value.S3_BUCKET) &&
      !blank(value.S3_ACCESS_KEY_ID) &&
      !blank(value.S3_SECRET_ACCESS_KEY),
  };
}

export const env = load();

export type Env = typeof env;
