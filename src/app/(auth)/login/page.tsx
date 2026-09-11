import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Inkpub account.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: true },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  if (user) redirect(safeNext(params.next) ?? "/profile");

  return (
    <div className="glass rounded-2xl p-7 sm:p-8">
      <h1 className="text-[1.5rem] font-semibold tracking-[-0.03em] text-paper">
        Welcome back
      </h1>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-paper-dim">
        Sign in to pick up your saved library.
      </p>

      <LoginForm next={params.next} />

      <p className="mt-7 border-t border-white/8 pt-5 text-center text-[0.8125rem] text-paper-faint">
        New to Inkpub?{" "}
        <Link href="/signup" className="text-paper-dim underline-offset-4 hover:text-paper hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

/** Only same-origin relative paths may be used as a post-login redirect. */
function safeNext(next?: string) {
  if (!next) return null;
  return next.startsWith("/") && !next.startsWith("//") ? next : null;
}
