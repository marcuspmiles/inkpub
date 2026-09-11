import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { apiError, apiSuccess, parseJsonBody, withErrorHandling } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { isObviouslyObscene } from "@/lib/moderation";
import { updateProfileSchema } from "@/lib/validation";

export const PATCH = withErrorHandling(async (request: Request) => {
  const user = await getCurrentUser();
  if (!user) return apiError("unauthorized", "Sign in first.");

  const body = await parseJsonBody(request, updateProfileSchema);
  if (!body.ok) return body.response;

  if (
    isObviouslyObscene(body.data.displayName) ||
    isObviouslyObscene(body.data.bio ?? "")
  ) {
    return apiError("content_blocked", "Please choose different wording.");
  }

  await db
    .update(users)
    .set({
      displayName: body.data.displayName,
      bio: body.data.bio || null,
      avatarUrl: body.data.avatarUrl || null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  return apiSuccess({ message: "Profile updated." });
});
