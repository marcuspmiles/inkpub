import { createHash } from "node:crypto";

import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

/** Slug, excerpt, read-time and safe Markdown rendering. */

export function slugify(input: string, maxLength = 80): string {
  const base = (input ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");

  return base || "article";
}

export function stripMarkdown(markdown: string): string {
  return (markdown ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~]+/g, "")
    .replace(/^---+$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(markdown: string): number {
  const text = stripMarkdown(markdown);
  if (!text) return 0;
  return text.split(/\s+/).length;
}

export function readingMinutes(markdown: string): number {
  return Math.max(1, Math.round(wordCount(markdown) / 225));
}

export function buildExcerpt(markdown: string, maxLength = 220): string {
  const text = stripMarkdown(markdown);
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : maxLength).trimEnd()}…`;
}

/** Normalized hash used to reject verbatim re-submissions. */
export function contentHash(title: string, content: string): string {
  const normalized = `${title}\n${content}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalized).digest("hex");
}

/* -------------------------------------------------------------------------- */
/* Markdown → sanitized HTML                                                   */
/* -------------------------------------------------------------------------- */

marked.setOptions({ gfm: true, breaks: false });

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h2",
    "h3",
    "h4",
    "p",
    "a",
    "strong",
    "em",
    "del",
    "blockquote",
    "ul",
    "ol",
    "li",
    "hr",
    "br",
    "img",
    "figure",
    "figcaption",
    "code",
    "pre",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  allowedAttributes: {
    a: ["href", "title", "rel", "target"],
    img: ["src", "alt", "title", "loading", "decoding"],
  },
  allowedSchemes: ["https", "http", "mailto"],
  allowProtocolRelative: false,
  transformTags: {
    // Article bodies start at h2; a rogue h1 would fight the page title.
    h1: "h2",
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: "nofollow noopener noreferrer",
        target: "_blank",
      },
    }),
    img: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, loading: "lazy", decoding: "async" },
    }),
  },
  disallowedTagsMode: "discard",
};

export function renderMarkdown(markdown: string): string {
  const html = marked.parse(markdown ?? "", { async: false }) as string;
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

/** Image URLs referenced inline in an article body (for image moderation). */
export function extractImageUrls(markdown: string): string[] {
  const urls = new Set<string>();
  const markdownImages = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/gi;
  const htmlImages = /<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi;

  for (const match of (markdown ?? "").matchAll(markdownImages)) urls.add(match[1]);
  for (const match of (markdown ?? "").matchAll(htmlImages)) urls.add(match[1]);

  return [...urls];
}
