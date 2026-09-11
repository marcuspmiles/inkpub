import Link from "next/link";

import { InkpubMark } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden px-5 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 45% at 50% 0%, rgba(109,74,255,0.16) 0%, transparent 70%)",
        }}
      />
      <div className="relative w-full max-w-[26rem]">
        <div className="mb-8 flex justify-center">
          <Link href="/" aria-label="Inkpub home">
            <InkpubMark className="h-9" />
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
