import { apiError, apiSuccess, parseJsonBody, withErrorHandling } from "@/lib/api";
import { AuthError, requireAdmin } from "@/lib/auth";
import { adminAwardSchema } from "@/lib/validation";
import { grantAward } from "@/server/admin";

export const POST = withErrorHandling(async (request: Request) => {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      return error.code === "UNAUTHENTICATED"
        ? apiError("unauthorized", "Sign in as an editor.")
        : apiError("forbidden", "You do not have editor access.");
    }
    throw error;
  }

  const body = await parseJsonBody(request, adminAwardSchema);
  if (!body.ok) return body.response;

  const award = await grantAward({
    articleId: body.data.articleId,
    placement: body.data.placement,
    weekStart: body.data.weekStart,
    prizeAmountCents: body.data.prizeAmountCents,
    payoutStatus: body.data.payoutStatus,
    payoutNote: body.data.payoutNote || null,
  });

  if (!award) return apiError("not_found", "Article not found.");

  return apiSuccess({ message: "Award recorded.", awardId: award.id });
});
