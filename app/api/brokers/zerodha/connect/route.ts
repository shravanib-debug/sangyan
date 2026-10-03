import { NextResponse, type NextRequest } from "next/server";

import { getActiveConsentId } from "@/lib/auth/consent";
import { LOGIN_STATE_TTL_MS, newNonce, signLoginState } from "@/lib/broker/state";
import { REPLAY_PROVIDER_REF } from "@/lib/broker/status";
import { buildLoginUrl } from "@/lib/broker/zerodha";
import { readServerEnvironment } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function settingsRedirect(request: NextRequest, code: string) {
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  return NextResponse.redirect(new URL(`/settings?broker=${code}`, origin));
}

/** Starts Zerodha's hosted login. Broker credentials never touch Thehrav. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const consentId = await getActiveConsentId(supabase, user.id, "broker_monitoring");
  if (!consentId) return settingsRedirect(request, "consent_required");

  const environment = readServerEnvironment();
  const admin = createAdminClient();
  const now = Date.now();

  const hasCredentials = Boolean(environment.ZERODHA_API_KEY && environment.ZERODHA_API_SECRET);
  if (!hasCredentials) {
    // Without approved app credentials only a clearly labelled replay connection exists.
    if (environment.BROKER_WORKER_MODE === "live") return settingsRedirect(request, "not_configured");
    const { error } = await admin.from("broker_connections").upsert(
      {
        user_id: user.id,
        consent_id: consentId,
        provider: "zerodha",
        provider_user_ref: REPLAY_PROVIDER_REF,
        encrypted_access_token: null,
        token_key_version: null,
        status: "connecting",
        expires_at: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
        lease_owner: null,
        lease_expires_at: null,
        disconnected_at: null
      },
      { onConflict: "user_id,provider" }
    );
    return settingsRedirect(request, error ? "connect_failed" : "replay");
  }

  if (!environment.BROKER_INTERNAL_SIGNING_KEY || !environment.BROKER_TOKEN_ENCRYPTION_KEY) {
    return settingsRedirect(request, "not_configured");
  }

  const nonce = newNonce();
  const expiresAt = now + LOGIN_STATE_TTL_MS;
  const { error } = await admin.from("broker_login_states").insert({
    nonce,
    user_id: user.id,
    provider: "zerodha",
    expires_at: new Date(expiresAt).toISOString()
  });
  if (error) return settingsRedirect(request, "connect_failed");

  const state = signLoginState({ uid: user.id, nonce, exp: expiresAt }, environment.BROKER_INTERNAL_SIGNING_KEY);
  return NextResponse.redirect(buildLoginUrl(environment.ZERODHA_API_KEY as string, state));
}
