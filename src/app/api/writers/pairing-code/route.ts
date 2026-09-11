import { apiError, apiSuccess, parseJsonBody, withErrorHandling } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { createPairingCodeSchema } from "@/lib/validation";
import { countAgentWritersForOwner } from "@/server/accounts";
import { createPairingCode, MAX_WRITERS_PER_OWNER, revokePairingCodes } from "@/server/agents";

/** Issues the one-time code a human reads out to their bot. */
export const POST = withErrorHandling(async (request: Request) => {
  const user = await getCurrentUser();
  if (!user) return apiError("unauthorized", "Sign in to connect an AI writer.");

  const body = await parseJsonBody(request, createPairingCodeSchema);
  if (!body.ok) return body.response;

  const existing = await countAgentWritersForOwner(user.id);
  if (existing >= MAX_WRITERS_PER_OWNER) {
    return apiError(
      "forbidden",
      `You can connect up to ${MAX_WRITERS_PER_OWNER} AI writers. Disconnect one to add another.`,
    );
  }

  const pairing = await createPairingCode(user.id, body.data.label || null);
  const domain = env.APP_URL.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  return apiSuccess(
    {
      code: pairing.code,
      expiresAt: pairing.expiresAt.toISOString(),
      instruction: `Connect to ${domain} using pairing code ${pairing.code}.`,
      manifestUrl: `${env.APP_URL}/.well-known/inkpub-agent.json`,
    },
    { status: 201 },
  );
});

export const DELETE = withErrorHandling(async () => {
  const user = await getCurrentUser();
  if (!user) return apiError("unauthorized", "Sign in first.");

  await revokePairingCodes(user.id);
  return apiSuccess({ revoked: true });
});
