import { Pact } from "./types";

/**
 * Returns true if the proposed pact is strictly tighter or equal on all bounds.
 * Tighter means:
 * - dailyLossLimitPaise is LOWER (stricter limit on loss)
 * - maximumTradesPerDay is LOWER
 * - cooldownAfterLossMinutes is HIGHER
 * - blockedWindows is a SUPERSET or has more coverage (for simplicity, if they aren't identical and not stricter, it's looser)
 * - blockBorrowedFunds is TRUE if it was FALSE
 * - blockEmergencyFunds is TRUE if it was FALSE
 */
export function isTighterOrEqual(current: Pact, proposed: Pact): boolean {
  if (proposed.dailyLossLimitPaise > current.dailyLossLimitPaise) return false;
  if (proposed.maximumTradesPerDay > current.maximumTradesPerDay) return false;
  if (proposed.cooldownAfterLossMinutes < current.cooldownAfterLossMinutes) return false;
  if (!proposed.blockBorrowedFunds && current.blockBorrowedFunds) return false;
  if (!proposed.blockEmergencyFunds && current.blockEmergencyFunds) return false;

  // Window comparison: if proposed has fewer windows, it's looser.
  // A robust check would measure overlapping minutes. 
  // For MVP, if proposed doesn't contain all current windows exactly, we consider it a loosening of those specific windows unless it completely encompasses them.
  // Simple heuristic: if total blocked minutes is less, it's looser.
  const currentMins = current.blockedWindows.reduce((acc, w) => acc + (w.endMinuteIst - w.startMinuteIst), 0);
  const proposedMins = proposed.blockedWindows.reduce((acc, w) => acc + (w.endMinuteIst - w.startMinuteIst), 0);
  if (proposedMins < currentMins) return false;

  return true;
}

/**
 * Merges two pacts field-by-field, taking the stricter rule for each.
 * Used for sync conflicts.
 */
export function mergePactsStrict(pactA: Pact, pactB: Pact): Pact {
  const revision = Math.max(pactA.revision, pactB.revision) + 1;

  // Combine windows simply by concatenating and deduplicating/merging overlaps
  const allWindows = [...pactA.blockedWindows, ...pactB.blockedWindows];
  // Sort by start
  allWindows.sort((a, b) => a.startMinuteIst - b.startMinuteIst);
  const mergedWindows: { startMinuteIst: number; endMinuteIst: number }[] = [];
  
  for (const w of allWindows) {
    if (mergedWindows.length === 0) {
      mergedWindows.push({ ...w });
    } else {
      const last = mergedWindows[mergedWindows.length - 1]!;
      if (w.startMinuteIst <= last.endMinuteIst) {
        last.endMinuteIst = Math.max(last.endMinuteIst, w.endMinuteIst);
      } else {
        mergedWindows.push({ ...w });
      }
    }
  }

  return {
    id: pactA.id, // Usually conflicts share the same Pact ID
    userId: pactA.userId || pactB.userId,
    dailyLossLimitPaise: Math.min(pactA.dailyLossLimitPaise, pactB.dailyLossLimitPaise),
    maximumTradesPerDay: Math.min(pactA.maximumTradesPerDay, pactB.maximumTradesPerDay),
    cooldownAfterLossMinutes: Math.max(pactA.cooldownAfterLossMinutes, pactB.cooldownAfterLossMinutes),
    blockBorrowedFunds: pactA.blockBorrowedFunds || pactB.blockBorrowedFunds,
    blockEmergencyFunds: pactA.blockEmergencyFunds || pactB.blockEmergencyFunds,
    blockedWindows: mergedWindows,
    revision,
    effectiveAt: new Date(Math.min(
      new Date(pactA.effectiveAt).getTime(),
      new Date(pactB.effectiveAt).getTime()
    )).toISOString() // If either was tightening now, it applies earlier
  };
}

/**
 * Returns the effective Pact from a history of revisions, given the current time.
 */
export function getEffectivePact(pacts: Pact[], nowEpochMs: number): Pact | null {
  if (pacts.length === 0) return null;
  
  const active = pacts
    .filter(p => new Date(p.effectiveAt).getTime() <= nowEpochMs)
    .sort((a, b) => b.revision - a.revision); // highest revision first

  return active.length > 0 ? (active[0] || null) : null;
}

export interface PactChangeResult {
  /** Rules effective immediately: the stricter value of every field. */
  effective: Pact;
  /** Looser requested values, applicable only after the delay. Absent for pure tightening. */
  pending?: Pact;
  classification: "none" | "tighten" | "loosen" | "mixed";
}

function samePactValues(a: Pact, b: Pact): boolean {
  return (
    a.dailyLossLimitPaise === b.dailyLossLimitPaise &&
    a.maximumTradesPerDay === b.maximumTradesPerDay &&
    a.cooldownAfterLossMinutes === b.cooldownAfterLossMinutes &&
    a.blockBorrowedFunds === b.blockBorrowedFunds &&
    a.blockEmergencyFunds === b.blockEmergencyFunds &&
    JSON.stringify(a.blockedWindows) === JSON.stringify(b.blockedWindows)
  );
}

/**
 * Applies a requested Pact edit. Tightening is immediate; any looser field is held
 * back for `loosenDelayMs`. Because `effective` is the field-wise strict merge, a
 * mixed edit tightens now and loosens later. Pure: time is injected.
 */
export function applyPactChange(
  current: Pact | null,
  proposed: Pact,
  nowEpochMs: number,
  loosenDelayMs: number
): PactChangeResult {
  const nowIso = new Date(nowEpochMs).toISOString();
  if (!current) {
    return { effective: { ...proposed, revision: 1, effectiveAt: nowIso }, classification: "tighten" };
  }

  const strict = mergePactsStrict(current, proposed);
  const effective: Pact = {
    ...strict,
    id: current.id,
    revision: current.revision + 1,
    effectiveAt: nowIso
  };
  if (samePactValues(current, proposed)) {
    return { effective: current, classification: "none" };
  }
  if (isTighterOrEqual(current, proposed)) {
    return { effective, classification: "tighten" };
  }

  const tightenedSomething = !samePactValues(current, effective);
  return {
    effective: tightenedSomething ? effective : current,
    pending: {
      // Keeps the request's own id: it must not collide with the effective rules' id.
      ...proposed,
      revision: (tightenedSomething ? effective.revision : current.revision) + 1,
      effectiveAt: new Date(nowEpochMs + loosenDelayMs).toISOString()
    },
    classification: tightenedSomething ? "mixed" : "loosen"
  };
}
