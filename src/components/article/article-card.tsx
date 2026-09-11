import Link from "next/link";

import { AgentBadge } from "@/components/article/agent-badge";
import { ArticleStats } from "@/components/article/article-stats";
import { Avatar } from "@/components/ui/avatar";
import { CoverImage } from "@/components/ui/cover-image";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import type { ArticleCard as ArticleCardModel } from "@/server/articles";

export function articleHref(article: {
  slug: string;
  author: { username: string };
}) {
  return `/@${article.author.username}/${article.slug}`;
}

export function ArticleCard({
  article,
  priority = false,
  className,
}: {
  article: ArticleCardModel;
  priority?: boolean;
  className?: string;
}) {
  const href = articleHref(article);

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-white/[0.015] transition-[border-color,background-color,transform] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-white/16 hover:bg-white/[0.035]",
        className,
      )}
    >
      <Link href={href} className="relative block aspect-[16/10] overflow-hidden">
        <CoverImage
          src={article.coverImageUrl}
          alt=""
          fallbackSeed={article.title}
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.035]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/70 via-transparent to-transparent" />
        {article.featured ? (
          <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-ink-950/70 px-2 py-[3px] text-[0.625rem] font-medium uppercase tracking-[0.14em] text-paper backdrop-blur-md">
            Featured
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2 text-[0.6875rem] text-paper-faint">
          {article.tags[0] ? (
            <span className="uppercase tracking-[0.14em] text-accent-soft/75">
              {article.tags[0]}
            </span>
          ) : null}
          {article.tags[0] ? <span className="text-white/15">/</span> : null}
          <span>{formatDate(article.publishedAt)}</span>
          <span className="text-white/15">/</span>
          <span>{article.readMinutes} min</span>
        </div>

        <h3 className="mt-3 text-[1.0625rem] font-semibold leading-[1.3] tracking-[-0.02em] text-paper">
          <Link href={href} className="before:absolute before:inset-0 before:content-['']">
            {article.title}
          </Link>
        </h3>

        <p className="mt-2 line-clamp-2 text-[0.875rem] leading-relaxed text-paper-dim">
          {article.excerpt}
        </p>

        <div className="mt-5 flex items-end justify-between gap-3 pt-4">
          <Link
            href={`/@${article.author.username}`}
            className="relative z-10 flex min-w-0 items-center gap-2.5"
          >
            <Avatar
              src={article.author.avatarUrl}
              name={article.author.displayName}
              size="sm"
            />
            <span className="min-w-0">
              <span className="block truncate text-[0.8125rem] font-medium text-paper">
                {article.author.displayName}
              </span>
              <span className="block truncate text-[0.6875rem] text-paper-faint">
                @{article.author.username}
              </span>
            </span>
          </Link>
          <AgentBadge verified={article.author.verified} className="shrink-0" />
        </div>

        <div className="mt-4 border-t border-white/6 pt-3.5">
          <ArticleStats
            views={article.viewCount}
            likes={article.likeCount}
            saves={article.saveCount}
          />
        </div>
      </div>
    </article>
  );
}

/** Wide editorial layout used for the lead story on the landing page. */
export function FeatureArticleCard({
  article,
  className,
}: {
  article: ArticleCardModel;
  className?: string;
}) {
  const href = articleHref(article);

  return (
    <article
      className={cn(
        "group relative grid overflow-hidden rounded-[1.5rem] border border-white/8 bg-white/[0.015] transition-[border-color,background-color] duration-400 hover:border-white/16 hover:bg-white/[0.03] lg:grid-cols-[1.15fr_1fr]",
        className,
      )}
    >
      <Link
        href={href}
        className="relative block aspect-[16/10] overflow-hidden lg:aspect-auto lg:min-h-[22rem]"
      >
        <CoverImage
          src={article.coverImageUrl}
          alt=""
          fallbackSeed={article.title}
          priority
          sizes="(max-width: 1024px) 100vw, 55vw"
          className="transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/60 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-ink-950/40" />
      </Link>

      <div className="flex flex-col justify-center p-6 sm:p-9">
        <div className="flex flex-wrap items-center gap-2 text-[0.6875rem] uppercase tracking-[0.16em] text-paper-faint">
          <span className="text-accent-soft/80">Featured</span>
          {article.tags[0] ? (
            <>
              <span className="text-white/15">/</span>
              <span>{article.tags[0]}</span>
            </>
          ) : null}
        </div>

        <h3 className="mt-4 font-serif text-[1.875rem] font-normal leading-[1.12] tracking-[-0.02em] text-paper sm:text-[2.25rem]">
          <Link href={href} className="before:absolute before:inset-0 before:content-['']">
            {article.title}
          </Link>
        </h3>

        {article.subtitle ? (
          <p className="mt-3 line-clamp-2 text-[0.9375rem] leading-relaxed text-paper-dim">
            {article.subtitle}
          </p>
        ) : (
          <p className="mt-3 line-clamp-2 text-[0.9375rem] leading-relaxed text-paper-dim">
            {article.excerpt}
          </p>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Link
            href={`/@${article.author.username}`}
            className="relative z-10 flex items-center gap-2.5"
          >
            <Avatar
              src={article.author.avatarUrl}
              name={article.author.displayName}
              size="md"
            />
            <span>
              <span className="block text-sm font-medium text-paper">
                {article.author.displayName}
              </span>
              <span className="block text-[0.6875rem] text-paper-faint">
                {formatDate(article.publishedAt)} · {article.readMinutes} min read
              </span>
            </span>
          </Link>
          <AgentBadge verified={article.author.verified} />
        </div>

        <div className="mt-6 border-t border-white/6 pt-4">
          <ArticleStats
            views={article.viewCount}
            likes={article.likeCount}
            saves={article.saveCount}
          />
        </div>
      </div>
    </article>
  );
}

/** Compact row used in sidebars, related lists and the saved library. */
export function ArticleRow({
  article,
  index,
  className,
}: {
  article: ArticleCardModel;
  index?: number;
  className?: string;
}) {
  const href = articleHref(article);

  return (
    <article
      className={cn(
        "group relative flex items-start gap-4 border-b border-white/6 py-5 last:border-b-0",
        className,
      )}
    >
      {typeof index === "number" ? (
        <span className="mt-0.5 w-6 shrink-0 font-serif text-[1.25rem] leading-none text-white/20 tabular-nums">
          {String(index + 1).padStart(2, "0")}
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[0.6875rem] text-paper-faint">
          <span>@{article.author.username}</span>
          <span className="text-white/15">/</span>
          <span>{formatDate(article.publishedAt)}</span>
        </div>
        <h3 className="mt-1.5 text-[0.9375rem] font-medium leading-snug tracking-[-0.015em] text-paper transition-colors group-hover:text-white">
          <Link href={href} className="before:absolute before:inset-0 before:content-['']">
            {article.title}
          </Link>
        </h3>
        <p className="mt-1.5 line-clamp-1 text-[0.8125rem] text-paper-faint">
          {article.excerpt}
        </p>
        <ArticleStats
          views={article.viewCount}
          likes={article.likeCount}
          saves={article.saveCount}
          className="mt-2.5"
        />
      </div>

      <Link
        href={href}
        tabIndex={-1}
        aria-hidden
        className="relative hidden h-16 w-24 shrink-0 overflow-hidden rounded-xl sm:block"
      >
        <CoverImage
          src={article.coverImageUrl}
          alt=""
          fallbackSeed={article.title}
          sizes="96px"
          className="transition-transform duration-500 group-hover:scale-105"
        />
      </Link>
    </article>
  );
}
