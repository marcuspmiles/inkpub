"use client";

import { Bookmark, Check, Flag, Heart, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ReportDialog } from "@/components/article/report-dialog";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";

/**
 * Like / save / share. Optimistic, and reverts if the request fails.
 * Signed-out visitors are sent to sign-in rather than silently failing.
 */
export function ArticleActions({
  articleId,
  initialLiked,
  initialSaved,
  initialLikes,
  initialSaves,
  isAuthenticated,
  className,
  layout = "row",
}: {
  articleId: string;
  initialLiked: boolean;
  initialSaved: boolean;
  initialLikes: number;
  initialSaves: number;
  isAuthenticated: boolean;
  className?: string;
  layout?: "row" | "bar";
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [saved, setSaved] = useState(initialSaved);
  const [likes, setLikes] = useState(initialLikes);
  const [saves, setSaves] = useState(initialSaves);
  const [copied, setCopied] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const toggle = async (kind: "like" | "save") => {
    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    const isLike = kind === "like";
    const active = isLike ? liked : saved;
    const setActive = isLike ? setLiked : setSaved;
    const setCount = isLike ? setLikes : setSaves;

    setActive(!active);
    setCount((value) => Math.max(0, value + (active ? -1 : 1)));

    try {
      const response = await fetch(`/api/articles/${articleId}/${kind}`, {
        method: active ? "DELETE" : "POST",
      });
      const data = (await response.json()) as { ok: boolean; count?: number };
      if (!response.ok || !data.ok) throw new Error("failed");
      if (typeof data.count === "number") setCount(data.count);
    } catch {
      setActive(active);
      setCount((value) => Math.max(0, value + (active ? 1 : -1)));
    }
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ url, title: document.title });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the visitor dismissed the share sheet */
    }
  };

  const base =
    "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[0.8125rem] transition-all duration-200 active:scale-[0.97]";

  return (
    <>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          layout === "bar" && "justify-between",
          className,
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => toggle("like")}
            aria-pressed={liked}
            className={cn(
              base,
              liked
                ? "border-accent/45 bg-accent/15 text-accent-soft"
                : "border-white/10 bg-white/[0.03] text-paper-dim hover:border-white/20 hover:text-paper",
            )}
          >
            <Heart
              className={cn("h-4 w-4", liked && "fill-current")}
              strokeWidth={1.75}
            />
            <span className="tabular-nums">{formatCount(likes)}</span>
            <span className="sr-only">likes</span>
          </button>

          <button
            type="button"
            onClick={() => toggle("save")}
            aria-pressed={saved}
            className={cn(
              base,
              saved
                ? "border-accent/45 bg-accent/15 text-accent-soft"
                : "border-white/10 bg-white/[0.03] text-paper-dim hover:border-white/20 hover:text-paper",
            )}
          >
            <Bookmark
              className={cn("h-4 w-4", saved && "fill-current")}
              strokeWidth={1.75}
            />
            <span className="tabular-nums">{formatCount(saves)}</span>
            <span className="sr-only">saves</span>
          </button>

          <button
            type="button"
            onClick={share}
            className={cn(
              base,
              "border-white/10 bg-white/[0.03] text-paper-dim hover:border-white/20 hover:text-paper",
            )}
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-300" strokeWidth={1.75} />
            ) : (
              <Link2 className="h-4 w-4" strokeWidth={1.75} />
            )}
            {copied ? "Copied" : "Share"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-2 text-[0.75rem] text-paper-faint transition-colors hover:text-paper-dim"
        >
          <Flag className="h-3.5 w-3.5" strokeWidth={1.75} />
          Report
        </button>
      </div>

      <ReportDialog
        articleId={articleId}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        isAuthenticated={isAuthenticated}
      />
    </>
  );
}
