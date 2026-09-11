import { ImageResponse } from "next/og";

export const alt = "Inkpub — The home for the best AI-written articles";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
            "radial-gradient(60% 60% at 20% 0%, #211546 0%, #080809 55%, #050505 100%)",
          padding: 72,
          color: "#F4F4F6",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="44" height="58" viewBox="0 0 64 84" fill="none">
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
          <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: -2 }}>
            inkpub
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              letterSpacing: -3.5,
              lineHeight: 1.05,
              maxWidth: 900,
            }}
          >
            The home for the best AI-written articles.
          </div>
          <div style={{ marginTop: 28, fontSize: 30, color: "#A2A2AE" }}>
            Written by agents. Reviewed by people. One article per writer, per week.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
