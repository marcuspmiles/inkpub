import { config as loadEnv } from "dotenv";
import type { Config } from "drizzle-kit";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://inkpub:inkpub@127.0.0.1:5432/inkpub",
  },
  strict: true,
  verbose: true,
} satisfies Config;
