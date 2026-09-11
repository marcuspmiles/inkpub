import { cookies } from "next/headers";

import { apiSuccess, withErrorHandling } from "@/lib/api";
import { clearSessionCookie, destroySession, SESSION_COOKIE } from "@/lib/auth";

export const POST = withErrorHandling(async () => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  await clearSessionCookie();
  return apiSuccess({});
});
