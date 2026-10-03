// Dispatches committed outbox rows as generic Web Push notifications.
// Invoked by the ingest route right after commit (low latency) and by Supabase Cron
// (durable retry). Rows are claimed with an atomic update so concurrent invocations
// never send the same notification twice.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

import { buildPushPayload } from "../_shared/push-copy.ts";

const MAX_ATTEMPTS = 8;
const BATCH = 25;

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false }
});

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:security@thehrav.invalid",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!
);

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function pgByteaToBytes(value: string): Uint8Array {
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

// Blob layout (see src/lib/crypto/secret-box.ts): iv(12) || ciphertext || tag(16).
async function decrypt(blob: Uint8Array, aad: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(Deno.env.get("PUSH_SUBSCRIPTION_ENCRYPTION_KEY")!),
    "AES-GCM",
    false,
    ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: blob.slice(0, 12), additionalData: new TextEncoder().encode(aad) },
    key,
    blob.slice(12)
  );
  return new TextDecoder().decode(plain);
}

Deno.serve(async () => {
  const nowIso = new Date().toISOString();
  const { data: due } = await supabase
    .from("outbox_events")
    .select("id, user_id, aggregate_id, payload, attempts")
    .is("dispatched_at", null)
    .lte("available_at", nowIso)
    .lt("attempts", MAX_ATTEMPTS)
    .order("available_at", { ascending: true })
    .limit(BATCH);

  let sent = 0;
  for (const row of due ?? []) {
    // Claim: bump attempts and push the next retry out (exponential backoff). Only one caller wins.
    const backoffMs = Math.min(15 * 60_000, 5_000 * 2 ** Number(row.attempts));
    const { data: claimed } = await supabase
      .from("outbox_events")
      .update({ attempts: Number(row.attempts) + 1, available_at: new Date(Date.now() + backoffMs).toISOString() })
      .eq("id", row.id)
      .eq("attempts", row.attempts)
      .is("dispatched_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const { data: profile } = await supabase.from("profiles").select("locale").eq("user_id", row.user_id).maybeSingle();
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint_ciphertext, key_ciphertext")
      .eq("user_id", row.user_id)
      .is("revoked_at", null);

    const payload = buildPushPayload({
      pauseId: String(row.aggregate_id),
      simulated: Boolean((row.payload as { simulated?: boolean }).simulated),
      locale: profile?.locale ?? "en"
    });

    let delivered = 0;
    for (const subscription of subscriptions ?? []) {
      try {
        const aad = `push:${row.user_id}`;
        const endpoint = await decrypt(pgByteaToBytes(subscription.endpoint_ciphertext), aad);
        const keys = JSON.parse(await decrypt(pgByteaToBytes(subscription.key_ciphertext), aad));
        await webpush.sendNotification({ endpoint, keys }, JSON.stringify(payload), { TTL: 3600 });
        delivered += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await supabase.from("push_subscriptions").update({ revoked_at: new Date().toISOString() }).eq("id", subscription.id);
        }
      }
    }

    if (delivered > 0 || (subscriptions ?? []).length === 0) {
      // No subscription means the in-app inbox is the delivery channel: the row is done.
      await supabase
        .from("outbox_events")
        .update({
          dispatched_at: new Date().toISOString(),
          last_error_code: delivered > 0 ? null : "no_subscription"
        })
        .eq("id", row.id);
      sent += delivered > 0 ? 1 : 0;
    } else {
      await supabase.from("outbox_events").update({ last_error_code: "delivery_failed" }).eq("id", row.id);
    }
  }

  return new Response(JSON.stringify({ processed: (due ?? []).length, sent }), {
    headers: { "Content-Type": "application/json" }
  });
});
