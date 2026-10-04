import { DEFAULT_ENGINE_CONFIG, PAUSE_POLICY } from "@/config/defaults";
import { getEffectivePact } from "@/engine/pact";
import { evaluateRisk } from "@/engine/score";
import { evaluateMoneySource } from "@/engine/triage";
import type {
  BorrowKind,
  CheckIn,
  CheckInTrigger,
  ExitPlan,
  FundSource,
  Pact,
  PauseEvent,
  RiskTier
} from "@/engine/types";
import type { ThehravDatabase } from "@/storage/local/database";

export interface CheckInInput {
  amountRupees: number;
  source: FundSource;
  borrowKind: BorrowKind;
  horizon: CheckIn["horizon"];
  reason: string;
  exitCondition: string;
  exitPlan?: ExitPlan;
  triggers?: CheckInTrigger[];
  /** Optional, local-only inputs for the money-source figures. */
  emergencyFundRupees?: number;
  monthlyExpensesRupees?: number;
  loanAnnualRatePercent?: number;
  loanYears?: number;
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

/** The money-source inputs (fund balance, expenses, loan terms) never leave the device. */
export function withoutLocalOnlyFields(checkIn: CheckIn): CheckIn {
  const copy = { ...checkIn };
  delete copy.emergencyFundBalancePaise;
  delete copy.monthlyExpensesPaise;
  delete copy.loanAnnualRatePercent;
  delete copy.loanYears;
  return copy;
}

function positive(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export interface MoneySourceFigures {
  /** Months of expenses the emergency fund covers before and after this amount. */
  runway?: { beforeMonths: number; afterMonths: number };
  /** Total return needed just to repay the loan over its term, as a fraction (0.39 = 39%). */
  loanBreakEven?: { ratePercent: number; years: number; requiredReturn: number };
}

/** SPEC §8.2 figures from the user's own inputs (no market data, no prediction). */
export function moneySourceFigures(checkIn: CheckIn): MoneySourceFigures {
  const triage = evaluateMoneySource({
    source: checkIn.fundSource,
    amountPaise: checkIn.amountPaise,
    emergencyFundBalancePaise: checkIn.emergencyFundBalancePaise,
    monthlyExpensesPaise: checkIn.monthlyExpensesPaise,
    annualInterestRate: checkIn.loanAnnualRatePercent !== undefined ? checkIn.loanAnnualRatePercent / 100 : undefined,
    horizonYears: checkIn.loanYears
  });
  const figures: MoneySourceFigures = {};
  if (
    triage.runwayBeforeMonths !== undefined &&
    triage.runwayWorstMonths !== undefined &&
    Number.isFinite(triage.runwayBeforeMonths)
  ) {
    figures.runway = { beforeMonths: triage.runwayBeforeMonths, afterMonths: triage.runwayWorstMonths };
  }
  if (triage.borrowingBreakEvenRate !== undefined && Number.isFinite(triage.borrowingBreakEvenRate)) {
    figures.loanBreakEven = {
      ratePercent: checkIn.loanAnnualRatePercent!,
      years: checkIn.loanYears!,
      requiredReturn: triage.borrowingBreakEvenRate
    };
  }
  return figures;
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
    exitCondition: input.exitCondition.trim(),
    ...(input.exitPlan ? { exitPlan: input.exitPlan } : {}),
    ...(input.triggers ? { triggers: [...new Set(input.triggers)] } : {})
  };
  if (input.source === "emergency_fund" && positive(input.emergencyFundRupees) && positive(input.monthlyExpensesRupees)) {
    checkIn.emergencyFundBalancePaise = Math.round(input.emergencyFundRupees! * 100);
    checkIn.monthlyExpensesPaise = Math.round(input.monthlyExpensesRupees! * 100);
  }
  if (input.source === "borrowed" && positive(input.loanAnnualRatePercent) && positive(input.loanYears)) {
    checkIn.loanAnnualRatePercent = input.loanAnnualRatePercent;
    checkIn.loanYears = input.loanYears;
  }

  const history = await deps.db.trades
    .where("timestamp")
    .aboveOrEqual(new Date(nowMs - HISTORY_WINDOW_MS).toISOString())
    .toArray();

  const result = evaluateRisk({
    history,
    pact: effectivePact,
    pactCommitted: Boolean(pact),
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

  await deps.enqueue("checkin", { ...withoutLocalOnlyFields(checkIn), assessmentId: result.assessmentId }, `checkin-${checkIn.id}`);
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
