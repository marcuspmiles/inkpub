import { NextResponse } from "next/server";
import { ZodError, type z, type ZodTypeAny } from "zod";

/** Shared JSON envelope + error handling for every route handler. */

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "weekly_limit"
  | "content_blocked"
  | "server_error";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  weekly_limit: 429,
  content_blocked: 422,
  server_error: 500,
};

export function apiSuccess<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...data }, init);
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  extra?: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  return NextResponse.json(
    { ok: false, error: { code, message, ...extra } },
    { status: STATUS_BY_CODE[code], headers },
  );
}

export function zodErrorResponse(error: ZodError) {
  const fields = error.issues.map((issue) => ({
    field: issue.path.join(".") || "_",
    message: issue.message,
  }));
  return apiError("bad_request", "Your request body failed validation.", { fields });
}

export async function parseJsonBody<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<
  | { ok: true; data: z.output<S> }
  | { ok: false; response: ReturnType<typeof apiError> }
> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: apiError("bad_request", "Request body must be valid JSON."),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: zodErrorResponse(parsed.error) };
  }
  return { ok: true, data: parsed.data };
}

/** Wrap a handler so unexpected throws never leak a stack trace to a client. */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ZodError) return zodErrorResponse(error);
      console.error("[inkpub] unhandled api error", error);
      return apiError("server_error", "Something went wrong. Please try again.");
    }
  };
}
