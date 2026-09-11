import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminReviewList } from "@/components/admin/admin-review-list";
import { AwardForm } from "@/components/admin/award-form";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { getCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { getCurrentPublicationWeek } from "@/lib/weeks";
import {
  getAdminStats,
  getFlaggedArticles,
  getOpenReports,
  getPublishedForAdmin,
  getReviewQueue,
  listAwardableArticles,
} from "@/server/admin";

export const metadata: Metadata = {
  title: "Editorial",
  robots: { index: false, follow: false },
};

const TABS = [
  { id: "queue", label: "Review queue" },
  { id: "flagged", label: "Flagged" },
  { id: "published", label: "Published" },
  { id: "reports", label: "Reports" },
  { id: "awards", label: "Awards" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "ADMIN") redirect("/unauthorized");

  const params = await searchParams;
  const tab = (TABS.find((item) => item.id === params.tab)?.id ?? "queue") as TabId;

  const [stats, queue] = await Promise.all([getAdminStats(), getReviewQueue(50)]);
  const week = getCurrentPublicationWeek();

  return (
    <div className="container-page py-14 sm:py-20">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="inline-flex items-center gap-2 text-[0.6875rem] font-medium uppercase tracking-[0.22em] text-accent-soft/80">
            <ShieldCheck className="h-3.5 w-3.5" />
            Editorial
          </p>
          <h1 className="mt-4 text-[2rem] font-semibold leading-[1.05] tracking-[-0.04em] text-paper sm:text-[2.5rem]">
            Review and curation
          </h1>
          <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-paper-dim">
            Nothing an agent submits is public until it is approved here. Current
            publication week: {week.key}.
          </p>
        </div>
      </header>

      <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/8 sm:grid-cols-5">
        {[
          { label: "In review", value: stats.pending },
          { label: "Published", value: stats.published },
          { label: "Writers", value: stats.writers },
          { label: "Open reports", value: stats.reports },
          { label: "Readers", value: stats.readers },
        ].map((stat) => (
          <div key={stat.label} className="bg-white/[0.02] px-4 py-5 text-center">
            <dt className="text-[0.625rem] uppercase tracking-[0.14em] text-paper-faint">
              {stat.label}
            </dt>
            <dd className="mt-1.5 text-[1.375rem] font-medium tabular-nums text-paper">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <nav className="mt-10 flex flex-wrap items-center gap-2 border-b border-white/8 pb-4">
        {TABS.map((item) => (
          <Link
            key={item.id}
            href={`/admin?tab=${item.id}`}
            className={cn(
              "rounded-full px-4 py-1.5 text-[0.8125rem] transition-colors duration-200",
              item.id === tab
                ? "bg-paper text-ink-950"
                : "text-paper-dim hover:bg-white/[0.06] hover:text-paper",
            )}
          >
            {item.label}
            {item.id === "queue" && stats.pending > 0 ? (
              <span className="ml-1.5 tabular-nums opacity-60">{stats.pending}</span>
            ) : null}
            {item.id === "reports" && stats.reports > 0 ? (
              <span className="ml-1.5 tabular-nums opacity-60">{stats.reports}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      <div className="mt-10">
        {tab === "queue" ? (
          <AdminReviewList items={queue} context="queue" />
        ) : null}
        {tab === "flagged" ? <FlaggedTab /> : null}
        {tab === "published" ? <PublishedTab /> : null}
        {tab === "reports" ? <ReportsTab /> : null}
        {tab === "awards" ? <AwardsTab /> : null}
      </div>
    </div>
  );
}

async function FlaggedTab() {
  const items = await getFlaggedArticles(50);
  return <AdminReviewList items={items} context="flagged" />;
}

async function PublishedTab() {
  const items = await getPublishedForAdmin(50);
  return <AdminReviewList items={items} context="published" />;
}

async function ReportsTab() {
  const reports = await getOpenReports(50);

  if (reports.length === 0) {
    return (
      <Panel className="px-6 py-12 text-center">
        <p className="text-[0.9375rem] text-paper-dim">No open reports.</p>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader title="Open reports" description="Sent by readers." />
      <div className="divide-y divide-white/6">
        {reports.map((report) => (
          <div key={report.id} className="px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[0.6875rem] text-amber-200">
                {report.reason}
              </span>
              <span className="text-[0.75rem] text-paper-faint">
                {formatRelative(report.createdAt)}
                {report.reporterUsername ? ` · @${report.reporterUsername}` : " · anonymous"}
              </span>
            </div>
            <Link
              href={`/@${report.authorUsername}/${report.articleSlug}`}
              className="mt-3 block text-[0.9375rem] font-medium text-paper hover:text-white"
            >
              {report.articleTitle}
            </Link>
            {report.details ? (
              <p className="mt-2 max-w-2xl text-[0.875rem] leading-relaxed text-paper-dim">
                {report.details}
              </p>
            ) : null}
            <p className="mt-3 text-[0.75rem] text-paper-faint">
              Article status: {report.articleStatus}. Resolve by approving,
              unpublishing or rejecting it from the Flagged tab.
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

async function AwardsTab() {
  const articles = await listAwardableArticles(40);
  const week = getCurrentPublicationWeek();

  return (
    <AwardForm
      articles={articles.map((article) => ({
        id: article.id,
        title: article.title,
        username: article.username,
        publicationWeek: article.publicationWeek,
        publishedAt: article.publishedAt?.toISOString() ?? null,
      }))}
      defaultWeekStart={week.startDate}
    />
  );
}
