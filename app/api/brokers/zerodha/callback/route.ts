import { NextResponse, type NextRequest } from "next/server";

import { getActiveConsentId } from "@/lib/auth/consent";
import { brokerAad } from "@/lib/broker/connection-store";
import { verifyLoginState } from "@/lib/broker/state";
import { exchangeRequestToken, kiteTokenExpiry } from "@/lib/broker/zerodha";
import { encryptSecret, parseEncryptionKey, toPgBytea } from "@/lib/crypto/secret-box";
import { readServerEnvironment } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function settingsRedirect(request: NextRequest, code: string) {
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  return NextResponse.redirect(new URL(`/settings?broker=${code}`, origin));
}

/**
 * The only place a request token is exchanged. Requires the signed state issued by
 * /connect, an authenticated session for the same user, and an unused unexpired nonce.
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const requestToken = params.get("request_token");
  const state = params.get("state");

  if (params.get("status") !== "success" || !requestToken || !state) return settingsRedirect(request, "denied");

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const environment = readServerEnvironment();
  if (
    !environment.ZERODHA_API_KEY ||
    !environment.ZERODHA_API_SECRET ||
    !environment.BROKER_INTERNAL_SIGNING_KEY ||
    !environment.BROKER_TOKEN_ENCRYPTION_KEY
  ) {
    return settingsRedirect(request, "not_configured");
  }

  const now = Date.now();
  const payload = verifyLoginState(state, environment.BROKER_INTERNAL_SIGNING_KEY, now);
  if (!payload || payload.uid !== user.id) return settingsRedirect(request, "state_invalid");

  const admin = createAdminClient();
  // Atomic single use: only one request can flip used_at from null.
  const { data: consumed } = await admin
    .from("broker_login_states")
    .update({ used_at: new Date(now).toISOString() })
    .eq("nonce", payload.nonce)
    .eq("user_id", user.id)
    .is("used_at", null)
    .gt("expires_at", new Date(now).toISOString())
    .select("nonce");
  if (!consumed || consumed.length !== 1) return settingsRedirect(request, "state_replayed");

  const consentId = await getActiveConsentId(supabase, user.id, "broker_monitoring");
  if (!consentId) return settingsRedirect(request, "consent_required");

  let session;
  try {
    session = await exchangeRequestToken({
      apiKey: environment.ZERODHA_API_KEY,
      apiSecret: environment.ZERODHA_API_SECRET,
      requestToken
    });
  } catch {
    return settingsRedirect(request, "exchange_failed");
  }

  const encrypted = encryptSecret(
    session.accessToken,
    parseEncryptionKey(environment.BROKER_TOKEN_ENCRYPTION_KEY),
    brokerAad(user.id)
  );

  const { error } = await admin.from("broker_connections").upsert(
    {
      user_id: user.id,
      consent_id: consentId,
      provider: "zerodha",
      provider_user_ref: session.providerUserRef,
      encrypted_access_token: toPgBytea(encrypted),
      token_key_version: 1,
      status: "connecting",
      expires_at: kiteTokenExpiry(now).toISOString(),
      lease_owner: null,
      lease_expires_at: null,
      disconnected_at: null
    },
    { onConflict: "user_id,provider" }
  );
  return settingsRedirect(request, error ? "connect_failed" : "connected");
}
