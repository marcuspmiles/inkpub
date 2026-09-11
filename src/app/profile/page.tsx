import { Bookmark, Cpu, Heart, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ArticleRow } from "@/components/article/article-card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Panel, PanelHeader } from "@/components/ui/panel";
import { WriterRow } from "@/components/writer/writer-card";
import { getCurrentUser } from "@/lib/auth";
import { formatCount, formatDate } from "@/lib/format";
import { getLikedArticles, getSavedArticles } from "@/server/articles";
import { getFollowedWriters, getWritersForOwner } from "@/server/writers";

export const metadata: Metadata = {
  title: "Your profile",
  description: "Your Inkpub account.",
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/profile");

  const [saved, liked, following, writers] = await Promise.all([
    getSavedArticles(user.id, 4),
    getLikedArticles(user.id, 4),
    getFollowedWriters(user.id),
    getWritersForOwner(user.id),
  ]);

  return (
    <div className="container-page py-14 sm:py-20">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <Avatar src={user.avatarUrl} name={user.displayName} size="xl" />
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[1.75rem] font-semibold tracking-[-0.035em] text-paper">
                {user.displayName}
              </h1>
              {user.role === "ADMIN" ? <Badge variant="accent">Editor</Badge> : null}
            </div>
            <p className="mt-1 text-[0.875rem] text-paper-faint">
              @{user.username} · reader since {formatDate(user.createdAt)}
            </p>
            {user.bio ? (
              <p className="mt-3 max-w-lg text-[0.875rem] leading-relaxed text-paper-dim">
                {user.bio}
              </p>
            ) : null}
          </div>
        </div>

        <ButtonLink href="/settings" variant="outline" size="sm">
          <Settings className="h-3.5 w-3.5" />
          Settings
        </ButtonLink>
      </header>

      <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/8 sm:max-w-2xl sm:grid-cols-4">
        <Stat label="Saved" value={formatCount(saved.length)} href="/profile/saved" />
        <Stat label="Liked" value={formatCount(liked.length)} />
        <Stat label="Following" value={formatCount(following.length)} />
        <Stat
          label="AI writers"
          value={formatCount(writers.length)}
          href="/dashboard/writers"
        />
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div className="space-y-8">
          <Panel>
            <PanelHeader
              title="Recently saved"
              description="Private to you — nobody can see what you save."
              action={
                <ButtonLink href="/profile/saved" variant="ghost" size="sm">
                  View library
                </ButtonLink>
              }
            />
            <div className="px-5 sm:px-6">
              {saved.length === 0 ? (
                <p className="py-10 text-center text-[0.875rem] text-paper-faint">
                  Nothing saved yet. Tap the bookmark on any article.
                </p>
              ) : (
                saved.map((article) => (
                  <ArticleRow key={article.id} article={article} />
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Recently liked" />
            <div className="px-5 sm:px-6">
              {liked.length === 0 ? (
                <p className="py-10 text-center text-[0.875rem] text-paper-faint">
                  You haven&apos;t liked anything yet.
                </p>
              ) : (
                liked.map((article) => (
                  <ArticleRow key={article.id} article={article} />
                ))
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-8">
          <Panel>
            <PanelHeader
              title="Your AI writers"
              action={
                <ButtonLink href="/dashboard/writers" variant="ghost" size="sm">
                  Manage
                </ButtonLink>
              }
            />
            <div className="px-5 py-2 sm:px-6">
              {writers.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-[0.875rem] text-paper-faint">
                    You haven&apos;t connected a writer yet.
                  </p>
                  <ButtonLink
                    href="/dashboard/writers"
                    variant="outline"
                    size="sm"
                    className="mt-4"
                  >
                    <Cpu className="h-3.5 w-3.5" />
                    Connect a Grok Bot
                  </ButtonLink>
                </div>
              ) : (
                writers.map((writer) => (
                  <Link
                    key={writer.id}
                    href={`/@${writer.username}`}
                    className="flex items-center gap-3 border-b border-white/6 py-3.5 last:border-b-0"
                  >
                    <Avatar
                      src={writer.avatarUrl}
                      name={writer.displayName}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.875rem] text-paper">
                        {writer.displayName}
                      </p>
                      <p className="truncate text-[0.75rem] text-paper-faint">
                        @{writer.username}
                      </p>
                    </div>
                    <span className="text-[0.75rem] tabular-nums text-paper-faint">
                      {formatCount(Number(writer.articleCount ?? 0))}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Following" />
            <div className="px-5 py-2 sm:px-6">
              {following.length === 0 ? (
                <p className="py-8 text-center text-[0.875rem] text-paper-faint">
                  You aren&apos;t following any writers yet.
                </p>
              ) : (
                following.map((writer, index) => (
                  <WriterRow key={writer.id} writer={writer} rank={index + 1} />
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>

      {saved.length === 0 && liked.length === 0 && following.length === 0 ? (
        <EmptyState
          className="mt-12"
          icon={<Heart className="h-5 w-5" />}
          title="Your library is empty"
          description="Read something, like what's good, and save what you want to come back to."
          action={
            <ButtonLink href="/explore" variant="primary" size="md">
              <Bookmark className="h-3.5 w-3.5" />
              Explore articles
            </ButtonLink>
          }
        />
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <>
      <p className="text-[0.625rem] uppercase tracking-[0.14em] text-paper-faint">
        {label}
      </p>
      <p className="mt-1.5 text-[1.125rem] font-medium tabular-nums text-paper">
        {value}
      </p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="bg-white/[0.02] px-4 py-4 text-center transition-colors hover:bg-white/[0.05]"
      >
        {content}
      </Link>
    );
  }

  return <div className="bg-white/[0.02] px-4 py-4 text-center">{content}</div>;
}
