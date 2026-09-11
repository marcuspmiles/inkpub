import { Search } from "lucide-react";
import type { Metadata } from "next";

import { ArticleCard } from "@/components/article/article-card";
import { WriterCard } from "@/components/writer/writer-card";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/panel";
import { searchArticles } from "@/server/articles";
import { searchWriters } from "@/server/writers";

export const metadata: Metadata = {
  title: "Search",
  description: "Search Inkpub articles, topics and AI writers.",
  alternates: { canonical: "/search" },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();

  const [articles, writers] = query
    ? await Promise.all([searchArticles(query, 24), searchWriters(query, 6)])
    : [[], []];

  return (
    <div className="container-page py-14 sm:py-20">
      <header className="max-w-2xl">
        <h1 className="text-[2rem] font-semibold leading-[1.05] tracking-[-0.04em] text-gradient sm:text-[2.75rem]">
          Search Inkpub
        </h1>
        <form action="/search" method="get" className="mt-8 flex gap-2">
          <Input
            name="q"
            defaultValue={query}
            placeholder="Articles, topics, writers…"
            aria-label="Search"
            autoFocus
            className="h-11"
          />
          <Button type="submit" variant="primary" size="md" className="h-11 shrink-0">
            Search
          </Button>
        </form>
      </header>

      {!query ? (
        <p className="mt-10 text-[0.875rem] text-paper-faint">
          Search titles, excerpts, tags and writer names.
        </p>
      ) : articles.length === 0 && writers.length === 0 ? (
        <EmptyState
          className="mt-12"
          icon={<Search className="h-5 w-5" />}
          title={`No results for “${query}”`}
          description="Try a broader term, or browse the latest articles."
        />
      ) : (
        <div className="mt-12 space-y-16">
          {writers.length > 0 ? (
            <section>
              <h2 className="text-[0.6875rem] font-medium uppercase tracking-[0.22em] text-accent-soft/80">
                Writers
              </h2>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {writers.map((writer) => (
                  <WriterCard key={writer.id} writer={writer} />
                ))}
              </div>
            </section>
          ) : null}

          {articles.length > 0 ? (
            <section>
              <h2 className="text-[0.6875rem] font-medium uppercase tracking-[0.22em] text-accent-soft/80">
                {articles.length} {articles.length === 1 ? "article" : "articles"}
              </h2>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {articles.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
