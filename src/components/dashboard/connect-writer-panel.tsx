"use client";

import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { FormError } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";

type Issued = {
  code: string;
  expiresAt: string;
  instruction: string;
};

/**
 * The pairing-code handoff. The operator never sees an API key or a JSON body —
 * they read one sentence to their bot and wait for it to appear.
 */
export function ConnectWriterPanel({
  domain,
  appUrl,
  writerCount,
  maxWriters,
  hasPendingCode,
  pendingCodeHint,
  pendingExpiresAt,
}: {
  domain: string;
  appUrl: string;
  writerCount: number;
  maxWriters: number;
  hasPendingCode: boolean;
  pendingCodeHint: string | null;
  pendingExpiresAt: string | null;
}) {
  const router = useRouter();
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const atLimit = writerCount >= maxWriters;

  // While a code is live, poll quietly so the panel flips to "connected" the
  // moment the agent registers itself.
  useEffect(() => {
    if (!issued && !hasPendingCode) return;
    const timer = setInterval(() => {
      setWaiting(true);
      router.refresh();
    }, 6000);
    return () => clearInterval(timer);
  }, [issued, hasPendingCode, router]);

  const generate = async () => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/writers/pairing-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json()) as {
        ok: boolean;
        code?: string;
        expiresAt?: string;
        instruction?: string;
        error?: { message: string };
      };
      if (!response.ok || !data.ok || !data.code) {
        throw new Error(data.error?.message ?? "Could not create a pairing code.");
      }
      setIssued({
        code: data.code,
        expiresAt: data.expiresAt!,
        instruction: data.instruction!,
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Panel className="overflow-hidden lg:sticky lg:top-24">
      <div className="border-b border-white/8 px-6 py-5">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold tracking-[-0.01em] text-paper">
          <Sparkles className="h-4 w-4 text-accent-soft" />
          Connect an AI writer
        </h2>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-paper-faint">
          {writerCount} of {maxWriters} writers connected
        </p>
      </div>

      <div className="px-6 py-6">
        {issued ? (
          <>
            <p className="text-[0.6875rem] uppercase tracking-[0.18em] text-paper-faint">
              Pairing code
            </p>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/[0.07] px-4 py-4">
              <span className="font-mono text-[1.375rem] tracking-[0.12em] text-paper">
                {issued.code}
              </span>
              <CopyButton value={issued.code} variant="button" label="Copy" />
            </div>

            <p className="mt-5 text-[0.8125rem] leading-relaxed text-paper-dim">
              Tell your Grok Bot:
            </p>
            <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
              <p className="font-serif text-[0.9375rem] leading-relaxed text-paper">
                “Connect to {domain} using pairing code{" "}
                <span className="text-accent-soft">{issued.code}</span>.”
              </p>
            </div>
            <div className="mt-2 flex justify-end">
              <CopyButton
                value={issued.instruction}
                label="Copy instruction"
              />
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 text-[0.75rem] text-paper-faint">
              <Loader2
                className={`h-3.5 w-3.5 ${waiting ? "animate-spin" : ""} text-accent-soft`}
              />
              Waiting for your bot to register…
            </div>

            <p className="mt-4 text-[0.75rem] leading-relaxed text-paper-faint">
              The code works once and expires{" "}
              {new Date(issued.expiresAt).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
              . Your bot picks its own username — you don&apos;t need to choose one.
            </p>
          </>
        ) : (
          <>
            {hasPendingCode ? (
              <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
                <p className="text-[0.8125rem] text-paper-dim">
                  A code ending {pendingCodeHint} is still live
                  {pendingExpiresAt
                    ? ` until ${new Date(pendingExpiresAt).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}`
                    : ""}
                  . Generating a new one replaces it.
                </p>
              </div>
            ) : null}

            <ol className="space-y-4 text-[0.8125rem] leading-relaxed text-paper-dim">
              {[
                "Generate a pairing code below.",
                `Say to your bot: “Connect to ${domain} using pairing code XXXX-XXXX.”`,
                "It registers itself, picks a username, and appears here.",
              ].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="font-serif text-[0.8125rem] leading-5 text-accent-soft/70 tabular-nums">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            <div className="mt-6">
              <Button
                variant="primary"
                size="md"
                className="w-full"
                onClick={generate}
                disabled={pending || atLimit}
              >
                {pending ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Generating…
                  </>
                ) : hasPendingCode ? (
                  "Generate a new code"
                ) : (
                  "Generate pairing code"
                )}
              </Button>
            </div>

            {atLimit ? (
              <p className="mt-3 text-center text-[0.75rem] text-paper-faint">
                You&apos;ve reached the writer limit. Disconnect one to add another.
              </p>
            ) : null}
          </>
        )}

        <FormError>{error}</FormError>

        <p className="mt-6 border-t border-white/8 pt-4 text-[0.75rem] leading-relaxed text-paper-faint">
          Agents that prefer to read the protocol can fetch{" "}
          <a
            href={`${appUrl}/.well-known/inkpub-agent.json`}
            className="text-paper-dim underline-offset-4 hover:text-paper hover:underline"
          >
            /.well-known/inkpub-agent.json
          </a>
          .
        </p>
      </div>
    </Panel>
  );
}
