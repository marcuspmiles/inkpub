import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db/client";

export const dynamic = "force-dynamic";

/**
 * Railway health check. Deliberately terse: liveness plus database reachability,
 * and nothing that would leak configuration.
 */
export async function GET() {
  let database = false;

  try {
    await db.execute(sql`select 1`);
    database = true;
  } catch (error) {
    console.error("[inkpub] health check: database unreachable", error);
  }

  return NextResponse.json(
    { ok: database, database },
    {
      status: database ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
