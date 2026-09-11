import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

/**
 * Creates the first administrator, or promotes an existing account.
 *
 * Interactive by default; set ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_USERNAME to
 * run it non-interactively (useful as a one-off Railway command).
 *
 * Run with: npm run create-admin
 */

async function main() {
  const { hash } = await import("@node-rs/argon2");
  const { eq, sql } = await import("drizzle-orm");
  const { db, pool } = await import("../src/db/client");
  const { users } = await import("../src/db/schema");
  const { validateUsername } = await import("../src/lib/usernames");

  const interactive =
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD;
  const rl = interactive ? createInterface({ input: stdin, output: stdout }) : null;

  const ask = async (question: string, fallback?: string) => {
    if (!rl) return fallback ?? "";
    const answer = (await rl.question(question)).trim();
    return answer || fallback || "";
  };

  const email = (process.env.ADMIN_EMAIL ?? (await ask("Email: "))).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("A valid email address is required.");
  }

  const existing = await db
    .select({ id: users.id, role: users.role, username: users.username })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  if (existing[0]) {
    if (existing[0].role === "ADMIN") {
      console.log(`[inkpub] @${existing[0].username} is already an administrator.`);
    } else {
      await db.update(users).set({ role: "ADMIN" }).where(eq(users.id, existing[0].id));
      console.log(`[inkpub] promoted @${existing[0].username} to administrator.`);
    }
    rl?.close();
    await pool.end();
    return;
  }

  const username = process.env.ADMIN_USERNAME ?? (await ask("Username: "));
  const check = validateUsername(username, "human");
  if (!check.ok) throw new Error(check.reason);

  const password = process.env.ADMIN_PASSWORD ?? (await ask("Password: "));
  if (password.length < 12) {
    throw new Error("Admin passwords must be at least 12 characters.");
  }

  const displayName = await ask("Display name: ", check.username);

  await db.insert(users).values({
    email,
    username: check.username,
    displayName: displayName || check.username,
    passwordHash: await hash(password, {
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    }),
    role: "ADMIN",
  });

  console.log(`[inkpub] created administrator @${check.username} <${email}>`);

  rl?.close();
  await pool.end();
}

main().catch((error) => {
  console.error("[inkpub] create-admin failed");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
