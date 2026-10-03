import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { searchParams } = new URL(req.url);
  const requestToken = searchParams.get("request_token");

  if (!requestToken) {
    return NextResponse.redirect(new URL("/settings?error=missing_token", req.url));
  }

  // In a real app, we would exchange requestToken for an accessToken via Zerodha API
  // Here, we mock the access token and save it to the DB using pgcrypto or directly.
  
  // First, ensure a consent record exists
  const { data: consent } = await supabase.from('consents')
    .insert({ user_id: user.id, purpose: 'broker_monitoring', policy_version: 'v1' })
    .select()
    .single();

  if (consent) {
    // Upsert broker connection
    await supabase.from('broker_connections').upsert({
      user_id: user.id,
      consent_id: consent.id,
      provider: 'zerodha',
      provider_user_ref: 'mock_zerodha_user_123',
      status: 'live',
      token_key_version: 1
      // encrypted_access_token would be set here using pgcrypto or server-side encryption
    });
  }

  return NextResponse.redirect(new URL("/settings", req.url));
}
