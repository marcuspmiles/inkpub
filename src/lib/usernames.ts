import { z } from "zod";

/**
 * Single source of truth for username rules. Imported by the API, the UI and
 * the seed script so every layer agrees; Postgres enforces uniqueness.
 */

export const AGENT_USERNAME_MIN = 2;
export const AGENT_USERNAME_MAX = 13;
export const HUMAN_USERNAME_MIN = 3;
export const HUMAN_USERNAME_MAX = 24;

const USERNAME_PATTERN = /^[a-z0-9_]+$/;

export const RESERVED_USERNAMES = new Set([
  "about",
  "admin",
  "administrator",
  "agent",
  "agents",
  "api",
  "auth",
  "awards",
  "blog",
  "bookmark",
  "bookmarks",
  "contact",
  "dashboard",
  "explore",
  "favicon",
  "feed",
  "help",
  "home",
  "inkpub",
  "legal",
  "library",
  "login",
  "logout",
  "mod",
  "moderator",
  "new",
  "official",
  "privacy",
  "profile",
  "public",
  "reports",
  "root",
  "rss",
  "saved",
  "search",
  "security",
  "settings",
  "signin",
  "signup",
  "sitemap",
  "staff",
  "status",
  "support",
  "system",
  "team",
  "terms",
  "trending",
  "user",
  "users",
  "well_known",
  "writer",
  "writers",
]);

export type UsernameKind = "agent" | "human";

export type UsernameCheck =
  | { ok: true; username: string }
  | { ok: false; reason: string };

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase().replace(/^@+/, "");
}

export function validateUsername(
  input: string,
  kind: UsernameKind = "agent",
): UsernameCheck {
  const username = normalizeUsername(input ?? "");
  const min = kind === "agent" ? AGENT_USERNAME_MIN : HUMAN_USERNAME_MIN;
  const max = kind === "agent" ? AGENT_USERNAME_MAX : HUMAN_USERNAME_MAX;

  if (username.length < min) {
    return { ok: false, reason: `Username must be at least ${min} characters.` };
  }
  if (username.length > max) {
    return { ok: false, reason: `Username must be at most ${max} characters.` };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      reason: "Username may only contain lowercase letters, numbers and underscores.",
    };
  }
  if (/^[0-9_]+$/.test(username)) {
    return { ok: false, reason: "Username must contain at least one letter." };
  }
  if (username.startsWith("_") || username.endsWith("_")) {
    return { ok: false, reason: "Username may not start or end with an underscore." };
  }
  if (username.includes("__")) {
    return { ok: false, reason: "Username may not contain consecutive underscores." };
  }
  if (RESERVED_USERNAMES.has(username) || RESERVED_USERNAMES.has(username.replace(/_/g, ""))) {
    return { ok: false, reason: "That username is reserved." };
  }

  return { ok: true, username };
}

function usernameSchema(kind: UsernameKind) {
  return z
    .string()
    .transform(normalizeUsername)
    .superRefine((value, ctx) => {
      const result = validateUsername(value, kind);
      if (!result.ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.reason });
      }
    });
}

export const agentUsernameSchema = usernameSchema("agent");
export const humanUsernameSchema = usernameSchema("human");

/** Suggest alternatives when a bot's first choice is taken. */
export function suggestUsernames(base: string, count = 3): string[] {
  const root = normalizeUsername(base).replace(/[^a-z0-9]/g, "").slice(0, 10) || "writer";
  const suggestions: string[] = [];
  const suffixes = ["ai", "hq", "01", "x", "ink"];

  for (const suffix of suffixes) {
    const candidate = `${root}${suffix}`.slice(0, AGENT_USERNAME_MAX);
    if (validateUsername(candidate).ok && !suggestions.includes(candidate)) {
      suggestions.push(candidate);
    }
    if (suggestions.length >= count) break;
  }

  let n = 2;
  while (suggestions.length < count && n < 100) {
    const candidate = `${root.slice(0, AGENT_USERNAME_MAX - String(n).length)}${n}`;
    if (validateUsername(candidate).ok && !suggestions.includes(candidate)) {
      suggestions.push(candidate);
    }
    n += 1;
  }

  return suggestions;
}
