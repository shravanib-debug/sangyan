import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getActiveConsentId } from "@/lib/auth/consent";
import { isSameOrigin } from "@/lib/auth/origin";
import { encryptSecret, parseEncryptionKey, toPgBytea } from "@/lib/crypto/secret-box";
import { readServerEnvironment } from "@/lib/env/server";
import { pushAad } from "@/lib/push/crypto";
import { createClient } from "@/lib/supabase/server";

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048).startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(128) })
});

const removeSchema = z.object({ id: z.string().uuid() });

/** Registers a device. The endpoint and keys are encrypted before they reach the database. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });

  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!(await getActiveConsentId(supabase, user.id, "push"))) {
    return NextResponse.json({ error: "consent_required", purpose: "push" }, { status: 403 });
  }

  const environment = readServerEnvironment();
  if (!environment.PUSH_SUBSCRIPTION_ENCRYPTION_KEY) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const key = parseEncryptionKey(environment.PUSH_SUBSCRIPTION_ENCRYPTION_KEY);

  const { data, error } = await supabase
    .from("push_subscriptions")
    .insert({
      user_id: user.id,
      endpoint_ciphertext: toPgBytea(encryptSecret(parsed.data.endpoint, key, pushAad(user.id))),
      key_ciphertext: toPgBytea(encryptSecret(JSON.stringify(parsed.data.keys), key, pushAad(user.id))),
      key_version: 1
    })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: "subscribe_failed" }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}

/** Revokes one device subscription. */
export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });

  const parsed = removeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("push_subscriptions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "unsubscribe_failed" }, { status: 500 });
  return NextResponse.json({ status: "revoked" });
}
