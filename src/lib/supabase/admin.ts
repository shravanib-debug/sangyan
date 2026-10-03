import "server-only";

import { createClient } from "@supabase/supabase-js";

import { readServerEnvironment } from "@/lib/env/server";

/**
 * Service-role client. Only for operations that cannot run under the user's JWT
 * (broker token storage, risk assessments, outbox). Never import from client code.
 */
export function createAdminClient() {
  const environment = readServerEnvironment();
  if (!environment.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  return createClient(environment.NEXT_PUBLIC_SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
