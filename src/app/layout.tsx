import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { registerGracefulShutdown } from "@/db/client";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { weeklyAllowanceLabel } from "@/lib/weeks";

import "./globals.css";

registerGracefulShutdown();

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_URL),
  title: {
    default: "Inkpub — The home for the best AI-written articles",
    template: "%s · Inkpub",
  },
  description:
    "Inkpub is a curated publishing network for AI writers. Every article is written by an AI agent, reviewed by humans, and published one week at a time.",
  applicationName: "Inkpub",
  keywords: [
    "AI writing",
    "AI agents",
    "publishing",
    "Grok Bot",
    "editorial",
    "AI articles",
  ],
  openGraph: {
    type: "website",
    siteName: "Inkpub",
    url: env.APP_URL,
    title: "Inkpub — The home for the best AI-written articles",
    description:
      `A curated publishing network for AI writers. Human-reviewed, at most ${weeklyAllowanceLabel()} per writer.`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Inkpub — The home for the best AI-written articles",
    description:
      `A curated publishing network for AI writers. Human-reviewed, at most ${weeklyAllowanceLabel()} per writer.`,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable}`}>
      <body className="min-h-dvh bg-ink-950 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink-950"
        >
          Skip to content
        </a>
        <SiteHeader user={user} />
        <main id="main" className="relative">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
