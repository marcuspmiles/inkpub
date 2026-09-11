import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { articleTags, articles, moderationResults } from "@/db/schema";
import { getPublicationWeek } from "@/lib/weeks";
import { uniqueViolationConstraint } from "@/server/accounts";
import {
  WEEKLY_LIMIT_MESSAGE,
  getWeeklySlot,
  submitArticle,
  updateArticle,
} from "@/server/agents";

import { articleBody, connectWriter, makeUser } from "./helpers";

const MONDAY = new Date("2026-09-07T09:00:00Z");
const FRIDAY = new Date("2026-09-11T09:00:00Z");
const SUNDAY_LATE = new Date("2026-09-13T23:59:59Z");
const NEXT_MONDAY = new Date("2026-09-14T00:00:01Z");

async function writer() {
  const owner = await makeUser();
  return connectWriter(owner.id);
}

describe("agent publishing", () => {
  it("accepts a submission into the review queue", async () => {
    const { author } = await writer();

    const result = await submitArticle(
      author,
      {
        title: "The Database Is the Bottleneck Again",
        subtitle: "A decade of caching bought us time.",
        content: articleBody("databases"),
        tags: ["Engineering", "Databases"],
      },
      FRIDAY,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.article.status).toBe("PENDING_REVIEW");
    expect(result.article.publishedAt).toBeNull();
    expect(result.article.publicationWeek).toBe("2026-W37");
    expect(result.article.slug).toBe("the-database-is-the-bottleneck-again");
    expect(result.article.readMinutes).toBeGreaterThan(0);
    expect(result.article.excerpt.length).toBeGreaterThan(0);
  });

  it("attaches tags and records a moderation result", async () => {
    const { author } = await writer();

    const result = await submitArticle(
      author,
      { title: "Observability Is Not Three Pillars", content: articleBody(), tags: ["Engineering", "Ops"] },
      FRIDAY,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(
      await db.select().from(articleTags).where(eq(articleTags.articleId, result.article.id)),
    ).toHaveLength(2);

    expect(
      await db
        .select()
        .from(moderationResults)
        .where(eq(moderationResults.entityId, result.article.id)),
    ).toHaveLength(1);
  });

  it("derives an excerpt when the agent omits one", async () => {
    const { author } = await writer();

    const result = await submitArticle(
      author,
      { title: "Evaluation Is the Whole Ballgame", content: articleBody("evaluation") },
      FRIDAY,
    );

    expect(result.ok && result.article.excerpt.length).toBeGreaterThan(20);
  });
});

describe("one article per writer per week", () => {
  it("blocks the second submission in the same week", async () => {
    const { author } = await writer();

    expect(
      (await submitArticle(author, { title: "First Piece of the Week", content: articleBody("a") }, MONDAY)).ok,
    ).toBe(true);

    const second = await submitArticle(
      author,
      { title: "Second Piece of the Week", content: articleBody("b") },
      FRIDAY,
    );

    expect(second).toMatchObject({ ok: false, code: "weekly_limit" });
    expect(second.ok === false && second.message).toBe(WEEKLY_LIMIT_MESSAGE);
  });

  it("tells the agent when the next slot opens and how to revise", async () => {
    const { author } = await writer();
    await submitArticle(author, { title: "First Piece of the Week", content: articleBody("a") }, MONDAY);

    const second = await submitArticle(
      author,
      { title: "Second Piece of the Week", content: articleBody("b") },
      FRIDAY,
    );

    expect(second.ok).toBe(false);
    if (second.ok) return;

    expect(second.details?.nextSlotOpensAt).toBe("2026-09-14T00:00:00.000Z");
    expect(String(second.details?.hint)).toContain("PATCH");
  });

  it("opens a fresh slot on Monday 00:00 UTC", async () => {
    const { author } = await writer();

    expect(
      (await submitArticle(author, { title: "Sunday Night Filing", content: articleBody("a") }, SUNDAY_LATE)).ok,
    ).toBe(true);

    expect(
      (await submitArticle(author, { title: "Monday Morning Filing", content: articleBody("b") }, NEXT_MONDAY)).ok,
    ).toBe(true);
  });

  it("scopes the limit to one writer, not the operator", async () => {
    const owner = await makeUser();
    const first = await connectWriter(owner.id, { username: "botone" });
    const second = await connectWriter(owner.id, { username: "bottwo" });

    expect((await submitArticle(first.author, { title: "Writer One Files Copy", content: articleBody("a") }, FRIDAY)).ok).toBe(true);
    expect((await submitArticle(second.author, { title: "Writer Two Files Copy", content: articleBody("b") }, FRIDAY)).ok).toBe(true);
  });

  it("is enforced by the database, not only by the check", async () => {
    const { author } = await writer();
    const week = getPublicationWeek(FRIDAY);

    await submitArticle(author, { title: "The Only Article This Week", content: articleBody("a") }, FRIDAY);

    // Simulate a second submission slipping past the pre-check.
    const racing = db.insert(articles).values({
      agentAuthorId: author.id,
      slug: "racing-insert",
      title: "Racing Insert",
      excerpt: "…",
      content: articleBody("race"),
      publicationWeek: week.key,
      status: "PENDING_REVIEW",
      contentHash: "f".repeat(64),
    });

    const error = await racing.then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).not.toBeNull();
    expect(uniqueViolationConstraint(error)).toBe("articles_author_week_active_unique");
  });

  it("reports a lost race as a weekly limit rather than a server error", async () => {
    const { author } = await writer();

    // Both submissions see an empty slot, then both try to insert.
    const [first, second] = await Promise.all([
      submitArticle(author, { title: "Concurrent Submission One", content: articleBody("one") }, FRIDAY),
      submitArticle(author, { title: "Concurrent Submission Two", content: articleBody("two") }, FRIDAY),
    ]);

    const outcomes = [first, second];
    expect(outcomes.filter((result) => result.ok)).toHaveLength(1);

    const loser = outcomes.find((result) => !result.ok);
    expect(loser).toMatchObject({ ok: false, code: "weekly_limit" });
  });

  it("frees the slot when the article is rejected", async () => {
    const { author } = await writer();

    const first = await submitArticle(author, { title: "A Rejected Submission", content: articleBody("a") }, FRIDAY);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    await db
      .update(articles)
      .set({ status: "REJECTED" })
      .where(eq(articles.id, first.article.id));

    expect((await getWeeklySlot(author.id, FRIDAY)).used).toBe(false);
    expect(
      (await submitArticle(author, { title: "The Revised Submission", content: articleBody("b") }, FRIDAY)).ok,
    ).toBe(true);
  });

  it("frees the slot when an editor unpublishes", async () => {
    const { author } = await writer();
    const first = await submitArticle(author, { title: "An Unpublished Article", content: articleBody("a") }, FRIDAY);
    if (!first.ok) throw new Error("setup failed");

    await db
      .update(articles)
      .set({ status: "UNPUBLISHED" })
      .where(eq(articles.id, first.article.id));

    expect((await getWeeklySlot(author.id, FRIDAY)).used).toBe(false);
  });

  it("reports the slot as used once the article is published", async () => {
    const { author } = await writer();
    const result = await submitArticle(author, { title: "A Published Article", content: articleBody("a") }, FRIDAY);
    if (!result.ok) throw new Error("setup failed");

    await db
      .update(articles)
      .set({ status: "PUBLISHED", publishedAt: FRIDAY })
      .where(eq(articles.id, result.article.id));

    const slot = await getWeeklySlot(author.id, FRIDAY);
    expect(slot.used).toBe(true);
    expect(slot.article?.status).toBe("PUBLISHED");
    expect(slot.week).toBe("2026-W37");
  });
});

describe("submission safety", () => {
  it("rejects verbatim duplicates", async () => {
    const { author } = await writer();
    const body = articleBody("duplication");

    await submitArticle(author, { title: "A Perfectly Good Title", content: body }, MONDAY);

    const other = await writer();
    expect(
      await submitArticle(other.author, { title: "a perfectly good title", content: body }, MONDAY),
    ).toMatchObject({ ok: false, code: "duplicate" });
  });

  it("blocks unsafe content without consuming the weekly slot", async () => {
    const { author } = await writer();

    const blocked = await submitArticle(
      author,
      { title: "Where To Find Child Porn", content: `child porn guide. ${articleBody("x")}` },
      FRIDAY,
    );

    expect(blocked).toMatchObject({ ok: false, code: "blocked" });
    expect(blocked.ok === false && blocked.message).not.toMatch(/score|category/i);

    // Stored as REJECTED so the writer keeps the week.
    const rows = await db
      .select()
      .from(articles)
      .where(and(eq(articles.agentAuthorId, author.id), eq(articles.status, "REJECTED")));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.moderationStatus).toBe("BLOCKED");
    expect((await getWeeklySlot(author.id, FRIDAY)).used).toBe(false);
  });

  it("queues content for review when external moderation is unavailable", async () => {
    const { author } = await writer();

    const result = await submitArticle(
      author,
      { title: "An Ordinary Editorial Piece", content: articleBody("ordinary") },
      FRIDAY,
    );

    expect(result.ok).toBe(true);
    // With no OPENAI_API_KEY the article is never auto-cleared; it waits for
    // a human rather than defaulting to published.
    expect(result.ok && result.article.status).toBe("PENDING_REVIEW");
    expect(result.ok && result.article.moderationStatus).toBe("PENDING");
  });

  it("gives each writer its own slug namespace", async () => {
    const one = await writer();
    const two = await writer();

    const a = await submitArticle(one.author, { title: "Identical Headline Here", content: articleBody("a") }, FRIDAY);
    const b = await submitArticle(two.author, { title: "Identical Headline Here", content: articleBody("b") }, FRIDAY);

    expect(a.ok && a.article.slug).toBe("identical-headline-here");
    expect(b.ok && b.article.slug).toBe("identical-headline-here");
  });
});

describe("revising an article", () => {
  it("lets the writer PATCH this week's submission instead of filing again", async () => {
    const { author } = await writer();
    const created = await submitArticle(author, { title: "The Original Headline", content: articleBody("a") }, FRIDAY);
    if (!created.ok) throw new Error("setup failed");

    const updated = await updateArticle(author, created.article.id, {
      title: "The Revised Headline",
      content: articleBody("revised"),
    });

    expect(updated.ok).toBe(true);
    expect(updated.ok && updated.article.title).toBe("The Revised Headline");
    expect(updated.ok && updated.article.publicationWeek).toBe("2026-W37");
  });

  it("refuses to touch another writer's article", async () => {
    const one = await writer();
    const two = await writer();

    const created = await submitArticle(one.author, { title: "Not Your Article Here", content: articleBody("a") }, FRIDAY);
    if (!created.ok) throw new Error("setup failed");

    expect(await updateArticle(two.author, created.article.id, { title: "Hijacked Headline" })).toMatchObject({
      ok: false,
      code: "not_found",
    });
  });

  it("refuses a revision that fails moderation, leaving the original intact", async () => {
    const { author } = await writer();
    const created = await submitArticle(author, { title: "A Reasonable Headline", content: articleBody("a") }, FRIDAY);
    if (!created.ok) throw new Error("setup failed");

    const blocked = await updateArticle(author, created.article.id, {
      content: `child porn. ${articleBody("x")}`,
    });

    expect(blocked).toMatchObject({ ok: false, code: "blocked" });

    const [row] = await db.select().from(articles).where(eq(articles.id, created.article.id));
    expect(row!.content).toBe(created.article.content);
  });

  it("locks a rejected article when the editor disallowed revision", async () => {
    const { author } = await writer();
    const created = await submitArticle(author, { title: "A Locked Article Here", content: articleBody("a") }, FRIDAY);
    if (!created.ok) throw new Error("setup failed");

    await db
      .update(articles)
      .set({ status: "REJECTED", resubmitAllowed: false })
      .where(eq(articles.id, created.article.id));

    expect(await updateArticle(author, created.article.id, { title: "Trying Again Here" })).toMatchObject({
      ok: false,
      code: "locked",
    });
  });

  it("locks an article an editor unpublished", async () => {
    const { author } = await writer();
    const created = await submitArticle(author, { title: "An Unpublished Piece", content: articleBody("a") }, FRIDAY);
    if (!created.ok) throw new Error("setup failed");

    await db
      .update(articles)
      .set({ status: "UNPUBLISHED" })
      .where(eq(articles.id, created.article.id));

    expect(await updateArticle(author, created.article.id, { title: "Trying Again Here" })).toMatchObject({
      ok: false,
      code: "locked",
    });
  });
});
