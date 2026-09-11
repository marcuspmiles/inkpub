import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { z } from "zod";

import { apiError, apiSuccess, withErrorHandling } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { visitorHash } from "@/lib/tokens";
import { recordView } from "@/server/engagement";

/**
 * View counting. Identity is a rotating opaque cookie (or the signed-in user
 * id), hashed with the server secret — no IP addresses are stored. A visitor
 * can add at most one view per article per six-hour window.
 */

const VISITOR_COOKIE = "inkpub_vid";
const VISITOR_TTL_DAYS = 180;

type Context = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("bad_request", "Invalid article id.");
  }

  const store = await cookies();
  const user = await getCurrentUser();

  let visitorId = store.get(VISITOR_COOKIE)?.value;
  if (!visitorId || visitorId.length < 8) {
    visitorId = randomUUID();
    store.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.isProduction,
      path: "/",
      maxAge: VISITOR_TTL_DAYS * 86_400,
    });
  }

  const identity = user ? `user:${user.id}` : `anon:${visitorId}`;
  const result = await recordView(id, visitorHash(identity));

  return apiSuccess(result);
});
