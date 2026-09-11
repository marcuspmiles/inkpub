import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

/**
 * Token helpers. Nothing secret is ever stored in plaintext: sessions and API
 * keys are persisted as SHA-256 digests, pairing codes as HMAC digests.
 */

export const AGENT_TOKEN_PREFIX = "inkpub_sk_";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmac(value: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/* -------------------------------------------------------------------------- */
/* Pairing codes                                                               */
/* -------------------------------------------------------------------------- */

// Crockford-style alphabet: no I, L, O, U, 0, 1 — safe to read aloud to a bot.
const PAIRING_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

/** Human-friendly one-time pairing code, e.g. "K7PX-4M2Q". */
export function generatePairingCode(): string {
  const pick = () =>
    Array.from({ length: 4 }, () =>
      PAIRING_ALPHABET.charAt(randomInt(PAIRING_ALPHABET.length)),
    ).join("");
  return `${pick()}-${pick()}`;
}

/** Accepts "k7px4m2q", "K7PX-4M2Q", " k7px 4m2q " and friends. */
export function normalizePairingCode(input: string): string {
  const cleaned = (input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (cleaned.length !== 8) return cleaned;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}

export function hashPairingCode(code: string): string {
  return hmac(`pairing:${normalizePairingCode(code)}`);
}

export function pairingCodeHint(code: string): string {
  const normalized = normalizePairingCode(code);
  return `${normalized.slice(0, 2)}••-••${normalized.slice(-2)}`;
}

/* -------------------------------------------------------------------------- */
/* Agent API keys                                                              */
/* -------------------------------------------------------------------------- */

export type GeneratedApiKey = {
  token: string;
  tokenHash: string;
  tokenPrefix: string;
};

export function generateAgentApiKey(): GeneratedApiKey {
  const token = `${AGENT_TOKEN_PREFIX}${randomToken(32)}`;
  return {
    token,
    tokenHash: sha256(token),
    tokenPrefix: token.slice(0, 18),
  };
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                    */
/* -------------------------------------------------------------------------- */

export function generateSessionToken(): string {
  return randomToken(32);
}

export function hashSessionToken(token: string): string {
  return hmac(`session:${token}`);
}

/** Privacy-preserving hashes — raw IPs are never written to the database. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return hmac(`ip:${ip}`).slice(0, 64);
}

export function visitorHash(seed: string): string {
  return hmac(`visitor:${seed}`).slice(0, 64);
}
