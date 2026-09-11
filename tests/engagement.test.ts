import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { agentAuthors, articles } from "@/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { approveArticle } from "@/server/admin";
import { submitArticle } from "@/server/agents";
import { getSavedArticles } from "@/server/articles";
import {
  followWriter,
  likeArticle,
  recordView,
  saveArticle,
  unfollowWriter,
  unlikeArticle,
  unsaveArticle,
} from "@/server/engagement";

import { articleBody, connectWriter, makeUser } from "./helpers";

const FRIDAY = new Date("2026-09-11T09:00:00Z");

async function publishedArticle(title = "A Published Test Article") {
  const owner = await makeUser();
  const { author } = await connectWriter(owner.id);
  const result = await submitArticle(author, { title, content: articleBody(title) }, FRIDAY);
  if (!result.ok) throw new Error("setup failed");
  const published = await approveArticle(result.article.id);
  return { author, article: published! };
}

async function counts(articleId: string) {
  const [row] = await db.select().from(articles).where(eq(articles.id, articleId));
  return { likes: row!.likeCount, saves: row!.saveCount, views: row!.viewCount };
}

describe("likes", () => {
  it("increments once no matter how many times it is sent", async () => {
    const reader = await makeUser();
    const { article } = await publishedArticle();

    await likeArticle(reader.id, article.id);
    await likeArticle(reader.id, article.id);
    await likeArticle(reader.id, article.id);

    expect((await counts(article.id)).likes).toBe(1);
  });

  it("decrements on unlike and never goes negative", async () => {
    const reader = await makeUser();
    const { article } = await publishedArticle();

    await likeArticle(reader.id, article.id);
    await unlikeArticle(reader.id, article.id);
    await unlikeArticle(reader.id, article.id);

    expect((await counts(article.id)).likes).toBe(0);
  });

  it("counts each reader separately", async () => {
    const [a, b] = [await makeUser(), await makeUser()];
    const { article } = await publishedArticle();

    await likeArticle(a.id, article.id);
    await likeArticle(b.id, article.id);

    expect((await counts(article.id)).likes).toBe(2);
  });

  it("refuses to like an article that is not published", async () => {
    const reader = await makeUser();
    const owner = await makeUser();
    const { author } = await connectWriter(owner.id);
    const pending = await submitArticle(
      author,
      { title: "Still Awaiting Review", content: articleBody() },
      FRIDAY,
    );
    if (!pending.ok) throw new Error("setup failed");

    expect(await likeArticle(reader.id, pending.article.id)).toBeNull();
  });
});

describe("saves", () => {
  it("adds the article to the reader's private library", async () => {
    const reader = await makeUser();
    const other = await makeUser();
    const { article } = await publishedArticle("Saved For Later Reading");

    await saveArticle(reader.id, article.id);

    const mine = await getSavedArticles(reader.id);
    expect(mine.map((item) => item.id)).toEqual([article.id]);

    // Another reader's library is unaffected.
    expect(await getSavedArticles(other.id)).toHaveLength(0);
  });

  it("removes the article again on unsave", async () => {
    const reader = await makeUser();
    const { article } = await publishedArticle();

    await saveArticle(reader.id, article.id);
    await unsaveArticle(reader.id, article.id);

    expect(await getSavedArticles(reader.id)).toHaveLength(0);
    expect((await counts(article.id)).saves).toBe(0);
  });

  it("is idempotent", async () => {
    const reader = await makeUser();
    const { article } = await publishedArticle();

    await saveArticle(reader.id, article.id);
    await saveArticle(reader.id, article.id);

    expect((await counts(article.id)).saves).toBe(1);
  });
});

describe("views", () => {
  it("counts a visitor once per de-duplication window", async () => {
    const { article } = await publishedArticle();

    await recordView(article.id, "visitor-abc");
    await recordView(article.id, "visitor-abc");
    await recordView(article.id, "visitor-abc");

    expect((await counts(article.id)).views).toBe(1);
  });

  it("counts distinct visitors separately", async () => {
    const { article } = await publishedArticle();

    await recordView(article.id, "visitor-abc");
    await recordView(article.id, "visitor-def");

    expect((await counts(article.id)).views).toBe(2);
  });
});

describe("follows", () => {
  it("tracks follower counts and is idempotent", async () => {
    const reader = await makeUser();
    const { author } = await publishedArticle();

    await followWriter(reader.id, author.id);
    await followWriter(reader.id, author.id);

    const [row] = await db.select().from(agentAuthors).where(eq(agentAuthors.id, author.id));
    expect(row!.followerCount).toBe(1);

    await unfollowWriter(reader.id, author.id);
    await unfollowWriter(reader.id, author.id);

    const [after] = await db.select().from(agentAuthors).where(eq(agentAuthors.id, author.id));
    expect(after!.followerCount).toBe(0);
  });
});

describe("rate limiting", () => {
  const rule = { name: "test", limit: 3, windowSeconds: 60 };

  it("allows up to the limit and then blocks", async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await checkRateLimit(rule, "actor-a")).allowed).toBe(true);
    }
    expect((await checkRateLimit(rule, "actor-a")).allowed).toBe(false);
  });

  it("keeps buckets separate per actor", async () => {
    for (let i = 0; i < 3; i += 1) await checkRateLimit(rule, "actor-a");

    expect((await checkRateLimit(rule, "actor-b")).allowed).toBe(true);
  });

  it("resets in the next window", async () => {
    const now = new Date("2026-09-11T09:00:00Z");
    for (let i = 0; i < 3; i += 1) await checkRateLimit(rule, "actor-c", now);

    expect((await checkRateLimit(rule, "actor-c", now)).allowed).toBe(false);
    expect(
      (await checkRateLimit(rule, "actor-c", new Date("2026-09-11T09:02:00Z"))).allowed,
    ).toBe(true);
  });

  it("keeps its counter in Postgres so replicas share one limit", async () => {
    await checkRateLimit(rule, "actor-d");

    const rows = await db.execute<{ count: number }>(
      sql`select count from rate_limits order by window_start desc limit 1`,
    );

    expect(Number(rows.rows[0]?.count)).toBe(1);
  });
});
