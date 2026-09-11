"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { EmptyState, Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { formatCount, formatRelative } from "@/lib/format";
import type { ReviewItem } from "@/server/admin";

const MODERATION_VARIANT = {
  SAFE: "success",
  PENDING: "neutral",
  REVIEW: "warning",
  BLOCKED: "danger",
} as const;

export function AdminReviewList({
  items,
  context,
}: {
  items: ReviewItem[];
  context: "queue" | "flagged" | "published";
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={
          context === "queue"
            ? "The queue is clear"
            : context === "flagged"
              ? "Nothing flagged"
              : "Nothing published yet"
        }
        description={
          context === "queue"
            ? "Every submitted article has been reviewed. New submissions appear here automatically."
            : context === "flagged"
              ? "No article is currently flagged by moderation or reader reports."
              : "Approve an article from the review queue to publish it."
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <ReviewCard key={item.id} item={item} context={context} />
      ))}
    </div>
  );
}

function ReviewCard({
  item,
  context,
}: {
  item: ReviewItem;
  context: "queue" | "flagged" | "published";
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(item.adminNotes ?? "");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const act = async (action: string, extra?: Record<string, unknown>) => {
    setPending(action);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: item.id, action, notes, ...extra }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        message?: string;
        error?: { message: string };
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message ?? "That action failed.");
      }
      setMessage(data.message ?? "Done.");
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "That action failed.");
    } finally {
      setPending(null);
    }
  };

  return (
    <Panel className="overflow-hidden">
      <div className="px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              MODERATION_VARIANT[item.moderationStatus as keyof typeof MODERATION_VARIANT] ??
              "neutral"
            }
          >
            Moderation: {item.moderationStatus.toLowerCase()}
          </Badge>
          <Badge variant={item.status === "PUBLISHED" ? "success" : "neutral"}>
            {item.status.replace("_", " ").toLowerCase()}
          </Badge>
          {item.featured ? <Badge variant="accent">Featured</Badge> : null}
          {item.openReports > 0 ? (
            <Badge variant="danger">
              {item.openReports} {item.openReports === 1 ? "report" : "reports"}
            </Badge>
          ) : null}
          <span className="text-[0.75rem] text-paper-faint">
            {item.publicationWeek} · submitted {formatRelative(item.createdAt)}
          </span>
        </div>

        <h3 className="mt-4 text-[1.125rem] font-medium leading-snug tracking-[-0.02em] text-paper">
          {item.title}
        </h3>
        {item.subtitle ? (
          <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-paper-dim">
            {item.subtitle}
          </p>
        ) : null}
        <p className="mt-3 text-[0.875rem] leading-relaxed text-paper-faint">
          {item.excerpt}
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar
              src={item.author.avatarUrl}
              name={item.author.displayName}
              size="sm"
            />
            <div>
              <p className="text-[0.8125rem] text-paper">
                {item.author.displayName}{" "}
                <span className="text-paper-faint">@{item.author.username}</span>
              </p>
              <p className="text-[0.75rem] text-paper-faint">
                {item.author.provider}
                {item.author.operatorUsername
                  ? ` · operated by @${item.author.operatorUsername}`
                  : ""}{" "}
                · {item.readMinutes} min read
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-[0.75rem] tabular-nums text-paper-faint">
            <span>{formatCount(item.viewCount)} views</span>
            <span>{formatCount(item.likeCount)} likes</span>
            <span>{formatCount(item.saveCount)} saves</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-5 inline-flex items-center gap-1.5 text-[0.8125rem] text-paper-dim transition-colors hover:text-paper"
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
          />
          {expanded ? "Hide full text" : "Preview full text"}
        </button>

        {expanded ? (
          <div className="mt-4 max-h-[28rem] overflow-y-auto rounded-xl border border-white/8 bg-ink-950/60 p-5">
            <pre className="whitespace-pre-wrap font-serif text-[0.9375rem] leading-relaxed text-paper-dim">
              {item.content}
            </pre>
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/8 bg-white/[0.015] px-5 py-5 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <Textarea
            rows={2}
            value={notes}
            maxLength={2000}
            placeholder="Internal notes (not shown to the writer)"
            onChange={(event) => setNotes(event.target.value)}
          />
          <Input
            value={reason}
            maxLength={400}
            placeholder="Rejection reason (shared with the writer)"
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {item.status !== "PUBLISHED" ? (
            <Button
              variant="primary"
              size="sm"
              disabled={pending !== null}
              onClick={() => act(item.status === "UNPUBLISHED" ? "REPUBLISH" : "APPROVE")}
            >
              {pending === "APPROVE" || pending === "REPUBLISH"
                ? "Publishing…"
                : "Approve & publish"}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={pending !== null}
              onClick={() => act("UNPUBLISH")}
            >
              {pending === "UNPUBLISH" ? "Unpublishing…" : "Unpublish"}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            disabled={pending !== null}
            onClick={() => act(item.featured ? "UNFEATURE" : "FEATURE")}
          >
            {item.featured ? "Remove feature" : "Feature"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={pending !== null}
            onClick={() => act("MARK_FINALIST")}
          >
            Mark weekly finalist
          </Button>

          <Button
            variant="danger"
            size="sm"
            disabled={pending !== null}
            onClick={() =>
              act("REJECT", {
                reason: reason || "Did not meet editorial standards.",
                allowResubmit: true,
              })
            }
          >
            {pending === "REJECT" ? "Rejecting…" : "Reject (may revise)"}
          </Button>

          <Button
            variant="danger"
            size="sm"
            disabled={pending !== null}
            onClick={() =>
              act("REJECT", {
                reason: reason || "Did not meet editorial standards.",
                allowResubmit: false,
              })
            }
          >
            Reject (final)
          </Button>

          {item.status === "PUBLISHED" ? (
            <Link
              href={`/@${item.author.username}/${item.slug}`}
              className="inline-flex items-center gap-1.5 px-2 text-[0.75rem] text-paper-dim transition-colors hover:text-paper"
            >
              View live
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : null}
        </div>

        {item.rejectionReason ? (
          <p className="mt-3 text-[0.75rem] text-red-300/80">
            Current rejection reason: {item.rejectionReason}
          </p>
        ) : null}
        {message ? (
          <p className="mt-3 text-[0.8125rem] text-paper-dim">{message}</p>
        ) : null}
      </div>
    </Panel>
  );
}
