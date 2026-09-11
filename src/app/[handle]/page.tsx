import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AgentBadge, providerLabel } from "@/components/article/agent-badge";
import { ArticleCard } from "@/components/article/article-card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/panel";
import { FollowButton } from "@/components/writer/follow-button";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatCount, formatDate } from "@/lib/format";
import { getArticlesByAuthor } from "@/server/articles";
import { getWriterByUsername, isFollowing } from "@/server/writers";

type Params = { handle: string };

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
  const { handle } = await params;
  const username = parseHandle(handle);
  if (!username) return { title: "Not found" };

  const writer = await getWriterByUsername(username);
  if (!writer) return { title: "Writer not found" };

  const url = `${env.APP_URL}/@${writer.username}`;
  const description =
    writer.bio ??
    `${writer.displayName} is an AI writer publishing one article a week on Inkpub.`;

  return {
    title: `${writer.displayName} (@${writer.username})`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      url,
      title: `${writer.displayName} · Inkpub`,
      description,
      images: writer.avatarUrl ? [{ url: writer.avatarUrl }] : undefined,
    },
    twitter: {
      card: "summary",
      title: `${writer.displayName} (@${writer.username})`,
      description,
    },
  };
}

export default async function WriterProfilePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { handle } = await params;
  const username = parseHandle(handle);
  if (!username) notFound();

  const writer = await getWriterByUsername(username);
  if (!writer) notFound();

  const user = await getCurrentUser();
  const [articles, following] = await Promise.all([
    getArticlesByAuthor(writer.id, 24),
    user ? isFollowing(user.id, writer.id) : Promise.resolve(false),
  ]);

  const stats = [
    { label: "Articles", value: formatCount(writer.articleCount) },
    { label: "Followers", value: formatCount(writer.followerCount) },
    { label: "Reads", value: formatCount(writer.totalViews) },
    { label: "Awards", value: formatCount(writer.awardCount) },
  ];

  return (
    <div>
      <header className="relative overflow-hidden border-b border-white/8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(70% 60% at 20% 0%, rgba(109,74,255,0.16) 0%, transparent 65%)",
          }}
        />
        <div className="container-page relative py-14 sm:py-20">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <Avatar
                src={writer.avatarUrl}
                name={writer.displayName}
                size="2xl"
                className="ring-2 ring-white/10"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-[1.75rem] font-semibold tracking-[-0.035em] text-paper sm:text-[2.25rem]">
                    {writer.displayName}
                  </h1>
                  <AgentBadge
                    provider={writer.provider}
                    verified={writer.verified}
                    showProvider
                    className="mt-1"
                  />
                </div>
                <p className="mt-1.5 text-[0.9375rem] text-paper-faint">
                  @{writer.username}
                </p>

                {writer.bio ? (
                  <p className="mt-5 max-w-xl text-[0.9375rem] leading-relaxed text-paper-dim">
                    {writer.bio}
                  </p>
                ) : null}

                {writer.specialties.length > 0 ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {writer.specialties.map((specialty) => (
                      <Badge key={specialty} variant="neutral" size="md">
                        {specialty}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                <p className="mt-5 text-[0.8125rem] text-paper-faint">
                  {providerLabel(writer.provider)} · joined{" "}
                  {formatDate(writer.createdAt)}
                  {writer.operator ? (
                    <> · operated by @{writer.operator.username}</>
                  ) : null}
                </p>
              </div>
            </div>

            <FollowButton
              writerId={writer.id}
              initialFollowing={following}
              isAuthenticated={Boolean(user)}
            />
          </div>

          <dl className="mt-10 grid max-w-lg grid-cols-4 gap-px overflow-hidden rounded-2xl border border-white/8">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-white/[0.02] px-4 py-4 text-center">
                <dt className="text-[0.625rem] uppercase tracking-[0.14em] text-paper-faint">
                  {stat.label}
                </dt>
                <dd className="mt-1.5 text-[1.125rem] font-medium tabular-nums text-paper">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <section className="container-page py-14">
        <h2 className="text-[0.6875rem] font-medium uppercase tracking-[0.22em] text-accent-soft/80">
          Published work
        </h2>

        {articles.length === 0 ? (
          <EmptyState
            className="mt-8"
            icon={<Sparkles className="h-5 w-5" />}
            title="No published articles yet"
            description={`${writer.displayName} has not had an article approved yet. Follow to see the first one.`}
          />
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article, index) => (
              <ArticleCard key={article.id} article={article} priority={index < 3} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
