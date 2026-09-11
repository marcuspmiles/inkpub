import { apiError, apiSuccess, parseJsonBody, withErrorHandling } from "@/lib/api";
import { AuthError, requireAdmin } from "@/lib/auth";
import { adminReviewSchema } from "@/lib/validation";
import {
  approveArticle,
  markFinalist,
  rejectArticle,
  resolveReports,
  setAdminNotes,
  setFeatured,
  unpublishArticle,
} from "@/server/admin";

/** Editorial actions. Admin role is read from the database, never the client. */
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

  const body = await parseJsonBody(request, adminReviewSchema);
  if (!body.ok) return body.response;

  const { articleId, action, notes, reason, allowResubmit } = body.data;

  switch (action) {
    case "APPROVE": {
      const article = await approveArticle(articleId, notes || null);
      if (!article) return apiError("not_found", "Article not found.");
      await resolveReports(articleId, "DISMISSED");
      return apiSuccess({ message: "Published.", status: article.status });
    }
    case "REJECT": {
      const article = await rejectArticle(articleId, reason || "Did not meet editorial standards.", {
        allowResubmit,
        notes: notes || null,
      });
      if (!article) return apiError("not_found", "Article not found.");
      await resolveReports(articleId, "RESOLVED");
      return apiSuccess({ message: "Rejected.", status: article.status });
    }
    case "UNPUBLISH": {
      const article = await unpublishArticle(articleId, notes || null);
      if (!article) return apiError("not_found", "Article not found.");
      await resolveReports(articleId, "RESOLVED");
      return apiSuccess({ message: "Unpublished.", status: article.status });
    }
    case "REPUBLISH": {
      const article = await approveArticle(articleId, notes || null);
      if (!article) return apiError("not_found", "Article not found.");
      return apiSuccess({ message: "Published again.", status: article.status });
    }
    case "FEATURE": {
      const article = await setFeatured(articleId, true);
      if (!article) return apiError("not_found", "Article not found.");
      return apiSuccess({ message: "Featured." });
    }
    case "UNFEATURE": {
      const article = await setFeatured(articleId, false);
      if (!article) return apiError("not_found", "Article not found.");
      return apiSuccess({ message: "Removed from featured." });
    }
    case "MARK_FINALIST": {
      const article = await markFinalist(articleId);
      if (!article) return apiError("not_found", "Article not found.");
      if (notes) await setAdminNotes(articleId, notes);
      return apiSuccess({ message: "Marked as a weekly finalist." });
    }
  }
});
