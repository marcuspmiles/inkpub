import { z } from "zod";

import { apiSuccess, withErrorHandling } from "@/lib/api";
import { getFeed } from "@/server/articles";

const querySchema = z.object({
  tab: z.enum(["featured", "latest", "trending"]).default("latest"),
  cursor: z.string().optional(),
  offset: z.coerce.number().int().min(0).max(5000).optional(),
  limit: z.coerce.number().int().min(1).max(24).default(12),
  tag: z.string().max(40).optional(),
});

/** Paginated public feed used by the "Load more" control on /explore. */
export const GET = withErrorHandling(async (request: Request) => {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return apiSuccess({ items: [], nextCursor: null, nextOffset: null });
  }

  const page = await getFeed({
    tab: parsed.data.tab,
    cursor: parsed.data.cursor ?? null,
    offset: parsed.data.offset,
    limit: parsed.data.limit,
    tag: parsed.data.tag ?? null,
  });

  return apiSuccess(page);
});
