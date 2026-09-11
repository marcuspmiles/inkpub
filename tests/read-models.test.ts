import { describe, expect, it } from "vitest";

import { approveArticle, grantAward } from "@/server/admin";
import { submitArticle } from "@/server/agents";
import {
  EXPLORE_DEFAULT_TAB,
  getAllTags,
  getArticleBySlug,
  getArticlesByAuthor,
  getArticlesByIds,
  getFeaturedArticles,
  getFeed,
  getLikedArticles,
  getPublishedSlugs,
  getRelatedArticles,
  getSavedArticles,
  getViewerArticleState,
  searchArticles,
} from "@/server/articles";
import { listAwards } from "@/server/awards";
import { likeArticle, saveArticle } from "@/server/engagement";
import {
  getFollowedWriters,
  getTrendingWriters,
  getWriterByUsername,
  getWritersForOwner,
  listWriters,
  searchWriters,
} from "@/server/writers";
import { getPublicationWeek } from "@/lib/weeks";

import { articleBody, connectWriter, makeUser } from "./helpers";

/**
 * Exercises every query behind a public page. These are the paths where a
 * malformed SQL fragment only shows up as a 500 in the browser, so each one is
 * called for real against Postgres.
 */

const FRIDAY = new Date("2026-09-11T09:00:00Z");

async function publish(
  title: string,
  options: { tags?: string[]; username?: string } = {},
) {
  const owner = await makeUser();
  const { author } = await connectWriter(owner.id, { username: options.username });
  const submitted = await submitArticle(
    author,
    { title, content: articleBody(title), tags: options.tags },
    FRIDAY,
  );
  if (!submitted.ok) throw new Error(`setup failed: ${submitted.message}`);
  const article = await approveArticle(submitted.article.id);
  return { owner, author, article: article! };
}

describe("feed", () => {
  it("returns published articles on every tab", async () => {
    await publish("The First Published Article", { tags: ["Engineering"] });
    await publish("The Second Published Piece", { tags: ["Economics"] });

    for (const tab of ["latest", "trending", "featured"] as const) {
      await expect(getFeed({ tab, limit: 10 })).resolves.toMatchObject({
        items: expect.any(Array),
      });
    }

    const latest = await getFeed({ tab: "latest", limit: 10 });
    expect(latest.items).toHaveLength(2);
    expect(latest.items[0]!.author.username).toBeTruthy();
    expect(latest.items[0]!.tags.length).toBeGreaterThan(0);
  });

  it("orders the trending tab by the decayed engagement score", async () => {
    const quiet = await publish("A Quiet Article Here");
    const loud = await publish("A Very Popular Article");

    const reader = await makeUser();
    await likeArticle(reader.id, loud.article.id);
    await saveArticle(reader.id, loud.article.id);

    const page = await getFeed({ tab: "trending", limit: 10 });

    expect(page.items[0]!.id).toBe(loud.article.id);
    expect(page.items[1]!.id).toBe(quiet.article.id);
  });

  it("hides everything that is not published", async () => {
    const owner = await makeUser();
    const { author } = await connectWriter(owner.id);
    await submitArticle(author, { title: "Still In The Queue", content: articleBody() }, FRIDAY);

    expect((await getFeed({ tab: "latest" })).items).toHaveLength(0);
  });

  it("filters by tag", async () => {
    await publish("An Engineering Article", { tags: ["Engineering"] });
    await publish("An Economics Article", { tags: ["Economics"] });

    // The feed filters on tag slug, which is what the /explore links carry.
    const page = await getFeed({ tab: "latest", tag: "engineering" });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.title).toBe("An Engineering Article");
  });

  it("paginates with a cursor", async () => {
    for (let i = 0; i < 3; i += 1) await publish(`Paginated Article Number ${i}`);

    const first = await getFeed({ tab: "latest", limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();

    const second = await getFeed({ tab: "latest", limit: 2, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(1);

    const ids = new Set([...first.items, ...second.items].map((a) => a.id));
    expect(ids.size).toBe(3);
  });

  it("puts curated articles first on the featured rail", async () => {
    await publish("An Unfeatured Article");
    const { article } = await publish("A Featured Article Here");

    const { setFeatured } = await import("@/server/admin");
    await setFeatured(article.id, true);

    const featured = await getFeaturedArticles(4);
    expect(featured[0]!.id).toBe(article.id);
    expect(featured[0]!.featured).toBe(true);
  });

  it("falls back to strong recent articles so the rail is never empty", async () => {
    await publish("Nothing Curated Yet Here");

    expect((await getFeaturedArticles(4)).length).toBe(1);
  });

  it("serves the explore landing tab before anything has been curated", async () => {
    await publish("A Published But Uncurated Piece");

    // Explore defaults to this tab precisely because `featured` is empty on a
    // fresh deployment, which would otherwise show an empty browse page.
    expect((await getFeed({ tab: EXPLORE_DEFAULT_TAB, limit: 12 })).items).toHaveLength(1);
    expect((await getFeed({ tab: "featured", limit: 12 })).items).toHaveLength(0);
  });
});

describe("article page", () => {
  it("loads an article by handle and slug", async () => {
    const { author, article } = await publish("A Readable Article Here", {
      tags: ["Engineering"],
    });

    const detail = await getArticleBySlug(author.username, article.slug);

    expect(detail).not.toBeNull();
    expect(detail!.content).toContain("demonstration article");
    expect(detail!.author.username).toBe(author.username);
    expect(detail!.publicationWeek).toBe("2026-W37");
    expect(detail!.tags).toEqual(["Engineering"]);
  });

  it("is case-insensitive on the handle and rejects the wrong one", async () => {
    const { author, article } = await publish("A Case Sensitive Check");

    expect(await getArticleBySlug(author.username.toUpperCase(), article.slug)).not.toBeNull();
    expect(await getArticleBySlug("nobody", article.slug)).toBeNull();
  });

  it("suggests related articles by shared tag", async () => {
    const subject = await publish("The Subject Article Here", { tags: ["Engineering"] });
    const sibling = await publish("A Tag Sibling Article", { tags: ["Engineering"] });
    await publish("An Unrelated Article", { tags: ["Culture"] });

    const detail = await getArticleBySlug(subject.author.username, subject.article.slug);
    const related = await getRelatedArticles(detail!, 3);

    expect(related.map((a) => a.id)).toContain(sibling.article.id);
    expect(related.map((a) => a.id)).not.toContain(subject.article.id);
  });

  it("falls back to recent articles when nothing shares a tag", async () => {
    const subject = await publish("A Lonely Tagged Article", { tags: ["Engineering"] });
    const other = await publish("Some Other Recent Piece", { tags: ["Culture"] });

    const detail = await getArticleBySlug(subject.author.username, subject.article.slug);
    const related = await getRelatedArticles(detail!, 3);

    expect(related.map((a) => a.id)).toEqual([other.article.id]);
  });

  it("handles an article with no tags at all", async () => {
    const subject = await publish("An Untagged Article Here");
    await publish("Another Untagged Piece");

    const detail = await getArticleBySlug(subject.author.username, subject.article.slug);
    expect(await getRelatedArticles(detail!, 3)).toHaveLength(1);
  });
});

describe("search", () => {
  it("matches on title and body, and returns nothing for a miss", async () => {
    await publish("Cartography As Statecraft");

    expect((await searchArticles("cartography")).length).toBe(1);
    expect((await searchArticles("CARTOGRAPHY")).length).toBe(1);
    expect(await searchArticles("zzzznothinghere")).toHaveLength(0);
  });

  it("survives characters that would break a LIKE pattern", async () => {
    await publish("A Perfectly Normal Title");

    for (const query of ["100%", "under_score", "back\\slash", "'; drop table articles; --"]) {
      await expect(searchArticles(query)).resolves.toBeInstanceOf(Array);
    }
  });

  it("finds writers by handle and display name", async () => {
    await publish("An Article By Signalforge", { username: "signalforge" });

    expect((await searchWriters("signal")).length).toBe(1);
    expect(await searchWriters("zzzznobody")).toHaveLength(0);
  });
});

describe("writer surfaces", () => {
  it("builds a profile with article counts", async () => {
    const { author, article } = await publish("An Article On A Profile", {
      username: "signalforge",
    });

    const profile = await getWriterByUsername("SignalForge");

    expect(profile?.id).toBe(author.id);
    expect(profile?.articleCount).toBe(1);
    expect((await getArticlesByAuthor(author.id)).map((a) => a.id)).toEqual([article.id]);
  });

  it("returns null for an unknown handle", async () => {
    expect(await getWriterByUsername("nobody")).toBeNull();
  });

  it("lists and ranks writers", async () => {
    await publish("One Writer's Article", { username: "botone" });
    await publish("Another Writer's Work", { username: "bottwo" });

    expect((await listWriters()).length).toBe(2);
    expect((await getTrendingWriters(6)).length).toBe(2);
  });

  it("lists the writers an operator owns", async () => {
    const owner = await makeUser();
    await connectWriter(owner.id, { username: "ownedone" });
    await connectWriter(owner.id, { username: "ownedtwo" });

    const mine = await getWritersForOwner(owner.id);
    expect(mine.map((w) => w.username).sort()).toEqual(["ownedone", "ownedtwo"]);
  });

  it("lists the writers a reader follows", async () => {
    const { author } = await publish("A Followed Writer's Piece");
    const reader = await makeUser();

    const { followWriter } = await import("@/server/engagement");
    await followWriter(reader.id, author.id);

    expect((await getFollowedWriters(reader.id)).map((w) => w.id)).toEqual([author.id]);
  });
});

describe("reader surfaces", () => {
  it("reports the viewer's like and save state", async () => {
    const reader = await makeUser();
    const { article } = await publish("A Liked And Saved Piece");

    expect(await getViewerArticleState(reader.id, article.id)).toMatchObject({
      liked: false,
      saved: false,
    });

    await likeArticle(reader.id, article.id);
    await saveArticle(reader.id, article.id);

    expect(await getViewerArticleState(reader.id, article.id)).toMatchObject({
      liked: true,
      saved: true,
    });
  });

  it("returns an unauthenticated viewer's state without querying", async () => {
    const { article } = await publish("An Anonymous Read Here");
    expect(await getViewerArticleState(null, article.id)).toMatchObject({
      liked: false,
      saved: false,
    });
  });

  it("lists saved and liked libraries", async () => {
    const reader = await makeUser();
    const saved = await publish("Saved For Later Please");
    const liked = await publish("Liked But Not Saved");

    await saveArticle(reader.id, saved.article.id);
    await likeArticle(reader.id, liked.article.id);

    expect((await getSavedArticles(reader.id)).map((a) => a.id)).toEqual([saved.article.id]);
    expect((await getLikedArticles(reader.id)).map((a) => a.id)).toEqual([liked.article.id]);
  });

  it("fetches articles by id and tolerates an empty list", async () => {
    const { article } = await publish("Fetched By Identifier");

    expect((await getArticlesByIds([article.id])).map((a) => a.id)).toEqual([article.id]);
    expect(await getArticlesByIds([])).toHaveLength(0);
  });
});

describe("awards and metadata", () => {
  it("lists awards with their article and writer", async () => {
    const { author, article } = await publish("An Award Winning Piece");
    const weekStart = getPublicationWeek(new Date()).startDate;

    await grantAward({
      articleId: article.id,
      placement: "WINNER",
      weekStart,
      prizeAmountCents: 50_000,
    });

    const awards = await listAwards();
    expect(awards).toHaveLength(1);
    expect(awards[0]!.article.title).toBe("An Award Winning Piece");
    expect(awards[0]!.author.username).toBe(author.username);
  });

  it("collects tags and sitemap entries", async () => {
    const { author, article } = await publish("A Sitemap Entry Here", {
      tags: ["Engineering", "Databases"],
    });

    expect((await getAllTags()).map((t) => t.name).sort()).toEqual([
      "Databases",
      "Engineering",
    ]);

    const slugs = await getPublishedSlugs();
    expect(slugs).toContainEqual(
      expect.objectContaining({ slug: article.slug, username: author.username }),
    );
  });
});
