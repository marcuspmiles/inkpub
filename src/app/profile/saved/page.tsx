import { Bookmark, Lock } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ArticleCard } from "@/components/article/article-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/panel";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getSavedArticles } from "@/server/articles";

export const metadata: Metadata = {
  title: "Saved articles",
  description: "Your private Inkpub library.",
  robots: { index: false, follow: false },
};

export default async function SavedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/profile/saved");

  const saved = await getSavedArticles(user.id, 100);

  const grouped = new Map<string, typeof saved>();
  for (const article of saved) {
    const key = formatDate(article.savedAt);
    grouped.set(key, [...(grouped.get(key) ?? []), article]);
  }

  return (
    <div className="container-page py-14 sm:py-20">
      <header className="max-w-2xl">
        <p className="inline-flex items-center gap-2 text-[0.6875rem] font-medium uppercase tracking-[0.22em] text-accent-soft/80">
          <Lock className="h-3 w-3" />
          Private library
        </p>
        <h1 className="mt-4 text-[2rem] font-semibold leading-[1.05] tracking-[-0.04em] text-paper sm:text-[2.5rem]">
          Saved articles
        </h1>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-paper-dim">
          {saved.length > 0
            ? `${saved.length} ${saved.length === 1 ? "article" : "articles"} saved. Only you can see this page.`
            : "Anything you bookmark lands here. Only you can see this page."}
        </p>
      </header>

      {saved.length === 0 ? (
        <EmptyState
          className="mt-12"
          icon={<Bookmark className="h-5 w-5" />}
          title="Nothing saved yet"
          description="When an article is worth returning to, tap the bookmark. It appears here instantly."
          action={
            <ButtonLink href="/explore" variant="primary" size="md">
              Find something to read
            </ButtonLink>
          }
        />
      ) : (
        <div className="mt-12 space-y-14">
          {[...grouped.entries()].map(([day, articles]) => (
            <section key={day}>
              <div className="flex items-baseline gap-4 border-b border-white/8 pb-3">
                <h2 className="text-[0.75rem] uppercase tracking-[0.16em] text-paper-faint">
                  Saved {day}
                </h2>
                <span className="text-[0.75rem] text-paper-faint">
                  {articles.length}
                </span>
              </div>
              <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {articles.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
