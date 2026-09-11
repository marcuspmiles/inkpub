import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

/**
 * Generates the placeholder artwork used by seed content, so a fresh install
 * has a full-looking homepage without depending on any external image host.
 *
 * Run with: npm run art:generate
 */

const OUT = path.join(process.cwd(), "public", "seed");

/**
 * Muted, purple-leaning palettes. Covers sit behind white type on a near-black
 * page, so every one of these stays dark enough to read against.
 */
type Palette = { tint: string; accent: string };

const PALETTES: Palette[] = [
  { tint: "#171034", accent: "#6D4AFF" },
  { tint: "#0F1A30", accent: "#5C7CFF" },
  { tint: "#1E1033", accent: "#9B5CFF" },
  { tint: "#0D1E24", accent: "#3FB6C4" },
  { tint: "#231433", accent: "#B14BD8" },
  { tint: "#121232", accent: "#7A6BFF" },
  { tint: "#26161E", accent: "#E0664F" },
  { tint: "#101F1C", accent: "#3FC48F" },
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Deterministic pseudo-random generator so regenerating art is stable. */
function rng(seed: number) {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

/**
 * Covers are built from one motif — a family of thin concentric arcs swept by a
 * single off-canvas light source — so the whole feed reads as one publication
 * rather than eight unrelated stock gradients.
 */
function coverSvg(seed: string, width = 1600, height = 1000): string {
  const hash = hashString(seed);
  const palette = PALETTES[hash % PALETTES.length]!;
  const random = rng(hash);

  // Light source, usually just off one edge.
  const originX = width * (random() < 0.5 ? -0.15 - random() * 0.2 : 1.15 + random() * 0.2);
  const originY = height * (0.1 + random() * 0.8);
  const glowX = (originX / width).toFixed(3);
  const glowY = (originY / height).toFixed(3);

  const arcCount = 12 + Math.floor(random() * 6);
  const step = height * (0.16 + random() * 0.1);
  const baseRadius = height * (0.35 + random() * 0.3);

  const arcs = Array.from({ length: arcCount }, (_, index) => {
    const r = baseRadius + index * step;
    const opacity = 0.55 * Math.pow(0.9, index) + 0.04;
    return `<circle cx="${originX.toFixed(0)}" cy="${originY.toFixed(0)}" r="${r.toFixed(0)}" fill="none" stroke="url(#arc)" stroke-opacity="${opacity.toFixed(3)}" stroke-width="${(1.1 + random() * 0.9).toFixed(2)}"/>`;
  }).join("\n  ");

  // A few brighter chords that cut across the arcs and give the eye an anchor.
  const chordAngle = -18 + random() * 36;
  const chords = Array.from({ length: 3 }, (_, index) => {
    const y = height * (0.24 + random() * 0.52);
    const w = width * (0.3 + random() * 0.55);
    const x = width * random() * 0.5;
    return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${(1.5 + index * 0.8).toFixed(1)}" fill="${palette.accent}" fill-opacity="${(0.4 - index * 0.1).toFixed(3)}"/>`;
  }).join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="${palette.tint}"/>
      <stop offset="0.78" stop-color="#0A0A0F"/>
      <stop offset="1" stop-color="#050505"/>
    </linearGradient>
    <radialGradient id="glow" cx="${glowX}" cy="${glowY}" r="0.95">
      <stop offset="0" stop-color="${palette.accent}" stop-opacity="0.75"/>
      <stop offset="0.4" stop-color="${palette.accent}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${palette.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="arc" x1="0" y1="0" x2="1" y2="0.4">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.5"/>
      <stop offset="0.45" stop-color="${palette.accent}"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.75"/>
    </linearGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.45" r="0.8">
      <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.4"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <g transform="rotate(${chordAngle.toFixed(2)} ${width / 2} ${height / 2})">
  ${chords}
  </g>
  ${arcs}
  <rect width="${width}" height="${height}" fill="url(#vignette)"/>
</svg>`;
}

/** A symmetric five-column sigil: legible at 32px, still interesting at 320px. */
function avatarSvg(seed: string, size = 320): string {
  const hash = hashString(seed);
  const palette = PALETTES[(hash >>> 3) % PALETTES.length]!;
  const random = rng(hash + 7);

  const cells = 5;
  const inset = size * 0.18;
  const cell = (size - inset * 2) / cells;
  const dot = cell * 0.66;
  const gap = (cell - dot) / 2;

  // Build the left half plus the centre column, then mirror, so the sigil is
  // always symmetric regardless of how the generator consumed randomness.
  const half = Math.ceil(cells / 2);
  const grid: number[][] = Array.from({ length: cells }, () =>
    Array.from({ length: half }, () => (random() < 0.55 ? 0.35 + random() * 0.6 : 0)),
  );

  let dots = "";
  for (let row = 0; row < cells; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      const value = grid[row]![column < half ? column : cells - 1 - column]!;
      if (!value) continue;
      const x = inset + column * cell + gap;
      const y = inset + row * cell + gap;
      dots += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${dot.toFixed(1)}" height="${dot.toFixed(1)}" rx="${(dot * 0.32).toFixed(1)}" fill="${palette.accent}" fill-opacity="${value.toFixed(2)}"/>\n  `;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${palette.tint}"/>
      <stop offset="1" stop-color="#08080B"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  ${dots}
</svg>`;
}

export async function generateCover(seed: string, file: string) {
  await sharp(Buffer.from(coverSvg(seed)))
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(file);
}

export async function generateAvatar(seed: string, file: string) {
  await sharp(Buffer.from(avatarSvg(seed)))
    .png({ compressionLevel: 9 })
    .toFile(file);
}

export const ART = {
  coverPath: (name: string) => `/seed/covers/${name}.jpg`,
  avatarPath: (name: string) => `/seed/avatars/${name}.png`,
};

async function main() {
  const { SEED_WRITERS, SEED_ARTICLES } = await import("./seed-data");

  await mkdir(path.join(OUT, "covers"), { recursive: true });
  await mkdir(path.join(OUT, "avatars"), { recursive: true });

  for (const writer of SEED_WRITERS) {
    await generateAvatar(
      `${writer.username}-avatar`,
      path.join(OUT, "avatars", `${writer.username}.png`),
    );
  }

  for (const article of SEED_ARTICLES) {
    await generateCover(
      `${article.slug}-cover`,
      path.join(OUT, "covers", `${article.slug}.jpg`),
    );
  }

  await writeFile(
    path.join(OUT, "README.md"),
    "Generated placeholder artwork for seed content.\n\n" +
      "Regenerate with `npm run art:generate`. These files are demo assets only.\n",
  );

  console.log(
    `[inkpub] generated ${SEED_WRITERS.length} avatars and ${SEED_ARTICLES.length} covers in public/seed`,
  );
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
