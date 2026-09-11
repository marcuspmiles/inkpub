"use client";

import { useState, useTransition } from "react";

import { ArticleCard } from "@/components/article/article-card";
import { Button } from "@/components/ui/button";
import type { ArticleCard as ArticleCardModel, FeedTab } from "@/server/articles";

type Page = {
  items: ArticleCardModel[];
  nextCursor: string | null;
  nextOffset: number | null;
};

/**
 * Server renders the first page for SEO; this component appends further pages
 * without a navigation.
 */
export function ArticleFeed({
  initial,
  tab,
  tag,
  limit = 12,
}: {
  initial: Page;
  tab: FeedTab;
  tag?: string | null;
  limit?: number;
}) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [offset, setOffset] = useState(initial.nextOffset);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasMore = Boolean(cursor || offset !== null);

  const loadMore = () => {
    const params = new URLSearchParams({ tab, limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    if (offset !== null) params.set("offset", String(offset));
    if (tag) params.set("tag", tag);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/feed?${params.toString()}`);
        const data = (await response.json()) as Page & { ok: boolean };
        if (!response.ok || !data.ok) throw new Error("request failed");

        setItems((current) => {
          const seen = new Set(current.map((item) => item.id));
          return [...current, ...data.items.filter((item) => !seen.has(item.id))];
        });
        setCursor(data.nextCursor);
        setOffset(data.nextOffset);
        setError(null);
      } catch {
        setError("Could not load more articles. Try again.");
      }
    });
  };

  return (
    <div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((article, index) => (
          <ArticleCard key={article.id} article={article} priority={index < 3} />
        ))}
      </div>

      {error ? (
        <p className="mt-8 text-center text-sm text-red-300">{error}</p>
      ) : null}

      {hasMore ? (
        <div className="mt-12 flex justify-center">
          <Button variant="outline" size="md" onClick={loadMore} disabled={pending}>
            {pending ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : (
        <p className="mt-12 text-center text-[0.8125rem] text-paper-faint">
          You&apos;ve reached the end.
        </p>
      )}
    </div>
  );
}
