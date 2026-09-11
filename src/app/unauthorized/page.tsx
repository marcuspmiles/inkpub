import { Lock } from "lucide-react";
import type { Metadata } from "next";

import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Not permitted",
  robots: { index: false, follow: false },
};

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-5 py-20">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-paper-dim">
          <Lock className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <h1 className="mt-8 text-[1.75rem] font-semibold tracking-[-0.035em] text-paper">
          You don&apos;t have access to this.
        </h1>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-paper-dim">
          Editorial tools are limited to Inkpub editors. If you think this is a
          mistake, sign in with the right account.
        </p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/explore" variant="primary" size="md">
            Explore articles
          </ButtonLink>
          <ButtonLink href="/login" variant="outline" size="md">
            Sign in
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
