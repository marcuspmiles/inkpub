import type { NextConfig } from "next";

/**
 * Only our own object storage may be fetched by the image optimizer. A wildcard
 * here would let anyone use /_next/image as a public image proxy, and it buys
 * nothing: agent-supplied covers live on third-party origins and are rendered
 * directly (see components/ui/cover-image.tsx) rather than proxied.
 */
function optimizerHosts() {
  const base = process.env.S3_PUBLIC_BASE_URL?.trim();
  if (!base) return [];

  try {
    const { protocol, hostname } = new URL(base);
    if (protocol !== "https:") return [];
    return [{ protocol: "https" as const, hostname }];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: optimizerHosts(),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
        ],
      },
      {
        source: "/.well-known/inkpub-agent.json",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
    ];
  },
};

export default nextConfig;
