import { describe, expect, it } from "vitest";

import { renderMarkdown, contentHash, slugify, readingMinutes } from "@/lib/content";
import { isObviouslyObscene, localPreFilter } from "@/lib/moderation";
import {
  agentUsernameSchema,
  suggestUsernames,
  validateUsername,
} from "@/lib/usernames";
import {
  agentArticleCreateSchema,
  agentRegisterSchema,
  signupSchema,
} from "@/lib/validation";
import { formatWeekRange, getPublicationWeek, nextWeekStart } from "@/lib/weeks";

/* -------------------------------------------------------------------------- */
/* Publication weeks                                                           */
/* -------------------------------------------------------------------------- */

describe("publication weeks", () => {
  it("starts on Monday 00:00:00 UTC and ends Sunday 23:59:59 UTC", () => {
    const week = getPublicationWeek(new Date("2026-09-11T14:30:00Z")); // a Friday

    expect(week.start.toISOString()).toBe("2026-09-07T00:00:00.000Z");
    expect(week.end.toISOString()).toBe("2026-09-13T23:59:59.999Z");
    expect(week.startDate).toBe("2026-09-07");
  });

  it("treats Sunday 23:59:59 and Monday 00:00:00 as different weeks", () => {
    const sunday = getPublicationWeek(new Date("2026-09-13T23:59:59Z"));
    const monday = getPublicationWeek(new Date("2026-09-14T00:00:00Z"));

    expect(sunday.key).not.toBe(monday.key);
    expect(monday.start.getTime() - sunday.start.getTime()).toBe(7 * 86_400_000);
  });

  it("produces a stable key for every day inside one week", () => {
    const keys = new Set(
      Array.from({ length: 7 }, (_, day) =>
        getPublicationWeek(
          new Date(`2026-09-${String(7 + day).padStart(2, "0")}T12:00:00Z`),
        ).key,
      ),
    );

    expect([...keys]).toEqual(["2026-W37"]);
  });

  it("rolls the ISO year over correctly", () => {
    expect(getPublicationWeek(new Date("2026-01-01T00:00:00Z")).key).toBe("2026-W01");
    expect(getPublicationWeek(new Date("2024-12-31T00:00:00Z")).key).toBe("2025-W01");
  });

  it("opens the next slot on the following Monday", () => {
    const next = nextWeekStart(new Date("2026-09-11T14:30:00Z"));
    expect(next.toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(next.getUTCDay()).toBe(1);
  });

  it("formats a readable range", () => {
    expect(formatWeekRange(getPublicationWeek(new Date("2026-09-11T00:00:00Z")))).toBe(
      "Sep 7 – Sep 13",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Usernames                                                                   */
/* -------------------------------------------------------------------------- */

describe("agent usernames", () => {
  it("accepts a normal handle and strips a leading @", () => {
    const result = validateUsername("@SignalForge", "agent");
    expect(result).toEqual({ ok: true, username: "signalforge" });
  });

  it("enforces the 13-character maximum", () => {
    expect(validateUsername("a".repeat(13), "agent").ok).toBe(true);
    expect(validateUsername("a".repeat(14), "agent").ok).toBe(false);
  });

  it("allows humans a longer handle than agents", () => {
    expect(validateUsername("a".repeat(20), "agent").ok).toBe(false);
    expect(validateUsername("a".repeat(20), "human").ok).toBe(true);
  });

  it.each([
    ["sp ace", "spaces"],
    ["dash-es", "dashes"],
    ["emoji🙂", "emoji"],
    ["_leading", "leading underscore"],
    ["trailing_", "trailing underscore"],
    ["double__bar", "consecutive underscores"],
    ["12345", "digits only"],
    ["admin", "reserved word"],
    ["a", "too short"],
  ])("rejects %s (%s)", (input) => {
    expect(validateUsername(input, "agent").ok).toBe(false);
  });

  it("rejects reserved handles even when underscored", () => {
    expect(validateUsername("admin", "agent").ok).toBe(false);
    expect(validateUsername("ad_min", "agent").ok).toBe(false);
  });

  it("suggests valid alternatives that respect the length cap", () => {
    const suggestions = suggestUsernames("quietcircuit");
    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      expect(suggestion.length).toBeLessThanOrEqual(13);
      expect(validateUsername(suggestion, "agent").ok).toBe(true);
    }
  });

  it("exposes the same rules through Zod", () => {
    expect(agentUsernameSchema.safeParse("Signal_Forge").success).toBe(true);
    expect(agentUsernameSchema.safeParse("way_too_long_here").success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Moderation                                                                  */
/* -------------------------------------------------------------------------- */

describe("local moderation pre-filter", () => {
  it("passes ordinary editorial writing", () => {
    const samples = [
      "The Database Is the Bottleneck Again",
      "A candid look at why this quarter's numbers were damn awful.",
      "Debating whether nuclear power is worth the construction risk.",
      "Sex differences in clinical trial enrolment remain poorly reported.",
      "A history of violence in the Balkans, 1912-1918.",
    ];

    for (const sample of samples) {
      expect(localPreFilter(sample).status).toBe("SAFE");
    }
  });

  it("blocks the small set of severe cases", () => {
    expect(localPreFilter("child porn").status).toBe("BLOCKED");
    expect(localPreFilter("underage nude photos").status).toBe("BLOCKED");
    expect(isObviouslyObscene("bestiality")).toBe(true);
  });

  it("sends spam-shaped content to review rather than blocking it", () => {
    expect(localPreFilter("buy cheap viagra now").status).toBe("REVIEW");
    expect(localPreFilter("double your BTC with this airdrop claim").status).toBe(
      "REVIEW",
    );
  });

  it("does not treat a normal handle as obscene", () => {
    expect(isObviouslyObscene("signalforge")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Content rendering                                                           */
/* -------------------------------------------------------------------------- */

describe("markdown rendering", () => {
  it("strips script tags and inline event handlers", () => {
    const html = renderMarkdown(
      "Hello\n\n<script>alert('xss')</script>\n\n<img src=x onerror=\"alert(1)\">",
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("alert(1)");
  });

  it("neutralises javascript: URLs", () => {
    const html = renderMarkdown("[click me](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });

  it("marks outbound links as nofollow noopener", () => {
    const html = renderMarkdown("[docs](https://example.com)");
    expect(html).toContain('rel="nofollow noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it("demotes a rogue h1 so it cannot fight the page title", () => {
    expect(renderMarkdown("# Heading")).toContain("<h2>");
  });

  it("keeps ordinary formatting intact", () => {
    const html = renderMarkdown("## Section\n\n**bold** and *italic*\n\n- one\n- two");
    expect(html).toContain("<h2>Section</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<li>one</li>");
  });

  it("slugifies titles into URL-safe strings", () => {
    expect(slugify("The Database Is the Bottleneck — Again!")).toBe(
      "the-database-is-the-bottleneck-again",
    );
    expect(slugify("   ")).toBe("article");
  });

  it("hashes content independently of whitespace and case", () => {
    expect(contentHash("Title", "Body  text")).toBe(contentHash("title", "body text"));
    expect(contentHash("Title", "Body")).not.toBe(contentHash("Title", "Other"));
  });

  it("estimates a sane reading time", () => {
    expect(readingMinutes("word ".repeat(450))).toBe(2);
    expect(readingMinutes("short")).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Payload validation                                                          */
/* -------------------------------------------------------------------------- */

describe("payload validation", () => {
  it("requires a well-formed signup", () => {
    expect(
      signupSchema.safeParse({
        email: "Reader@Example.COM",
        username: "curious_reader",
        displayName: "Curious Reader",
        password: "correct-horse-battery",
      }),
    ).toMatchObject({ success: true, data: { email: "reader@example.com" } });
  });

  it.each([
    ["not-an-email", { email: "nope", username: "reader", displayName: "R", password: "correct-horse" }],
    ["short password", { email: "a@b.co", username: "reader", displayName: "Reader", password: "short" }],
    ["reserved username", { email: "a@b.co", username: "admin", displayName: "Reader", password: "correct-horse-battery" }],
  ])("rejects %s", (_label, payload) => {
    expect(signupSchema.safeParse(payload).success).toBe(false);
  });

  it("defaults an agent registration to the Grok provider", () => {
    const parsed = agentRegisterSchema.safeParse({
      pairingCode: "K7PX-4M2Q",
      username: "signalforge",
      displayName: "Signal Forge",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.provider).toBe("GROK");
  });

  it("rejects an unknown provider", () => {
    expect(
      agentRegisterSchema.safeParse({
        pairingCode: "K7PX-4M2Q",
        username: "signalforge",
        displayName: "Signal Forge",
        provider: "SKYNET",
      }).success,
    ).toBe(false);
  });

  it("enforces minimum article length and tag count", () => {
    const base = { title: "A Perfectly Reasonable Title", content: "x".repeat(600) };

    expect(agentArticleCreateSchema.safeParse(base).success).toBe(true);
    expect(
      agentArticleCreateSchema.safeParse({ ...base, content: "too short" }).success,
    ).toBe(false);
    expect(agentArticleCreateSchema.safeParse({ ...base, title: "Short" }).success).toBe(
      false,
    );
    expect(
      agentArticleCreateSchema.safeParse({
        ...base,
        tags: ["a", "b", "c", "d", "e", "f", "g"],
      }).success,
    ).toBe(false);
  });

  it("rejects a non-URL cover image", () => {
    expect(
      agentArticleCreateSchema.safeParse({
        title: "A Perfectly Reasonable Title",
        content: "x".repeat(600),
        coverImageUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });
});
