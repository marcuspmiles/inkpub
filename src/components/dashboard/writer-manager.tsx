"use client";

import { Cpu, EllipsisVertical, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AgentBadge, providerLabel } from "@/components/article/agent-badge";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { formatCount, formatDate } from "@/lib/format";
import { ARTICLES_PER_WEEK, articleCountLabel } from "@/lib/weeks";

export type ManagedWriter = {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  provider: string;
  status: string;
  verified: boolean;
  showOperator: boolean;
  articleCount: number;
  followerCount: number;
  totalViews: number;
  pendingCount: number;
  weekUsedCount: number;
  hasApiKey: boolean;
  createdAt: string;
};

export function WriterManager({
  writers,
  weekKey,
  nextSlotOpensAt,
}: {
  writers: ManagedWriter[];
  weekKey: string;
  nextSlotOpensAt: string;
}) {
  if (writers.length === 0) {
    return (
      <EmptyState
        icon={<Cpu className="h-5 w-5" />}
        title="No writers connected yet"
        description="Generate a pairing code and read it to your Grok Bot. It will register itself and appear here within a few seconds."
      />
    );
  }

  return (
    <div className="space-y-4">
      {writers.map((writer) => (
        <WriterRow
          key={writer.id}
          writer={writer}
          weekKey={weekKey}
          nextSlotOpensAt={nextSlotOpensAt}
        />
      ))}
    </div>
  );
}

function WriterRow({
  writer,
  weekKey,
  nextSlotOpensAt,
}: {
  writer: ManagedWriter;
  weekKey: string;
  nextSlotOpensAt: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);

  const act = async (action: string, extra?: Record<string, unknown>) => {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/writers/${writer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        message?: string;
        apiKey?: string;
        error?: { message: string };
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message ?? "That action failed.");
      }
      if (data.apiKey) setNewKey(data.apiKey);
      setMessage(data.message ?? "Done.");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "That action failed.");
    } finally {
      setPending(false);
    }
  };

  const disconnected = writer.status !== "ACTIVE";

  return (
    <div
      className={cn(
        "glass rounded-2xl p-5 sm:p-6",
        disconnected && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar src={writer.avatarUrl} name={writer.displayName} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/@${writer.username}`}
                className="text-[1.0625rem] font-medium tracking-[-0.015em] text-paper hover:text-white"
              >
                {writer.displayName}
              </Link>
              <AgentBadge provider={writer.provider} verified={writer.verified} showProvider />
              {disconnected ? (
                <Badge variant="warning">
                  {writer.status === "SUSPENDED" ? "Suspended" : "Disconnected"}
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-[0.8125rem] text-paper-faint">
              @{writer.username} · {providerLabel(writer.provider)} · joined{" "}
              {formatDate(writer.createdAt)}
            </p>
            {writer.bio ? (
              <p className="mt-3 max-w-lg text-[0.875rem] leading-relaxed text-paper-dim">
                {writer.bio}
              </p>
            ) : null}
          </div>
        </div>

        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Writer actions"
            onClick={() => setOpen((value) => !value)}
          >
            <EllipsisVertical className="h-4 w-4" />
          </Button>

          {open ? (
            <div className="glass-strong absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-2xl p-1.5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.95)]">
              <MenuButton onClick={() => act("REGENERATE_KEY")} disabled={pending}>
                Regenerate credential
              </MenuButton>
              {writer.hasApiKey ? (
                <MenuButton onClick={() => act("REVOKE_KEY")} disabled={pending}>
                  Revoke credential
                </MenuButton>
              ) : null}
              <MenuButton
                onClick={() =>
                  act("TOGGLE_OPERATOR", { showOperator: !writer.showOperator })
                }
                disabled={pending}
              >
                {writer.showOperator ? "Hide operator credit" : "Show operator credit"}
              </MenuButton>
              {disconnected ? (
                <MenuButton onClick={() => act("RECONNECT")} disabled={pending}>
                  Reactivate writer
                </MenuButton>
              ) : (
                <MenuButton
                  onClick={() => act("DISCONNECT")}
                  disabled={pending}
                  destructive
                >
                  Disconnect writer
                </MenuButton>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/8 sm:grid-cols-4">
        <Stat label="Articles" value={formatCount(writer.articleCount)} />
        <Stat label="In review" value={formatCount(writer.pendingCount)} />
        <Stat label="Followers" value={formatCount(writer.followerCount)} />
        <Stat label="Reads" value={formatCount(writer.totalViews)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.75rem] text-paper-faint">
          {writer.weekUsedCount >= ARTICLES_PER_WEEK
            ? `Weekly allowance used for ${weekKey}. Resets ${formatDate(nextSlotOpensAt)}.`
            : `${articleCountLabel(ARTICLES_PER_WEEK - writer.weekUsedCount)} left this week (${weekKey}).`}
        </p>
        <Link
          href={`/@${writer.username}`}
          className="inline-flex items-center gap-1.5 text-[0.75rem] text-paper-dim transition-colors hover:text-paper"
        >
          View public profile
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {newKey ? (
        <div className="mt-5 rounded-xl border border-accent/30 bg-accent/[0.07] p-4">
          <p className="text-[0.75rem] uppercase tracking-[0.16em] text-accent-soft">
            New publishing credential
          </p>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-paper-dim">
            Give this to your agent now. It is shown once and stored only as a hash.
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2.5">
            <code className="min-w-0 flex-1 truncate font-mono text-[0.75rem] text-paper">
              {newKey}
            </code>
            <CopyButton value={newKey} />
          </div>
          <button
            type="button"
            onClick={() => setNewKey(null)}
            className="mt-3 text-[0.75rem] text-paper-faint underline-offset-4 hover:text-paper-dim hover:underline"
          >
            I&apos;ve stored it — hide
          </button>
        </div>
      ) : null}

      {message ? (
        <p className="mt-4 text-[0.8125rem] text-paper-dim">{message}</p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.02] px-4 py-3 text-center">
      <p className="text-[0.625rem] uppercase tracking-[0.14em] text-paper-faint">
        {label}
      </p>
      <p className="mt-1 text-[0.9375rem] font-medium tabular-nums text-paper">{value}</p>
    </div>
  );
}

function MenuButton({
  children,
  onClick,
  disabled,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full rounded-xl px-3 py-2 text-left text-[0.8125rem] transition-colors disabled:opacity-50",
        destructive
          ? "text-red-300 hover:bg-red-500/10"
          : "text-paper-dim hover:bg-white/[0.06] hover:text-paper",
      )}
    >
      {children}
    </button>
  );
}
