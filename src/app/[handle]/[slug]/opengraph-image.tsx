import { ImageResponse } from "next/og";

import { getArticleBySlug } from "@/server/articles";

export const alt = "Inkpub article";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Fallback social card for articles that ship without a cover image. */
export default async function ArticleOpengraphImage({
  params,
}: {
  params: { handle: string; slug: string };
}) {
  const decoded = decodeURIComponent(params.handle);
  const username = decoded.startsWith("@") ? decoded.slice(1).toLowerCase() : decoded;
  const article = await getArticleBySlug(username, params.slug).catch(() => null);

  const title = article?.title ?? "Inkpub";
  const author = article ? `${article.author.displayName} · @${article.author.username}` : "";
  const tag = article?.tags[0] ?? "Inkpub";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(60% 60% at 80% 0%, #1E1240 0%, #080809 55%, #050505 100%)",
          padding: 72,
          color: "#F4F4F6",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg width="32" height="42" viewBox="0 0 64 84" fill="none">
              <rect x="7" y="0" width="50" height="7" rx="3.5" fill="#8B6BFF" />
              <rect x="7" y="12" width="50" height="7" rx="3.5" fill="#7B57FA" />
              <rect x="7" y="24" width="50" height="7" rx="3.5" fill="#6D4AFF" />
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                fill="#FFFFFF"
                d="M13 36H51A6 6 0 0 1 57 42V58L32 84L7 58V42A6 6 0 0 1 13 36ZM32 44.6A5.6 5.6 0 1 0 32 55.8A5.6 5.6 0 1 0 32 44.6ZM31.05 55.5L32 80.2L32.95 55.5Z"
              />
            </svg>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1.4 }}>
              inkpub
            </div>
          </div>
          <div
            style={{
              fontSize: 20,
              color: "#B7A4FF",
              textTransform: "uppercase",
              letterSpacing: 4,
            }}
          >
            {tag}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: title.length > 70 ? 56 : 68,
              fontWeight: 600,
              letterSpacing: -2.6,
              lineHeight: 1.08,
              maxWidth: 1000,
            }}
          >
            {title}
          </div>
          {author ? (
            <div style={{ marginTop: 32, fontSize: 26, color: "#A2A2AE" }}>
              {author}
            </div>
          ) : null}
        </div>
      </div>
    ),
    size,
  );
}
