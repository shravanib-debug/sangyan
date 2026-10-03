import type { SupabaseClient } from "@supabase/supabase-js";

import { PACT_LOOSEN_DELAY_MS } from "@/config/defaults";
import { applyPactChange } from "@/engine/pact";
import type { Pact } from "@/engine/types";

interface PactRow {
  id: string;
  user_id: string;
  daily_loss_limit_paise: number | string;
  maximum_trades_per_day: number;
  cooldown_after_loss_minutes: number;
  blocked_windows: Pact["blockedWindows"] | null;
  block_borrowed_funds: boolean;
  block_emergency_funds: boolean;
  revision: number | string;
  effective_at: string;
}

export function pactFromRow(row: PactRow): Pact {
  return {
    id: row.id,
    userId: row.user_id,
    dailyLossLimitPaise: Number(row.daily_loss_limit_paise),
    maximumTradesPerDay: row.maximum_trades_per_day,
    cooldownAfterLossMinutes: row.cooldown_after_loss_minutes,
    blockedWindows: row.blocked_windows ?? [],
    blockBorrowedFunds: row.block_borrowed_funds,
    blockEmergencyFunds: row.block_emergency_funds,
    revision: Number(row.revision),
    effectiveAt: row.effective_at
  };
}

function pactValues(pact: Pact) {
  return {
    daily_loss_limit_paise: pact.dailyLossLimitPaise,
    maximum_trades_per_day: pact.maximumTradesPerDay,
    cooldown_after_loss_minutes: pact.cooldownAfterLossMinutes,
    blocked_windows: pact.blockedWindows,
    block_borrowed_funds: pact.blockBorrowedFunds,
    block_emergency_funds: pact.blockEmergencyFunds,
    revision: pact.revision,
    effective_at: pact.effectiveAt
  };
}

export interface PactState {
  effective: Pact | null;
  pending: Pact | null;
}

async function loadEffective(client: SupabaseClient, userId: string): Promise<Pact | null> {
  const { data } = await client.from("pacts").select("*").eq("user_id", userId).maybeSingle();
  return data ? pactFromRow(data as PactRow) : null;
}

async function loadPending(client: SupabaseClient, userId: string): Promise<Pact | null> {
  const { data } = await client
    .from("pact_changes")
    .select("id, requested_values, effective_at")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { ...(data.requested_values as Pact), id: data.id as string, effectiveAt: data.effective_at as string };
}

/** Pending loosening becomes effective once the server clock passes its `effective_at`. */
export async function activateDuePactChanges(client: SupabaseClient, userId: string, nowMs: number): Promise<void> {
  const nowIso = new Date(nowMs).toISOString();
  const { data: due } = await client
    .from("pact_changes")
    .select("id, requested_values")
    .eq("user_id", userId)
    .eq("status", "pending")
    .lte("effective_at", nowIso)
    .order("effective_at", { ascending: true });

  for (const change of due ?? []) {
    const current = await loadEffective(client, userId);
    if (!current) continue;
    const requested = change.requested_values as Pact;
    const activated: Pact = { ...requested, id: current.id, revision: current.revision + 1, effectiveAt: nowIso };
    const { error } = await client.from("pacts").update(pactValues(activated)).eq("user_id", userId);
    if (error) continue;
    await client.from("pact_changes").update({ status: "effective" }).eq("id", change.id as string);
  }
}

export async function getPactState(client: SupabaseClient, userId: string, nowMs: number): Promise<PactState> {
  await activateDuePactChanges(client, userId, nowMs);
  return { effective: await loadEffective(client, userId), pending: await loadPending(client, userId) };
}

/**
 * Server-authoritative Pact edit. Tightening is applied immediately; looser values
 * wait out the delay measured on the server clock, so a device clock cannot shorten it.
 * Re-delivery of the same request is a no-op (idempotency key = request id).
 */
export async function applyPactSubmission(
  client: SupabaseClient,
  userId: string,
  proposed: Pact,
  nowMs: number
): Promise<PactState> {
  await activateDuePactChanges(client, userId, nowMs);

  const idempotencyKey = `pact-${proposed.id}`;
  const { data: seen } = await client
    .from("pact_changes")
    .select("id")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (seen) return { effective: await loadEffective(client, userId), pending: await loadPending(client, userId) };

  const current = await loadEffective(client, userId);
  const change = applyPactChange(current, proposed, nowMs, PACT_LOOSEN_DELAY_MS);

  // A new request replaces any previous pending loosening.
  await client
    .from("pact_changes")
    .update({ status: "superseded" })
    .eq("user_id", userId)
    .eq("status", "pending");

  if (!current) {
    const { error } = await client
      .from("pacts")
      .insert({ id: proposed.id, user_id: userId, ...pactValues(change.effective) });
    if (error) throw new Error("pact_insert_failed");
  } else if (change.effective !== current) {
    const { error } = await client.from("pacts").update(pactValues(change.effective)).eq("user_id", userId);
    if (error) throw new Error("pact_update_failed");
  }

  const pactId = current?.id ?? proposed.id;
  const nowIso = new Date(nowMs).toISOString();
  const { error: recordError } = await client.from("pact_changes").insert({
    user_id: userId,
    pact_id: pactId,
    requested_values: change.pending ?? proposed,
    classification: change.classification === "none" ? "tighten" : change.classification,
    status: change.pending ? "pending" : change.classification === "none" ? "superseded" : "effective",
    effective_at: change.pending ? change.pending.effectiveAt : nowIso,
    client_created_at: proposed.effectiveAt,
    idempotency_key: idempotencyKey
  });
  if (recordError) throw new Error("pact_change_record_failed");

  return { effective: await loadEffective(client, userId), pending: await loadPending(client, userId) };
}
