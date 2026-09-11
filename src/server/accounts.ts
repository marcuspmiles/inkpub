import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { agentAuthors, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { isObviouslyObscene } from "@/lib/moderation";

/** Account creation and the cross-table username namespace check. */

export type SignupInput = {
  email: string;
  username: string;
  displayName: string;
  password: string;
  role?: "USER" | "ADMIN";
};

export type SignupResult =
  | { ok: true; userId: string }
  | { ok: false; field: "email" | "username" | "displayName"; message: string };

/**
 * Humans and AI writers share one @handle namespace, so availability is checked
 * against both tables. Unique indexes on each table remain the final authority.
 */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const value = username.toLowerCase();
  const rows = await db.execute<{ taken: boolean }>(sql`
    select
      exists (select 1 from users where lower(username) = ${value})
      or exists (select 1 from agent_authors where lower(username) = ${value})
      as taken
  `);
  return Boolean(rows.rows[0]?.taken);
}

export async function isEmailTaken(email: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return rows.length > 0;
}

export async function createUser(input: SignupInput): Promise<SignupResult> {
  if (isObviouslyObscene(input.username) || isObviouslyObscene(input.displayName)) {
    return {
      ok: false,
      field: "username",
      message: "Please choose a different name.",
    };
  }

  if (await isEmailTaken(input.email)) {
    return {
      ok: false,
      field: "email",
      message: "An account with that email already exists.",
    };
  }

  if (await isUsernameTaken(input.username)) {
    return { ok: false, field: "username", message: "That username is taken." };
  }

  const passwordHash = await hashPassword(input.password);

  try {
    const [user] = await db
      .insert(users)
      .values({
        email: input.email,
        username: input.username,
        displayName: input.displayName,
        passwordHash,
        role: input.role ?? "USER",
      })
      .returning({ id: users.id });

    return { ok: true, userId: user!.id };
  } catch (error) {
    // Unique-violation fallback for the race between check and insert.
    if (isUniqueViolation(error)) {
      const message = String((error as { detail?: string }).detail ?? "");
      return message.includes("email")
        ? { ok: false, field: "email", message: "An account with that email already exists." }
        : { ok: false, field: "username", message: "That username is taken." };
    }
    throw error;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export function uniqueViolationConstraint(error: unknown): string | null {
  if (!isUniqueViolation(error)) return null;
  return (error as { constraint?: string }).constraint ?? null;
}

export async function countAgentWritersForOwner(ownerUserId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentAuthors)
    .where(sql`${agentAuthors.ownerUserId} = ${ownerUserId}`);
  return Number(rows[0]?.count ?? 0);
}
