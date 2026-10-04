import { PACT_LOOSEN_DELAY_MS } from "@/config/defaults";
import { applyPactChange, getEffectivePact, type PactChangeResult } from "@/engine/pact";
import type { Pact } from "@/engine/types";
import type { ThehravDatabase } from "@/storage/local/database";

export const DEFAULT_BLOCKED_WINDOWS: Pact["blockedWindows"] = [{ startMinuteIst: 0, endMinuteIst: 360 }];

export interface PactFormValues {
  dailyLossLimitRupees: number;
  maximumTradesPerDay: number;
  cooldownAfterLossMinutes: number;
  blockBorrowedFunds: boolean;
  blockEmergencyFunds: boolean;
  /** Optional per-trade cap in rupees; undefined means no cap. */
  maxPositionRupees?: number;
}

export interface LocalPactState {
  effective: Pact | null;
  pending: Pact | null;
}

export interface PactDeps {
  db: ThehravDatabase;
  now: () => number;
  newId: () => string;
  enqueue: (entityType: "pact", payload: Pact, id: string) => Promise<unknown>;
}

export async function loadPactState(db: ThehravDatabase, nowMs: number): Promise<LocalPactState> {
  const all = await db.pacts.toArray();
  const effective = getEffectivePact(all, nowMs);
  const pending =
    all
      .filter((pact) => new Date(pact.effectiveAt).getTime() > nowMs)
      .sort((a, b) => new Date(a.effectiveAt).getTime() - new Date(b.effectiveAt).getTime())[0] ?? null;
  return { effective, pending };
}

/**
 * Applies a Pact edit locally with the shared engine rule: tightening is effective now,
 * looser values wait out the delay, and a new edit replaces any pending loosening.
 * The requested Pact is queued for server verification, which re-applies the same rule on
 * the server clock.
 */
export async function savePact(values: PactFormValues, deps: PactDeps): Promise<PactChangeResult> {
  const nowMs = deps.now();
  const { effective } = await loadPactState(deps.db, nowMs);

  const proposed: Pact = {
    id: deps.newId(),
    dailyLossLimitPaise: Math.round(values.dailyLossLimitRupees * 100),
    maximumTradesPerDay: values.maximumTradesPerDay,
    cooldownAfterLossMinutes: values.cooldownAfterLossMinutes,
    blockedWindows: effective?.blockedWindows ?? DEFAULT_BLOCKED_WINDOWS,
    blockBorrowedFunds: values.blockBorrowedFunds,
    blockEmergencyFunds: values.blockEmergencyFunds,
    ...(values.maxPositionRupees !== undefined && values.maxPositionRupees > 0
      ? { maxPositionPaise: Math.round(values.maxPositionRupees * 100) }
      : {}),
    revision: (effective?.revision ?? 0) + 1,
    effectiveAt: new Date(nowMs).toISOString()
  };

  const change = applyPactChange(effective, proposed, nowMs, PACT_LOOSEN_DELAY_MS);

  await deps.db.transaction("rw", deps.db.pacts, async () => {
    // A new edit supersedes any pending loosening (including cancelling it by restating current rules).
    const pendingIds = (await deps.db.pacts.toArray())
      .filter((pact) => new Date(pact.effectiveAt).getTime() > nowMs)
      .map((pact) => pact.id);
    await deps.db.pacts.bulkDelete(pendingIds);
    if (change.effective !== effective) await deps.db.pacts.put(change.effective);
    if (change.pending) await deps.db.pacts.put(change.pending);
  });

  // Always queued: even an unchanged request cancels a pending loosening on the server.
  await deps.enqueue("pact", proposed, proposed.id);
  return change;
}
