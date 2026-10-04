import { DEFAULT_ENGINE_CONFIG, PAUSE_POLICY } from "@/config/defaults";
import { getEffectivePact } from "@/engine/pact";
import { evaluateRisk } from "@/engine/score";
import type { BorrowKind, CheckIn, FundSource, Pact, PauseEvent, RiskTier } from "@/engine/types";
import type { ThehravDatabase } from "@/storage/local/database";

export interface CheckInInput {
  amountRupees: number;
  source: FundSource;
  borrowKind: BorrowKind;
  horizon: CheckIn["horizon"];
  reason: string;
  exitCondition: string;
}

export interface CheckInDeps {
  db: ThehravDatabase;
  now: () => number;
  newId: () => string;
  enqueue: (entityType: "checkin" | "pause", payload: unknown, id: string) => Promise<unknown>;
}

export interface CheckInOutcome {
  pauseId: string;
  assessmentId: string;
  tier: RiskTier;
}

const HISTORY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/** Pause length per friction tier. L3 lasts until the user's own cooldown rule elapses. */
export function pauseExpiry(tier: RiskTier, startedMs: number, pact: Pick<Pact, "cooldownAfterLossMinutes">): string | undefined {
  switch (tier) {
    case "L0":
      return undefined;
    case "L1":
      return new Date(startedMs + PAUSE_POLICY.l1Seconds * 1000).toISOString();
    case "L2":
      return new Date(startedMs + PAUSE_POLICY.l2Seconds * 1000).toISOString();
    case "L3":
      return new Date(startedMs + pact.cooldownAfterLossMinutes * 60_000).toISOString();
  }
}

/**
 * Money source -> detect -> score -> pause, entirely on the device. The result is
 * stored locally first so the user never waits for the network; sync happens afterwards.
 */
export async function runCheckIn(input: CheckInInput, deps: CheckInDeps): Promise<CheckInOutcome> {
  const nowMs = deps.now();
  const nowIso = new Date(nowMs).toISOString();

  const pact = getEffectivePact(await deps.db.pacts.toArray(), nowMs) ?? undefined;
  const effectivePact: Pact = pact ?? {
    id: "default",
    dailyLossLimitPaise: 500_000,
    maximumTradesPerDay: 5,
    cooldownAfterLossMinutes: 30,
    blockedWindows: [{ startMinuteIst: 0, endMinuteIst: 360 }],
    blockBorrowedFunds: true,
    blockEmergencyFunds: true,
    revision: 0,
    effectiveAt: nowIso
  };

  const checkIn: CheckIn = {
    id: deps.newId(),
    timestamp: nowIso,
    amountPaise: Math.round(input.amountRupees * 100),
    fundSource: input.source,
    borrowKind: input.source === "borrowed" ? input.borrowKind : "none",
    horizon: input.horizon,
    reason: input.reason.trim(),
    exitCondition: input.exitCondition.trim()
  };

  const history = await deps.db.trades
    .where("timestamp")
    .aboveOrEqual(new Date(nowMs - HISTORY_WINDOW_MS).toISOString())
    .toArray();

  const result = evaluateRisk({
    history,
    pact: effectivePact,
    checkIn,
    nowEpochMs: nowMs,
    config: DEFAULT_ENGINE_CONFIG
  });
  result.assessmentId = deps.newId();

  const pause: PauseEvent = {
    id: deps.newId(),
    checkInId: checkIn.id,
    assessmentId: result.assessmentId,
    tier: result.tier,
    startedAt: nowIso,
    expiresAt: pauseExpiry(result.tier, nowMs, effectivePact),
    outcome: "waiting",
    revision: 0
  };

  await deps.db.transaction("rw", deps.db.checkins, deps.db.riskAssessments, deps.db.pauses, async () => {
    await deps.db.checkins.put(checkIn);
    await deps.db.riskAssessments.put(result);
    await deps.db.pauses.put(pause);
  });

  await deps.enqueue("checkin", { ...checkIn, assessmentId: result.assessmentId }, `checkin-${checkIn.id}`);
  await deps.enqueue(
    "pause",
    {
      id: pause.id,
      assessmentId: pause.assessmentId,
      tier: pause.tier,
      startedAt: pause.startedAt,
      expiresAt: pause.expiresAt ?? null,
      outcome: pause.outcome,
      revision: 0
    },
    `pause-${pause.id}-r0`
  );

  return { pauseId: pause.id, assessmentId: result.assessmentId, tier: result.tier };
}
