import { env } from "@/lib/env";

/**
 * Content moderation. Two layers:
 *
 *  1. A deliberately tiny local pre-filter that catches obviously obscene
 *     strings before we spend an API call (used for titles and usernames too).
 *  2. OpenAI `omni-moderation-latest` for text and images.
 *
 * Ordinary adult discussion, business writing, mild profanity and controversial
 * opinions must pass. The bar is pornography, sexual content involving minors,
 * extreme gore, hateful/threatening material, severe harassment and obscene spam.
 */

export type ModerationDecision = "SAFE" | "REVIEW" | "BLOCKED" | "PENDING";

export type ModerationOutcome = {
  status: ModerationDecision;
  flagged: boolean;
  model: string;
  categories: Record<string, boolean>;
  scores: Record<string, number>;
  /** Neutral, user-safe sentence. Never contains category scores. */
  message?: string;
};

const MODEL = "omni-moderation-latest";
const LOCAL_MODEL = "inkpub-local-prefilter";

/** Small and intentionally not a censorship list. Severe cases only. */
const HARD_BLOCK_PATTERNS: RegExp[] = [
  /\bchild\s*(porn|pornography)\b/i,
  /\bcp\s*(porn|videos?)\b/i,
  /\b(lolicon|shotacon)\b/i,
  /\b(preteen|underage|minors?)\b[^.\n]{0,24}\b(sex|nude|porn|nsfw)\b/i,
  /\b(sex|nude|porn|nsfw)\b[^.\n]{0,24}\b(preteen|underage|minors?|child(ren)?)\b/i,
  /\b(bestiality|zoophilia)\b/i,
  /\brape\s*(porn|video|fantasy)\b/i,
  /\b(snuff)\s*(film|video|porn)\b/i,
  /\bgas\s+the\s+\w+\b/i,
  /\bkill\s+all\s+(the\s+)?\w+s\b/i,
];

/** Sends to human review rather than blocking outright. */
const REVIEW_PATTERNS: RegExp[] = [
  /\b(xxx|hardcore\s+porn|pornhub|onlyfans)\b/i,
  /\bnudes?\s+(leak|leaked|pics?)\b/i,
  /\b(buy|cheap|order)\s+(viagra|cialis|xanax|oxycodone)\b/i,
  /\b(free\s+crypto|double\s+your\s+(btc|eth)|airdrop\s+claim)\b/i,
];

export type LocalFilterResult = {
  status: Extract<ModerationDecision, "SAFE" | "REVIEW" | "BLOCKED">;
  matched?: string;
};

export function localPreFilter(text: string): LocalFilterResult {
  const value = (text ?? "").normalize("NFKC");

  for (const pattern of HARD_BLOCK_PATTERNS) {
    if (pattern.test(value)) return { status: "BLOCKED", matched: pattern.source };
  }
  for (const pattern of REVIEW_PATTERNS) {
    if (pattern.test(value)) return { status: "REVIEW", matched: pattern.source };
  }
  return { status: "SAFE" };
}

/** Convenience guard for short strings: usernames, display names, titles. */
export function isObviouslyObscene(text: string): boolean {
  return localPreFilter(text).status === "BLOCKED";
}

/* -------------------------------------------------------------------------- */
/* OpenAI omni-moderation                                                      */
/* -------------------------------------------------------------------------- */

type OmniModerationResult = {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
};

/** Categories that block outright rather than going to the review queue. */
const BLOCKING_CATEGORIES = new Set([
  "sexual/minors",
  "sexual",
  "violence/graphic",
  "hate/threatening",
  "harassment/threatening",
  "self-harm/instructions",
]);

const BLOCK_THRESHOLD = 0.7;
const REVIEW_THRESHOLD = 0.35;

let warnedAboutMissingKey = false;

function moderationDisabledOutcome(reason: string): ModerationOutcome {
  if (!warnedAboutMissingKey) {
    warnedAboutMissingKey = true;
    console.warn(
      `[inkpub] external moderation disabled (${reason}); local pre-filter only, ` +
        "content will be queued for human review",
    );
  }
  return {
    status: "PENDING",
    flagged: false,
    model: LOCAL_MODEL,
    categories: {},
    scores: {},
  };
}

async function callOpenAiModeration(
  input: unknown,
): Promise<OmniModerationResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, input }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(
        "[inkpub] moderation request failed",
        response.status,
        await response.text().catch(() => ""),
      );
      return null;
    }

    const payload = (await response.json()) as { results?: OmniModerationResult[] };
    return payload.results?.[0] ?? null;
  } catch (error) {
    console.error("[inkpub] moderation request error", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function decide(result: OmniModerationResult): ModerationDecision {
  let decision: ModerationDecision = "SAFE";

  for (const [category, score] of Object.entries(result.category_scores ?? {})) {
    if (BLOCKING_CATEGORIES.has(category) && score >= BLOCK_THRESHOLD) {
      return "BLOCKED";
    }
    if (score >= REVIEW_THRESHOLD) decision = "REVIEW";
  }

  if (result.flagged && decision === "SAFE") decision = "REVIEW";
  return decision;
}

export async function moderateText(text: string): Promise<ModerationOutcome> {
  const local = localPreFilter(text);
  if (local.status === "BLOCKED") {
    return {
      status: "BLOCKED",
      flagged: true,
      model: LOCAL_MODEL,
      categories: { local_prefilter: true },
      scores: {},
      message: "This submission does not meet Inkpub's content standards.",
    };
  }

  if (!env.moderationEnabled) {
    const outcome = moderationDisabledOutcome("OPENAI_API_KEY not set");
    return local.status === "REVIEW" ? { ...outcome, status: "REVIEW" } : outcome;
  }

  const result = await callOpenAiModeration([{ type: "text", text }]);
  if (!result) {
    return {
      status: "REVIEW",
      flagged: false,
      model: MODEL,
      categories: {},
      scores: {},
      message: "Moderation is temporarily unavailable; queued for review.",
    };
  }

  const status = decide(result);
  return {
    status: local.status === "REVIEW" && status === "SAFE" ? "REVIEW" : status,
    flagged: result.flagged,
    model: MODEL,
    categories: result.categories ?? {},
    scores: result.category_scores ?? {},
    message:
      status === "BLOCKED"
        ? "This submission does not meet Inkpub's content standards."
        : undefined,
  };
}

export async function moderateImage(imageUrl: string): Promise<ModerationOutcome> {
  if (!env.moderationEnabled) return moderationDisabledOutcome("OPENAI_API_KEY not set");

  const result = await callOpenAiModeration([
    { type: "image_url", image_url: { url: imageUrl } },
  ]);

  if (!result) {
    return {
      status: "REVIEW",
      flagged: false,
      model: MODEL,
      categories: {},
      scores: {},
    };
  }

  const status = decide(result);
  return {
    status,
    flagged: result.flagged,
    model: MODEL,
    categories: result.categories ?? {},
    scores: result.category_scores ?? {},
    message:
      status === "BLOCKED"
        ? "This image does not meet Inkpub's content standards."
        : undefined,
  };
}

export type ArticleModerationInput = {
  title: string;
  subtitle?: string | null;
  excerpt?: string | null;
  content: string;
  coverImageUrl?: string | null;
  imageUrls?: string[];
};

export type ArticleModerationOutcome = ModerationOutcome & {
  text: ModerationOutcome;
  images: Array<{ url: string; outcome: ModerationOutcome }>;
};

const SEVERITY: Record<ModerationDecision, number> = {
  SAFE: 0,
  PENDING: 1,
  REVIEW: 2,
  BLOCKED: 3,
};

function worst(a: ModerationDecision, b: ModerationDecision): ModerationDecision {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

export async function moderateArticle(
  article: ArticleModerationInput,
): Promise<ArticleModerationOutcome> {
  const combined = [
    article.title,
    article.subtitle ?? "",
    article.excerpt ?? "",
    article.content,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 40_000);

  const text = await moderateText(combined);

  const urls = [article.coverImageUrl, ...(article.imageUrls ?? [])]
    .filter((url): url is string => Boolean(url && /^https?:\/\//i.test(url)))
    .slice(0, 4);

  const images: Array<{ url: string; outcome: ModerationOutcome }> = [];
  let status = text.status;

  if (text.status !== "BLOCKED") {
    for (const url of urls) {
      const outcome = await moderateImage(url);
      images.push({ url, outcome });
      status = worst(status, outcome.status);
      if (outcome.status === "BLOCKED") break;
    }
  }

  return {
    status,
    flagged: text.flagged || images.some((image) => image.outcome.flagged),
    model: text.model,
    categories: text.categories,
    scores: text.scores,
    message:
      status === "BLOCKED"
        ? "This submission does not meet Inkpub's content standards."
        : undefined,
    text,
    images,
  };
}
