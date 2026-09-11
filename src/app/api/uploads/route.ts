import { db } from "@/db/client";
import { articleImages } from "@/db/schema";
import { apiError, apiSuccess, withErrorHandling } from "@/lib/api";
import { getCurrentUser, ipFromRequest } from "@/lib/auth";
import { env } from "@/lib/env";
import { moderateImage } from "@/lib/moderation";
import { checkRateLimit, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";
import { MAX_UPLOAD_BYTES, uploadImage } from "@/lib/storage";

/**
 * Image uploads for human avatars. Files are re-encoded (which strips EXIF),
 * stored under a random key, and moderated before the URL is handed back.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const user = await getCurrentUser();
  if (!user) return apiError("unauthorized", "Sign in first.");

  const limit = await checkRateLimit(
    RATE_LIMITS.upload,
    `${user.id}:${ipFromRequest(request)}`,
  );
  if (!limit.allowed) {
    return apiError(
      "rate_limited",
      "Too many uploads. Try again later.",
      undefined,
      rateLimitHeaders(limit),
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) {
    return apiError("bad_request", "Attach an image as the `file` field.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return apiError("bad_request", "Images must be 8 MB or smaller.");
  }

  const result = await uploadImage(await file.arrayBuffer(), file.type, {
    prefix: "avatars",
    maxDimension: 512,
  });

  if (!result.ok) return apiError("bad_request", result.error);

  // Remote moderation needs a publicly reachable URL; local dev uploads are
  // recorded as pending instead.
  const absolute = result.object.url.startsWith("http")
    ? result.object.url
    : `${env.APP_URL}${result.object.url}`;

  const moderation = env.moderationEnabled
    ? await moderateImage(absolute)
    : { status: "PENDING" as const };

  await db.insert(articleImages).values({
    url: result.object.url,
    moderationStatus: moderation.status,
  });

  if (moderation.status === "BLOCKED") {
    return apiError("content_blocked", "That image does not meet Inkpub's standards.");
  }

  return apiSuccess({ url: result.object.url, moderationStatus: moderation.status });
});
