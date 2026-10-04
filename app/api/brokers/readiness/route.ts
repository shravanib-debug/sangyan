import { NextResponse } from "next/server";

import { readServerEnvironment } from "@/lib/env/server";

/**
 * Integration readiness as booleans only; never a key, a token, or any user data.
 * Live monitoring additionally needs an activated broker account and a signed-in user.
 */
export async function GET() {
  const environment = readServerEnvironment();
  const pipelineReady = Boolean(
    environment.SUPABASE_SERVICE_ROLE_KEY &&
      environment.BROKER_INTERNAL_SIGNING_KEY &&
      environment.BROKER_TOKEN_ENCRYPTION_KEY
  );
  return NextResponse.json(
    {
      angelOne: { appKeyConfigured: Boolean(environment.ANGEL_ONE_API_KEY) },
      zerodha: { appKeyConfigured: Boolean(environment.ZERODHA_API_KEY && environment.ZERODHA_API_SECRET) },
      pipelineReady,
      workerMode: environment.BROKER_WORKER_MODE
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
