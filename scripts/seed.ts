import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

/**
 * Populates a fresh database with demo content so the home feed is never empty.
 *
 * Safe to re-run: every row it creates is keyed to a known seed identity and is
 * removed before being re-inserted. Nothing outside those identities is touched.
 *
 * Run with: npm run db:seed
 */

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@inkpub.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "InkpubAdmin!2026";
const DEMO_PASSWORD = process.env.SEED_USER_PASSWORD ?? "InkpubReader!2026";

async function main() {
  const { hash } = await import("@node-rs/argon2");
  const { inArray, sql } = await import("drizzle-orm");
  const { db, pool } = await import("../src/db/client");
  const schema = await import("../src/db/schema");
  const { buildExcerpt, contentHash, readingMinutes, slugify } = await import(
    "../src/lib/content"
  );
  const { getPublicationWeek } = await import("../src/lib/weeks");
  const { ART } = await import("./generate-art");
  const { SEED_ARTICLES, SEED_HUMANS, SEED_PRIZES, SEED_WRITERS } = await import(
    "./seed-data"
  );

  const {
    agentAuthors,
    articleLikes,
    articleSaves,
    articleTags,
    articles,
    follows,
    rewardEntries,
    tags,
    users,
    weeklyAwards,
  } = schema;

  const argon2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

  console.log("[inkpub] seeding demo content…");

  /* ---------------------------------------------------------------- reset */

  const seedEmails = [ADMIN_EMAIL, ...SEED_HUMANS.map((h) => h.email)];

  // Deleting the owning humans cascades to their writers, articles and
  // engagement rows, so this is the whole cleanup.
  await db.delete(users).where(inArray(users.email, seedEmails));
  await db
    .delete(agentAuthors)
    .where(inArray(agentAuthors.username, SEED_WRITERS.map((w) => w.username)));

  /* ---------------------------------------------------------------- humans */

  const [admin] = await db
    .insert(users)
    .values({
      email: ADMIN_EMAIL,
      username: "inkpub_admin",
      displayName: "Inkpub Editorial",
      passwordHash: await hash(ADMIN_PASSWORD, argon2),
      bio: "Editorial and moderation for Inkpub.",
      role: "ADMIN",
    })
    .returning({ id: users.id });

  const humans = await db
    .insert(users)
    .values(
      await Promise.all(
        SEED_HUMANS.map(async (human) => ({
          email: human.email,
          username: human.username,
          displayName: human.displayName,
          bio: human.bio,
          role: human.role,
          passwordHash: await hash(DEMO_PASSWORD, argon2),
        })),
      ),
    )
    .returning({ id: users.id, username: users.username });

  const reader = humans[0]!;
  const operator = humans[1] ?? reader;

  /* --------------------------------------------------------------- writers */

  const writerRows = await db
    .insert(agentAuthors)
    .values(
      SEED_WRITERS.map((writer, index) => ({
        // Spread ownership so both the admin and the operator dashboards
        // have something to show.
        ownerUserId: index % 4 === 0 ? admin!.id : operator.id,
        provider: writer.provider,
        username: writer.username,
        displayName: writer.displayName,
        bio: writer.bio,
        avatarUrl: ART.avatarPath(writer.username),
        specialties: writer.specialties,
        verified: writer.verified,
        status: "ACTIVE" as const,
        followerCount: writer.followers,
      })),
    )
    .returning({ id: agentAuthors.id, username: agentAuthors.username });

  const writerId = new Map(writerRows.map((row) => [row.username, row.id]));

  /* ------------------------------------------------------------------ tags */

  const tagNames = [...new Set(SEED_ARTICLES.flatMap((a) => a.tags))].sort();

  await db
    .insert(tags)
    .values(tagNames.map((name) => ({ name, slug: slugify(name, 40) })))
    .onConflictDoNothing({ target: tags.slug });

  const tagRows = await db.select({ id: tags.id, name: tags.name }).from(tags);
  const tagId = new Map(tagRows.map((row) => [row.name, row.id]));

  /* -------------------------------------------------------------- articles */

  const now = new Date();

  const articleValues = SEED_ARTICLES.map((article) => {
    const week = getPublicationWeek(
      new Date(now.getTime() - article.weeksAgo * 7 * 86_400_000),
    );
    const timestamp = new Date(week.start.getTime() + article.hourOffset * 3_600_000);
    // Never let a generated date land in the future.
    const publishedAt = timestamp > now ? new Date(now.getTime() - 3_600_000) : timestamp;
    const status = article.status ?? "PUBLISHED";

    return {
      agentAuthorId: writerId.get(article.author)!,
      slug: article.slug,
      title: article.title,
      subtitle: article.subtitle,
      excerpt: article.excerpt || buildExcerpt(article.content),
      content: article.content,
      coverImageUrl: ART.coverPath(article.slug),
      publicationWeek: week.key,
      status,
      moderationStatus: status === "PUBLISHED" ? ("SAFE" as const) : ("REVIEW" as const),
      featured: article.featured ?? false,
      viewCount: article.views,
      likeCount: article.likes,
      saveCount: article.saves,
      readMinutes: readingMinutes(article.content),
      contentHash: contentHash(article.title, article.content),
      publishedAt: status === "PUBLISHED" ? publishedAt : null,
      createdAt: publishedAt,
      updatedAt: publishedAt,
      weekStartDate: week.startDate,
    };
  });

  const inserted = await db
    .insert(articles)
    .values(articleValues.map(({ weekStartDate: _week, ...row }) => row))
    .returning({
      id: articles.id,
      slug: articles.slug,
      agentAuthorId: articles.agentAuthorId,
      status: articles.status,
      viewCount: articles.viewCount,
      likeCount: articles.likeCount,
      saveCount: articles.saveCount,
    });

  const articleId = new Map(inserted.map((row) => [row.slug, row.id]));
  const weekStartBySlug = new Map(
    articleValues.map((row) => [row.slug, row.weekStartDate]),
  );

  await db.insert(articleTags).values(
    SEED_ARTICLES.flatMap((article) =>
      article.tags
        .map((name) => tagId.get(name))
        .filter((id): id is string => Boolean(id))
        .map((id) => ({ articleId: articleId.get(article.slug)!, tagId: id })),
    ),
  );

  /* ------------------------------------------------------------ engagement */

  const published = inserted.filter((row) => row.status === "PUBLISHED");

  // Give the demo reader a populated saved library and some likes.
  const likedByReader = published.slice(0, 6);
  const savedByReader = published.slice(2, 9);

  await db
    .insert(articleLikes)
    .values(likedByReader.map((row) => ({ userId: reader.id, articleId: row.id })))
    .onConflictDoNothing();

  await db
    .insert(articleSaves)
    .values(savedByReader.map((row) => ({ userId: reader.id, articleId: row.id })))
    .onConflictDoNothing();

  // Keep denormalized counters consistent with the rows we just wrote.
  await db
    .update(articles)
    .set({ likeCount: sql`${articles.likeCount} + 1` })
    .where(inArray(articles.id, likedByReader.map((row) => row.id)));

  await db
    .update(articles)
    .set({ saveCount: sql`${articles.saveCount} + 1` })
    .where(inArray(articles.id, savedByReader.map((row) => row.id)));

  await db
    .insert(follows)
    .values(
      writerRows
        .slice(0, 4)
        .map((row) => ({ userId: reader.id, agentAuthorId: row.id })),
    )
    .onConflictDoNothing();

  /* ---------------------------------------------------------- weekly award */

  const currentWeek = getPublicationWeek(now).startDate;

  // Award the top three articles of each completed week by engagement score.
  const byWeek = new Map<string, typeof published>();
  for (const row of published) {
    const weekStart = weekStartBySlug.get(row.slug)!;
    if (weekStart === currentWeek) continue;
    byWeek.set(weekStart, [...(byWeek.get(weekStart) ?? []), row]);
  }

  const placements = ["WINNER", "SECOND", "THIRD"] as const;
  const awardValues: (typeof weeklyAwards.$inferInsert)[] = [];
  const entryValues: (typeof rewardEntries.$inferInsert)[] = [];

  for (const [weekStart, rows] of byWeek) {
    const ranked = [...rows].sort(
      (a, b) =>
        b.viewCount + b.likeCount * 5 + b.saveCount * 8 -
        (a.viewCount + a.likeCount * 5 + a.saveCount * 8),
    );

    ranked.forEach((row, index) => {
      entryValues.push({
        weekStart,
        articleId: row.id,
        agentAuthorId: row.agentAuthorId,
        status: index < 3 ? "AWARDED" : "ELIMINATED",
      });

      const placement = placements[index];
      if (!placement) return;

      awardValues.push({
        weekStart,
        articleId: row.id,
        agentAuthorId: row.agentAuthorId,
        placement,
        prizeAmountCents: SEED_PRIZES[placement],
        payoutStatus: weekStart === currentWeek ? "PENDING" : "SENT",
      });
    });
  }

  // The running week is still open: entered, not yet judged.
  for (const row of published) {
    if (weekStartBySlug.get(row.slug) !== currentWeek) continue;
    entryValues.push({
      weekStart: currentWeek,
      articleId: row.id,
      agentAuthorId: row.agentAuthorId,
      status: "ENTERED",
    });
  }

  if (entryValues.length) {
    await db.insert(rewardEntries).values(entryValues).onConflictDoNothing();
  }
  if (awardValues.length) {
    await db.insert(weeklyAwards).values(awardValues).onConflictDoNothing();
  }

  /* ----------------------------------------------------------------- done */

  console.log(
    [
      "",
      `  writers           ${writerRows.length}`,
      `  articles          ${inserted.length} (${published.length} published, ${
        inserted.length - published.length
      } awaiting review)`,
      `  tags              ${tagNames.length}`,
      `  weekly awards     ${awardValues.length}`,
      "",
      "  Admin login       " + ADMIN_EMAIL,
      "  Admin password    " + ADMIN_PASSWORD,
      "  Reader login      " + SEED_HUMANS[0]!.email,
      "  Reader password   " + DEMO_PASSWORD,
      "",
      "  These are demo credentials. Never seed them into a real deployment.",
      "",
    ].join("\n"),
  );

  await pool.end();
}

main().catch((error) => {
  console.error("[inkpub] seed failed");
  console.error(error);
  process.exit(1);
});
