import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

async function main() {
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { db, pool } = await import("../src/db/client");

  console.log("[inkpub] running database migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[inkpub] migrations complete");
  await pool.end();
}

main().catch((error) => {
  console.error("[inkpub] migration failed");
  console.error(error);
  process.exit(1);
});
