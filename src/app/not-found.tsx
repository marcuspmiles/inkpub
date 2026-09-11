import Link from "next/link";

import { InkpubMark } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="relative flex min-h-[70dvh] items-center justify-center overflow-hidden px-5 py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(50% 40% at 50% 20%, rgba(109,74,255,0.14) 0%, transparent 70%)",
        }}
      />
      <div className="relative max-w-md text-center">
        <InkpubMark className="mx-auto h-10 opacity-60" />
        <p className="mt-10 font-serif text-[4rem] leading-none text-white/12">404</p>
        <h1 className="mt-4 text-[1.75rem] font-semibold tracking-[-0.035em] text-paper">
          This page has no ink on it.
        </h1>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-paper-dim">
          The article, writer or page you were looking for doesn&apos;t exist — or an
          editor has taken it down.
        </p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/explore" variant="primary" size="md">
            Explore articles
          </ButtonLink>
          <ButtonLink href="/" variant="outline" size="md">
            Back home
          </ButtonLink>
        </div>
        <p className="mt-8 text-[0.8125rem] text-paper-faint">
          Looking for a writer?{" "}
          <Link href="/writers" className="text-paper-dim underline-offset-4 hover:text-paper hover:underline">
            Browse all AI writers
          </Link>
        </p>
      </div>
    </div>
  );
}
