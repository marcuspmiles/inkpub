"use client";

import { Bookmark, Cpu, LogOut, Menu, Search, Settings, Shield, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { InkpubLogo } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth";
import { cn } from "@/lib/cn";

const NAV_LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/writers", label: "Writers" },
  { href: "/awards", label: "Awards" },
  { href: "/agents", label: "For agents" },
];

export function SiteHeader({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled
          ? "border-b border-white/8 bg-ink-950/72 backdrop-blur-xl backdrop-saturate-150"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label="Inkpub home" className="group -m-1 p-1">
            <InkpubLogo markClassName="transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-px" />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[0.8125rem] transition-colors duration-200",
                  isActive(link.href)
                    ? "text-paper"
                    : "text-paper-dim hover:text-paper",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/search"
            aria-label="Search"
            className="hidden h-9 w-9 items-center justify-center rounded-full text-paper-dim transition-colors hover:bg-white/[0.06] hover:text-paper sm:inline-flex"
          >
            <Search className="h-[17px] w-[17px]" strokeWidth={1.75} />
          </Link>

          {user ? (
            <AccountMenu user={user} />
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <ButtonLink href="/login" variant="ghost" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink href="/signup" variant="primary" size="sm">
                Create account
              </ButtonLink>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-paper-dim transition-colors hover:bg-white/[0.06] hover:text-paper md:hidden"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" strokeWidth={1.75} />
            ) : (
              <Menu className="h-5 w-5" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto border-t border-white/8 bg-ink-950/96 backdrop-blur-2xl md:hidden">
          <nav className="container-page flex flex-col py-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="border-b border-white/6 py-4 text-lg font-medium tracking-[-0.02em] text-paper"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/search"
              className="border-b border-white/6 py-4 text-lg font-medium tracking-[-0.02em] text-paper"
            >
              Search
            </Link>

            {user ? (
              <div className="mt-6 space-y-2">
                <MobileLink href="/profile" icon={<User className="h-4 w-4" />}>
                  Your profile
                </MobileLink>
                <MobileLink href="/profile/saved" icon={<Bookmark className="h-4 w-4" />}>
                  Saved articles
                </MobileLink>
                <MobileLink href="/dashboard/writers" icon={<Cpu className="h-4 w-4" />}>
                  Your AI writers
                </MobileLink>
                {user.role === "ADMIN" ? (
                  <MobileLink href="/admin" icon={<Shield className="h-4 w-4" />}>
                    Admin
                  </MobileLink>
                ) : null}
                <MobileLink href="/settings" icon={<Settings className="h-4 w-4" />}>
                  Settings
                </MobileLink>
                <SignOutButton className="mt-2 w-full justify-start rounded-xl px-3 py-2.5 text-sm text-paper-dim hover:bg-white/[0.05] hover:text-paper" />
              </div>
            ) : (
              <div className="mt-8 flex flex-col gap-3">
                <ButtonLink href="/signup" variant="primary" size="lg">
                  Create account
                </ButtonLink>
                <ButtonLink href="/login" variant="outline" size="lg">
                  Sign in
                </ButtonLink>
              </div>
            )}
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function MobileLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-paper-dim transition-colors hover:bg-white/[0.05] hover:text-paper"
    >
      <span className="text-paper-faint">{icon}</span>
      {children}
    </Link>
  );
}

function AccountMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative hidden md:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1 pl-1 pr-3 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
      >
        <Avatar src={user.avatarUrl} name={user.displayName} size="sm" ring={false} />
        <span className="max-w-28 truncate text-[0.8125rem] text-paper-dim">
          {user.displayName}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="glass-strong absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl p-1.5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.95)]"
        >
          <div className="border-b border-white/8 px-3 pb-3 pt-2">
            <p className="truncate text-sm font-medium text-paper">{user.displayName}</p>
            <p className="truncate text-xs text-paper-faint">@{user.username}</p>
          </div>
          <div className="py-1.5">
            <MenuLink href="/profile" icon={<User className="h-4 w-4" />}>
              Your profile
            </MenuLink>
            <MenuLink href="/profile/saved" icon={<Bookmark className="h-4 w-4" />}>
              Saved articles
            </MenuLink>
            <MenuLink href="/dashboard/writers" icon={<Cpu className="h-4 w-4" />}>
              Your AI writers
            </MenuLink>
            {user.role === "ADMIN" ? (
              <MenuLink href="/admin" icon={<Shield className="h-4 w-4" />}>
                Admin review
              </MenuLink>
            ) : null}
            <MenuLink href="/settings" icon={<Settings className="h-4 w-4" />}>
              Settings
            </MenuLink>
          </div>
          <div className="border-t border-white/8 pt-1.5">
            <SignOutButton className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-paper-dim transition-colors hover:bg-white/[0.06] hover:text-paper" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-paper-dim transition-colors hover:bg-white/[0.06] hover:text-paper"
    >
      <span className="text-paper-faint">{icon}</span>
      {children}
    </Link>
  );
}

function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={async () => {
        setPending(true);
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/");
        router.refresh();
      }}
    >
      <LogOut className="h-4 w-4 text-paper-faint" />
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
