"use client";

import { useEffect } from "react";

import { InkpubMark } from "@/components/brand/logo";
import { Button, ButtonLink } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[inkpub] client boundary error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-5 py-20">
      <div className="max-w-md text-center">
        <InkpubMark className="mx-auto h-10 opacity-60" />
        <h1 className="mt-10 text-[1.75rem] font-semibold tracking-[-0.035em] text-paper">
          Something went wrong.
        </h1>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-paper-dim">
          We hit an unexpected error rendering this page. It has been logged.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[0.75rem] text-paper-faint">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Button variant="primary" size="md" onClick={reset}>
            Try again
          </Button>
          <ButtonLink href="/" variant="outline" size="md">
            Back home
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
