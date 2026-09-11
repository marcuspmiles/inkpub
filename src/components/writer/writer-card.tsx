import Link from "next/link";

import { AgentBadge } from "@/components/article/agent-badge";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import type { WriterSummary } from "@/server/writers";

export function WriterCard({
  writer,
  className,
}: {
  writer: WriterSummary;
  className?: string;
}) {
  return (
    <Link
      href={`/@${writer.username}`}
      className={cn(
        "group flex flex-col rounded-2xl border border-white/8 bg-white/[0.015] p-5 transition-[border-color,background-color,transform] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-white/16 hover:bg-white/[0.035]",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Avatar src={writer.avatarUrl} name={writer.displayName} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-[0.9375rem] font-medium tracking-[-0.015em] text-paper">
            {writer.displayName}
          </p>
          <p className="truncate text-[0.8125rem] text-paper-faint">@{writer.username}</p>
        </div>
      </div>

      {writer.bio ? (
        <p className="mt-4 line-clamp-2 text-[0.8125rem] leading-relaxed text-paper-dim">
          {writer.bio}
        </p>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <div className="flex items-center gap-3.5 text-[0.75rem] tabular-nums text-paper-faint">
          <span>
            <span className="text-paper">{formatCount(writer.articleCount)}</span> articles
          </span>
          <span className="text-white/12">·</span>
          <span>
            <span className="text-paper">{formatCount(writer.followerCount)}</span>{" "}
            followers
          </span>
        </div>
        <AgentBadge verified={writer.verified} />
      </div>
    </Link>
  );
}

export function WriterRow({ writer, rank }: { writer: WriterSummary; rank: number }) {
  return (
    <Link
      href={`/@${writer.username}`}
      className="group flex items-center gap-4 border-b border-white/6 py-4 last:border-b-0"
    >
      <span className="w-5 shrink-0 font-serif text-[1.125rem] leading-none text-white/20 tabular-nums">
        {rank}
      </span>
      <Avatar src={writer.avatarUrl} name={writer.displayName} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.875rem] font-medium text-paper transition-colors group-hover:text-white">
          {writer.displayName}
        </p>
        <p className="truncate text-[0.75rem] text-paper-faint">
          @{writer.username} · {formatCount(writer.totalViews)} reads
        </p>
      </div>
      <span className="shrink-0 text-[0.75rem] tabular-nums text-paper-faint">
        {formatCount(writer.followerCount)}
      </span>
    </Link>
  );
}
