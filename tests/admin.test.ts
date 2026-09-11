import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { articles, rewardEntries, weeklyAwards } from "@/db/schema";
import { getPublicationWeek } from "@/lib/weeks";
import {
  approveArticle,
  getAdminStats,
  getReviewQueue,
  grantAward,
  rejectArticle,
  setFeatured,
  unpublishArticle,
} from "@/server/admin";
import { submitArticle } from "@/server/agents";
import { getArticleBySlug } from "@/server/articles";

import { articleBody, connectWriter, makeUser } from "./helpers";

const FRIDAY = new Date("2026-09-11T09:00:00Z");

async function pendingArticle(title = "An Article Awaiting Review") {
  const owner = await makeUser();
  const { author } = await connectWriter(owner.id);
  const result = await submitArticle(author, { title, content: articleBody(title) }, FRIDAY);
  if (!result.ok) throw new Error(`setup failed: ${result.message}`);
  return { author, article: result.article };
}

describe("review queue", () => {
  it("lists submissions waiting for a human", async () => {
    await pendingArticle("First Article In The Queue");
    await pendingArticle("Second Article In Queue");

    const queue = await getReviewQueue();
    expect(queue).toHaveLength(2);
    expect(queue.every((item) => item.status === "PENDING_REVIEW")).toBe(true);
  });

  it("counts pending work in the admin stats", async () => {
    await pendingArticle();
    const stats = await getAdminStats();
    expect(stats.pending).toBe(1);
  });
});

describe("approving", () => {
  it("publishes the article and stamps publishedAt", async () => {
    const { article } = await pendingArticle();

    const approved = await approveArticle(article.id, "Good piece.");

    expect(approved?.status).toBe("PUBLISHED");
    expect(approved?.publishedAt).toBeInstanceOf(Date);
    expect(approved?.rejectionReason).toBeNull();
    expect(approved?.adminNotes).toBe("Good piece.");
  });

  it("makes the article readable on the public site", async () => {
    const { author, article } = await pendingArticle();

    expect(await getArticleBySlug(author.username, article.slug)).toBeNull();

    await approveArticle(article.id);

    const published = await getArticleBySlug(author.username, article.slug);
    expect(published?.title).toBe(article.title);
    expect(published?.author.username).toBe(author.username);
  });

  it("enters the article into that week's rewards", async () => {
    const { article } = await pendingArticle();
    await approveArticle(article.id);

    const entries = await db
      .select()
      .from(rewardEntries)
      .where(eq(rewardEntries.articleId, article.id));

    expect(entries).toHaveLength(1);
    expect(entries[0]!.status).toBe("ENTERED");
  });
});

describe("rejecting", () => {
  it("records the reason and keeps the article off the site", async () => {
    const { author, article } = await pendingArticle();

    const rejected = await rejectArticle(article.id, "Thin sourcing throughout.");

    expect(rejected?.status).toBe("REJECTED");
    expect(rejected?.rejectionReason).toBe("Thin sourcing throughout.");
    expect(rejected?.publishedAt).toBeNull();
    expect(await getArticleBySlug(author.username, article.slug)).toBeNull();
  });

  it("allows a revision by default and can forbid one", async () => {
    const first = await pendingArticle("A Revisable Rejection");
    expect((await rejectArticle(first.article.id, "Needs work."))?.resubmitAllowed).toBe(true);

    const second = await pendingArticle("A Final Rejection Here");
    expect(
      (await rejectArticle(second.article.id, "Out of scope.", { allowResubmit: false }))
        ?.resubmitAllowed,
    ).toBe(false);
  });

  it("clears the featured flag", async () => {
    const { article } = await pendingArticle();
    await approveArticle(article.id);
    await setFeatured(article.id, true);

    expect((await rejectArticle(article.id, "Reconsidered."))?.featured).toBe(false);
  });
});

describe("unpublishing and featuring", () => {
  it("removes a published article from the public site", async () => {
    const { author, article } = await pendingArticle();
    await approveArticle(article.id);

    const unpublished = await unpublishArticle(article.id, "Factual dispute.");

    expect(unpublished?.status).toBe("UNPUBLISHED");
    expect(await getArticleBySlug(author.username, article.slug)).toBeNull();
  });

  it("toggles the featured flag", async () => {
    const { article } = await pendingArticle();
    await approveArticle(article.id);

    expect((await setFeatured(article.id, true))?.featured).toBe(true);
    expect((await setFeatured(article.id, false))?.featured).toBe(false);
  });
});

describe("weekly awards", () => {
  it("grants one placement per week", async () => {
    const { author, article } = await pendingArticle();
    await approveArticle(article.id);

    const weekStart = getPublicationWeek(new Date()).startDate;
    await grantAward({
      articleId: article.id,
      placement: "WINNER",
      weekStart,
      prizeAmountCents: 50_000,
      payoutStatus: "PENDING",
    });

    const [award] = await db.select().from(weeklyAwards).where(eq(weeklyAwards.weekStart, weekStart));

    expect(award!.placement).toBe("WINNER");
    expect(award!.prizeAmountCents).toBe(50_000);
    expect(award!.agentAuthorId).toBe(author.id);
  });

  it("replaces the previous holder rather than duplicating a placement", async () => {
    const first = await pendingArticle("The First Contender Here");
    const second = await pendingArticle("The Second Contender");
    await approveArticle(first.article.id);
    await approveArticle(second.article.id);

    const weekStart = getPublicationWeek(new Date()).startDate;
    await grantAward({ articleId: first.article.id, placement: "WINNER", weekStart });
    await grantAward({ articleId: second.article.id, placement: "WINNER", weekStart });

    const awards = await db.select().from(weeklyAwards).where(eq(weeklyAwards.weekStart, weekStart));

    expect(awards).toHaveLength(1);
    expect(awards[0]!.articleId).toBe(second.article.id);
  });
});

describe("human authorship is impossible", () => {
  it("has no column tying an article to a human account", () => {
    const columns = Object.keys(articles);
    expect(columns).not.toContain("userId");
    expect(columns).not.toContain("authorUserId");
    expect(columns).toContain("agentAuthorId");
  });

  it("requires an AI writer on every article row", async () => {
    await expect(
      db.insert(articles).values({
        // @ts-expect-error deliberately omitting the required AI author
        agentAuthorId: null,
        slug: "human-written",
        title: "Written By A Human",
        excerpt: "…",
        content: articleBody(),
        publicationWeek: "2026-W37",
        contentHash: "a".repeat(64),
      }),
    ).rejects.toThrow();
  });
});
