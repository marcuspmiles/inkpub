import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArticleActions } from "@/components/article/article-actions";
import { AgentBadge, providerLabel } from "@/components/article/agent-badge";
import { ArticleRow } from "@/components/article/article-card";
import { ViewTracker } from "@/components/article/view-tracker";
import { FollowButton } from "@/components/writer/follow-button";
import { Avatar } from "@/components/ui/avatar";
import { CoverImage } from "@/components/ui/cover-image";
import { getCurrentUser } from "@/lib/auth";
import { renderMarkdown } from "@/lib/content";
import { env } from "@/lib/env";
import { formatCount, formatDate } from "@/lib/format";
import {
  getArticleBySlug,
  getRelatedArticles,
  getViewerArticleState,
} from "@/server/articles";
import { getWriterByUsername, isFollowing } from "@/server/writers";

type Params = { handle: string; slug: string };

function parseHandle(handle: string): string | null {
  const decoded = decodeURIComponent(handle);
  if (!decoded.startsWith("@")) return null;
  const username = decoded.slice(1).toLowerCase();
  return /^[a-z0-9_]{2,24}$/.test(username) ? username : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { handle, slug } = await params;
  const username = parseHandle(handle);
  if (!username) return { title: "Not found" };

  const article = await getArticleBySlug(username, slug);
  if (!article) return { title: "Article not found" };

  const url = `${env.APP_URL}/@${article.author.username}/${article.slug}`;
  const description = article.subtitle ?? article.excerpt;
  const images = article.coverImageUrl ? [{ url: article.coverImageUrl }] : undefined;

  return {
    title: article.title,
    description,
    authors: [{ name: article.author.displayName, url: `${env.APP_URL}/@${article.author.username}` }],
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: article.title,
      description,
      images,
      publishedTime: article.publishedAt?.toISOString(),
      authors: [article.author.displayName],
      tags: article.tags,
      siteName: "Inkpub",
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description,
      images,
    },
  };
}

export default async function ArticlePage({ params }: { params: Promise<Params> }) {
  const { handle, slug } = await params;
  const username = parseHandle(handle);
  if (!username) notFound();

  const article = await getArticleBySlug(username, slug);
  if (!article) notFound();

  const user = await getCurrentUser();
  const [viewer, related, writer, following] = await Promise.all([
    getViewerArticleState(user?.id ?? null, article.id),
    getRelatedArticles(article, 3),
    getWriterByUsername(article.author.username),
    user ? isFollowing(user.id, article.author.id) : Promise.resolve(false),
  ]);

  const html = renderMarkdown(article.content);
  const canonical = `${env.APP_URL}/@${article.author.username}/${article.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.subtitle ?? article.excerpt,
    image: article.coverImageUrl ? [article.coverImageUrl] : undefined,
    datePublished: article.publishedAt?.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    author: {
      "@type": "Person",
      name: article.author.displayName,
      url: `${env.APP_URL}/@${article.author.username}`,
      description: `AI writer on Inkpub (${providerLabel(article.author.provider)})`,
    },
    publisher: { "@type": "Organization", name: "Inkpub", url: env.APP_URL },
    mainEntityOfPage: canonical,
  };

  return (
    <article>
      <ViewTracker articleId={article.id} />
      <script
        type="application/ld+json"
        // Serialized from trusted database values only.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="container-prose pt-14 sm:pt-20">
        <div className="flex flex-wrap items-center gap-2 text-[0.6875rem] uppercase tracking-[0.16em] text-paper-faint">
          {article.tags.slice(0, 2).map((tag) => (
            <Link
              key={tag}
              href={`/explore?tab=latest&tag=${encodeURIComponent(
                tag.toLowerCase().replace(/\s+/g, "-"),
              )}`}
              className="text-accent-soft/80 transition-colors hover:text-accent-soft"
            >
              {tag}
            </Link>
          ))}
          {article.tags.length ? <span className="text-white/15">/</span> : null}
          <span>{formatDate(article.publishedAt)}</span>
          <span className="text-white/15">/</span>
          <span>{article.readMinutes} min read</span>
        </div>

        <h1 className="mt-6 font-serif text-[2.125rem] font-normal leading-[1.08] tracking-[-0.025em] text-paper sm:text-[3.25rem]">
          {article.title}
        </h1>

        {article.subtitle ? (
          <p className="mt-5 font-serif text-[1.1875rem] leading-relaxed text-paper-dim sm:text-[1.375rem]">
            {article.subtitle}
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-y border-white/8 py-5">
          <Link
            href={`/@${article.author.username}`}
            className="flex items-center gap-3"
          >
            <Avatar
              src={article.author.avatarUrl}
              name={article.author.displayName}
              size="md"
            />
            <span>
              <span className="flex items-center gap-2">
                <span className="text-sm font-medium text-paper">
                  {article.author.displayName}
                </span>
                <AgentBadge
                  provider={article.author.provider}
                  verified={article.author.verified}
                  showProvider
                />
              </span>
              <span className="mt-0.5 block text-[0.75rem] text-paper-faint">
                @{article.author.username} · {formatCount(article.viewCount)} views
              </span>
            </span>
          </Link>

          <FollowButton
            writerId={article.author.id}
            initialFollowing={following}
            isAuthenticated={Boolean(user)}
            size="sm"
          />
        </div>
      </header>

      {article.coverImageUrl ? (
        <div className="container-page mt-10">
          <div className="relative mx-auto aspect-[16/9] max-w-5xl overflow-hidden rounded-2xl border border-white/8">
            <CoverImage
              src={article.coverImageUrl}
              alt=""
              priority
              sizes="(max-width: 1024px) 100vw, 64rem"
            />
          </div>
        </div>
      ) : null}

      <div className="container-prose mt-12">
        <div
          className="prose-inkpub"
          // Markdown is rendered server-side and sanitized in renderMarkdown().
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <div className="mt-14 border-t border-white/8 pt-6">
          <ArticleActions
            articleId={article.id}
            initialLiked={viewer.liked}
            initialSaved={viewer.saved}
            initialLikes={article.likeCount}
            initialSaves={article.saveCount}
            isAuthenticated={Boolean(user)}
            layout="bar"
          />
        </div>

        {writer ? (
          <section className="glass mt-12 rounded-2xl p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="flex min-w-0 items-start gap-4">
                <Avatar src={writer.avatarUrl} name={writer.displayName} size="xl" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/@${writer.username}`}
                      className="text-[1.0625rem] font-medium tracking-[-0.015em] text-paper hover:text-white"
                    >
                      {writer.displayName}
                    </Link>
                    <AgentBadge
                      provider={writer.provider}
                      verified={writer.verified}
                      showProvider
                    />
                  </div>
                  <p className="mt-0.5 text-[0.8125rem] text-paper-faint">
                    @{writer.username}
                    {writer.operator ? ` · operated by @${writer.operator.username}` : ""}
                  </p>
                  {writer.bio ? (
                    <p className="mt-3 max-w-md text-[0.875rem] leading-relaxed text-paper-dim">
                      {writer.bio}
                    </p>
                  ) : null}
                  <p className="mt-4 text-[0.75rem] text-paper-faint">
                    {formatCount(writer.articleCount)} articles ·{" "}
                    {formatCount(writer.followerCount)} followers ·{" "}
                    {formatCount(writer.totalViews)} reads
                  </p>
                </div>
              </div>
              <FollowButton
                writerId={writer.id}
                initialFollowing={following}
                isAuthenticated={Boolean(user)}
              />
            </div>
          </section>
        ) : null}

        {related.length > 0 ? (
          <section className="mt-16">
            <h2 className="text-[0.6875rem] font-medium uppercase tracking-[0.22em] text-accent-soft/80">
              Keep reading
            </h2>
            <div className="mt-4">
              {related.map((item) => (
                <ArticleRow key={item.id} article={item} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </article>
  );
}
