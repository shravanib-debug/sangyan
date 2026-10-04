import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_ENGINE_CONFIG } from "@/config/defaults";
import { evaluateRisk } from "@/engine/score";
import type { Pact } from "@/engine/types";
import { DEFAULT_PACT } from "@/lib/pipeline/assess";
import { tradesFromEvents, type TradeEventRow } from "@/lib/pipeline/history";
import { applyPactSubmission, getPactState } from "@/lib/pipeline/pact-store";
import {
  checkInSyncSchema,
  journalSyncSchema,
  pactSyncSchema,
  pauseSyncSchema
} from "@/lib/validation/schemas";

export interface SyncContext {
  /** Runs under the user's JWT, so RLS applies. */
  userClient: SupabaseClient;
  /** Service role: only for tables clients may not write (pacts, assessments). */
  admin: SupabaseClient;
  userId: string;
  nowMs: number;
  consents: { sync: boolean; journalSync: boolean };
}

export interface SyncItemInput {
  id: string;
  entityType: "pact" | "checkin" | "pause" | "journal";
  payload: unknown;
}

export interface SyncItemResult {
  id: string;
  status: "success" | "failed" | "skipped";
  code?: string;
  retryable?: boolean;
  pact?: { effective: Pact | null; pending: Pact | null };
}

const HISTORY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const REDACTED_TEXT = "[kept on device]";

const ok = (id: string): SyncItemResult => ({ id, status: "success" });
const rejected = (id: string, code: string): SyncItemResult => ({ id, status: "failed", code, retryable: false });
const retry = (id: string, code: string): SyncItemResult => ({ id, status: "failed", code, retryable: true });

export async function processSyncItem(context: SyncContext, item: SyncItemInput): Promise<SyncItemResult> {
  try {
    switch (item.entityType) {
      case "pact":
        return await syncPact(context, item);
      case "checkin":
        return await syncCheckIn(context, item);
      case "pause":
        return await syncPause(context, item);
      case "journal":
        return await syncJournal(context, item);
    }
  } catch {
    // Never echo database or stack details back to the client.
    return retry(item.id, "server_error");
  }
}

async function syncPact(context: SyncContext, item: SyncItemInput): Promise<SyncItemResult> {
  const parsed = pactSyncSchema.safeParse(item.payload);
  if (!parsed.success) return rejected(item.id, "invalid_payload");
  const state = await applyPactSubmission(context.admin, context.userId, parsed.data, context.nowMs);
  return { ...ok(item.id), pact: state };
}

async function syncCheckIn(context: SyncContext, item: SyncItemInput): Promise<SyncItemResult> {
  const parsed = checkInSyncSchema.safeParse(item.payload);
  if (!parsed.success) return rejected(item.id, "invalid_payload");
  const { assessmentId, ...checkIn } = parsed.data;

  const { error: checkInError } = await context.userClient.from("checkins").upsert(
    {
      id: checkIn.id,
      user_id: context.userId,
      occurred_at: checkIn.timestamp,
      amount_paise: checkIn.amountPaise,
      fund_source: checkIn.fundSource,
      borrow_kind: checkIn.borrowKind,
      horizon: checkIn.horizon,
      // Free text only leaves the device with explicit journal consent.
      reason: context.consents.journalSync ? checkIn.reason : REDACTED_TEXT,
      exit_condition: context.consents.journalSync ? checkIn.exitCondition : REDACTED_TEXT,
      idempotency_key: item.id
    },
    { onConflict: "user_id,idempotency_key", ignoreDuplicates: true }
  );
  if (checkInError) return retry(item.id, "checkin_write_failed");

  // Never trust a client-supplied tier: re-run the shared engine on server-held data.
  const nowEpochMs = new Date(checkIn.timestamp).getTime();
  const { data: historyRows } = await context.userClient
    .from("trade_events")
    .select("id, observed_at, symbol, side, quantity, average_price_paise, provider_order_id, status")
    .gte("observed_at", new Date(nowEpochMs - HISTORY_WINDOW_MS).toISOString())
    .lte("observed_at", checkIn.timestamp)
    .order("observed_at", { ascending: true });

  const pactState = await getPactState(context.admin, context.userId, context.nowMs);
  const result = evaluateRisk({
    history: tradesFromEvents((historyRows ?? []) as TradeEventRow[]),
    pact: pactState.effective ?? DEFAULT_PACT,
    pactCommitted: pactState.effective !== null,
    checkIn: {
      amountPaise: checkIn.amountPaise,
      fundSource: checkIn.fundSource,
      borrowKind: checkIn.borrowKind,
      timestamp: checkIn.timestamp
    },
    nowEpochMs,
    config: DEFAULT_ENGINE_CONFIG
  });

  const { error: assessmentError } = await context.admin.from("risk_assessments").upsert(
    {
      id: assessmentId,
      user_id: context.userId,
      checkin_id: checkIn.id,
      score: result.score,
      tier: result.tier,
      signal_hits: result.signalHits,
      hard_rule_overrides: result.hardRuleOverrides,
      engine_version: result.engineVersion,
      config_version: result.configVersion,
      evaluated_at: result.evaluatedAt
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (assessmentError) return retry(item.id, "assessment_write_failed");
  return ok(item.id);
}

async function syncPause(context: SyncContext, item: SyncItemInput): Promise<SyncItemResult> {
  const parsed = pauseSyncSchema.safeParse(item.payload);
  if (!parsed.success) return rejected(item.id, "invalid_payload");
  const pause = parsed.data;

  const { data: assessment } = await context.admin
    .from("risk_assessments")
    .select("id, tier")
    .eq("id", pause.assessmentId)
    .eq("user_id", context.userId)
    .maybeSingle();
  // The check-in that creates the assessment may still be in flight: retry later.
  if (!assessment) return retry(item.id, "assessment_pending");

  const { data: existing } = await context.userClient
    .from("pause_events")
    .select("id, revision")
    .eq("id", pause.id)
    .maybeSingle();

  if (!existing) {
    const { error } = await context.userClient.from("pause_events").insert({
      id: pause.id,
      user_id: context.userId,
      assessment_id: pause.assessmentId,
      tier: assessment.tier,
      started_at: pause.startedAt,
      expires_at: pause.expiresAt ?? null,
      outcome: pause.outcome,
      revision: pause.revision,
      idempotency_key: `pause-${pause.id}`
    });
    return error ? retry(item.id, "pause_write_failed") : ok(item.id);
  }

  if (pause.revision > Number(existing.revision)) {
    const { error } = await context.userClient
      .from("pause_events")
      .update({ outcome: pause.outcome, revision: pause.revision })
      .eq("id", pause.id);
    return error ? retry(item.id, "pause_write_failed") : ok(item.id);
  }
  return ok(item.id);
}

async function syncJournal(context: SyncContext, item: SyncItemInput): Promise<SyncItemResult> {
  if (!context.consents.journalSync) return { id: item.id, status: "skipped", code: "journal_consent_required" };
  const parsed = journalSyncSchema.safeParse(item.payload);
  if (!parsed.success) return rejected(item.id, "invalid_payload");
  const entry = parsed.data;

  const { error } = await context.userClient.from("journal_entries").upsert(
    {
      id: entry.id,
      user_id: context.userId,
      reason: entry.reason,
      horizon: entry.horizon,
      exit_condition: entry.exitCondition,
      transcript_source: entry.transcriptSource,
      created_at: entry.createdAt,
      idempotency_key: item.id
    },
    { onConflict: "user_id,idempotency_key", ignoreDuplicates: true }
  );
  return error ? retry(item.id, "journal_write_failed") : ok(item.id);
}
