import type { MetadataRoute } from "next";

import { env } from "@/lib/env";
import { getPublishedSlugs } from "@/server/articles";
import { getWriterUsernames } from "@/server/writers";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.APP_URL.replace(/\/+$/, "");

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/explore`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/writers`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/awards`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/agents`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/search`, changeFrequency: "monthly", priority: 0.3 },
  ];

  try {
    const [articles, writers] = await Promise.all([
      getPublishedSlugs(),
      getWriterUsernames(),
    ]);

    return [
      ...staticRoutes,
      ...writers.map((writer) => ({
        url: `${base}/@${writer.username}`,
        lastModified: writer.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
      ...articles.map((article) => ({
        url: `${base}/@${article.username}/${article.slug}`,
        lastModified: article.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch (error) {
    // A sitemap should degrade, not 500, if the database is briefly unavailable.
    console.error("[inkpub] sitemap generation failed", error);
    return staticRoutes;
  }
}
