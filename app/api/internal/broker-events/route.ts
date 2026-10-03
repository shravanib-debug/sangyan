import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { verifyBodySignature } from "@/lib/crypto/signing";
import { readServerEnvironment } from "@/lib/env/server";
import { ingestBrokerEvent } from "@/lib/pipeline/ingest";
import { createAdminClient } from "@/lib/supabase/admin";
import { brokerEventSchema } from "@/lib/validation/schemas";

const MAX_BODY_BYTES = 16 * 1024;

const bodySchema = z.object({ event: brokerEventSchema }).strict();

/**
 * Worker-to-app boundary. Accepts only canonical events, signed by the worker.
 * Storage, verification and the transactional outbox live in ingestBrokerEvent.
 */
export async function POST(request: NextRequest) {
  const environment = readServerEnvironment();
  if (!environment.BROKER_INTERNAL_SIGNING_KEY || !environment.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });

  const now = Date.now();
  const authentic = verifyBodySignature({
    key: environment.BROKER_INTERNAL_SIGNING_KEY,
    rawBody,
    timestampMs: request.headers.get("x-thehrav-timestamp"),
    signature: request.headers.get("x-thehrav-signature"),
    nowMs: now
  });
  if (!authentic) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_event" }, { status: 400 });

  const result = await ingestBrokerEvent(createAdminClient(), parsed.data.event, now, () => crypto.randomUUID());

  switch (result.kind) {
    case "not_monitored":
      return NextResponse.json({ error: "not_monitored" }, { status: 409 });
    case "simulation_mismatch":
      return NextResponse.json({ error: "simulation_mismatch" }, { status: 422 });
    case "failed":
      return NextResponse.json({ error: "ingest_failed" }, { status: 500 });
    case "ignored":
      return NextResponse.json({ status: "ignored", reason: "not_a_fill" });
    case "duplicate":
      return NextResponse.json({ status: "duplicate" });
    case "created":
      if (result.pause) void triggerDispatch(environment);
      return NextResponse.json({ status: "created", tier: result.tier });
  }
}

/** Best-effort low-latency kick. The outbox row is already committed; Cron retries if this fails. */
async function triggerDispatch(environment: ReturnType<typeof readServerEnvironment>) {
  try {
    await fetch(`${environment.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/dispatch-outbox`, {
      method: "POST",
      headers: { Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}` },
      signal: AbortSignal.timeout(3000)
    });
  } catch {
    // Intentionally ignored: durable retry covers this.
  }
}
