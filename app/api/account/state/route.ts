import { NextResponse } from "next/server";

import { CONSENT_PURPOSES, getActiveConsentId } from "@/lib/auth/consent";
import { DISCONNECTED_SUMMARY, getConnectionSummary } from "@/lib/broker/connection-store";
import { readServerEnvironment } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Name shown across the app: saved profile name, then sign-up name, then the part of the email before "@". */
async function displayNameFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> }
): Promise<string> {
  const { data } = await supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle();
  const saved = typeof data?.display_name === "string" ? data.display_name.trim() : "";
  if (saved) return saved;
  const fromSignup = user.user_metadata?.display_name;
  if (typeof fromSignup === "string" && fromSignup.trim()) return fromSignup.trim();
  return user.email?.split("@")[0] || "there";
}

/** Everything the Settings and Home screens need: session, consents and broker health. */
export async function GET() {
  const empty = {
    user: null,
    consents: {},
    broker: DISCONNECTED_SUMMARY,
    config: { zerodhaConfigured: false, replayAvailable: false, vapidPublicKey: null }
  };

  try {
    const environment = readServerEnvironment();
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    const config = {
      zerodhaConfigured: Boolean(environment.ZERODHA_API_KEY && environment.ZERODHA_API_SECRET),
      replayAvailable: environment.BROKER_WORKER_MODE !== "live",
      vapidPublicKey: environment.VAPID_PUBLIC_KEY ?? null
    };
    if (!user) return NextResponse.json({ ...empty, config }, { headers: { "Cache-Control": "no-store" } });

    const consentEntries = await Promise.all(
      CONSENT_PURPOSES.map(async (purpose) => [purpose, Boolean(await getActiveConsentId(supabase, user.id, purpose))] as const)
    );
    const broker = environment.SUPABASE_SERVICE_ROLE_KEY
      ? await getConnectionSummary(createAdminClient(), user.id, Date.now())
      : DISCONNECTED_SUMMARY;

    const displayName = await displayNameFor(supabase, user).catch(() => user.email?.split("@")[0] || "there");

    return NextResponse.json(
      { user: { email: user.email ?? null, displayName }, consents: Object.fromEntries(consentEntries), broker, config },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // Backend not configured or unreachable: the PWA keeps working in guest mode.
    return NextResponse.json(empty, { headers: { "Cache-Control": "no-store" } });
  }
}
