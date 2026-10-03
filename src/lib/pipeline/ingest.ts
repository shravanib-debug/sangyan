import type { SupabaseClient } from "@supabase/supabase-js";

import type { BrokerEvent } from "@/engine/types";

import { assessBrokerEvent, isFillEvent, type PauseDraft } from "./assess";
import type { TradeEventRow } from "./history";
import { getPactState } from "./pact-store";

const HISTORY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const MONITORED_STATUSES = new Set(["connecting", "live", "reconnecting", "stale"]);

export type IngestResult =
  | { kind: "not_monitored" }
  | { kind: "simulation_mismatch" }
  | { kind: "ignored" }
  | { kind: "duplicate" }
  | { kind: "failed" }
  | { kind: "created"; tier: string; pause: PauseDraft | null };

/**
 * Verifies and stores one canonical broker event.
 * 1. Monitoring must still be active (connection live and consent unrevoked), so a
 *    disconnect stops ingestion immediately.
 * 2. The shared engine re-runs on server-held history and the user's authoritative Pact.
 * 3. event + assessment + pause + outbox commit in a single database transaction.
 */
export async function ingestBrokerEvent(
  admin: SupabaseClient,
  event: BrokerEvent,
  nowMs: number,
  newId: () => string
): Promise<IngestResult> {
  const { data: connection } = await admin
    .from("broker_connections")
    .select("id, status, consent_id, provider_user_ref")
    .eq("user_id", event.userId)
    .eq("provider", event.provider)
    .maybeSingle();
  if (!connection || !MONITORED_STATUSES.has(connection.status as string)) return { kind: "not_monitored" };

  const { data: consent } = await admin
    .from("consents")
    .select("id")
    .eq("id", connection.consent_id as string)
    .is("revoked_at", null)
    .maybeSingle();
  if (!consent) return { kind: "not_monitored" };

  // A replay event must never be stored as live, nor the reverse.
  const simulated = String(connection.provider_user_ref).startsWith("replay");
  if (Boolean(event.simulated) !== simulated) return { kind: "simulation_mismatch" };

  if (!isFillEvent(event)) return { kind: "ignored" };

  const { data: duplicate } = await admin
    .from("trade_events")
    .select("id")
    .eq("user_id", event.userId)
    .eq("dedupe_hash", event.dedupeHash)
    .maybeSingle();
  if (duplicate) return { kind: "duplicate" };

  const observedMs = new Date(event.observedAt).getTime();
  const [{ data: historyRows }, pactState] = await Promise.all([
    admin
      .from("trade_events")
      .select("id, observed_at, symbol, side, quantity, average_price_paise, provider_order_id, status")
      .eq("user_id", event.userId)
      .gte("observed_at", new Date(observedMs - HISTORY_WINDOW_MS).toISOString())
      .lte("observed_at", event.observedAt)
      .order("observed_at", { ascending: true }),
    getPactState(admin, event.userId, nowMs)
  ]);

  const assessment = assessBrokerEvent({
    event,
    history: (historyRows ?? []) as TradeEventRow[],
    pact: pactState.effective,
    newId
  });

  const { data: outcome, error } = await admin.rpc("ingest_broker_event", {
    p_event: {
      id: event.id,
      user_id: event.userId,
      broker_connection_id: connection.id,
      provider: event.provider,
      provider_event_id: event.providerEventId,
      provider_order_id: event.providerOrderId ?? null,
      event_type: event.eventType,
      observed_at: event.observedAt,
      received_at: event.receivedAt,
      status: event.status.toUpperCase(),
      symbol: event.symbol ?? null,
      side: event.side ?? null,
      quantity: event.quantity ?? null,
      average_price_paise: event.averagePricePaise ?? null,
      pnl_paise: null,
      source: simulated ? "synthetic" : "connected",
      dedupe_hash: event.dedupeHash
    },
    p_assessment: {
      id: assessment.result.assessmentId,
      score: assessment.result.score,
      tier: assessment.result.tier,
      signal_hits: assessment.result.signalHits,
      hard_rule_overrides: assessment.result.hardRuleOverrides,
      engine_version: assessment.result.engineVersion,
      config_version: assessment.result.configVersion,
      evaluated_at: assessment.result.evaluatedAt
    },
    p_pause: assessment.pause
      ? {
          id: assessment.pause.id,
          tier: assessment.pause.tier,
          started_at: assessment.pause.startedAt,
          expires_at: assessment.pause.expiresAt
        }
      : null
  });
  if (error) return { kind: "failed" };
  if (outcome === "duplicate") return { kind: "duplicate" };

  await admin
    .from("broker_connections")
    .update({ last_event_at: new Date(nowMs).toISOString() })
    .eq("id", connection.id as string);
  return { kind: "created", tier: assessment.result.tier, pause: assessment.pause };
}
