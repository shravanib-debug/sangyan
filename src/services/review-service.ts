import { getEffectivePact } from "@/engine/pact";
import type { CheckIn, PauseEvent, PauseOutcome, RiskResult, RiskTier, SignalHit, Trade } from "@/engine/types";
import type { ThehravDatabase } from "@/storage/local/database";

import { DEFAULT_REPLAY_PACT, replayHistory, type FlaggedTrade } from "./replay-service";

export type ReviewAnswer = "followed" | "breached";

export interface DecisionRecord {
  checkIn: CheckIn;
  tier?: RiskTier;
  outcome?: PauseOutcome;
  pause?: PauseEvent;
  assessment?: RiskResult;
}

export interface ReviewData {
  totalTrades: number;
  flagged: FlaggedTrade[];
  signalCounts: Partial<Record<SignalHit["signal"], number>>;
  decisions: DecisionRecord[];
  lastAnswer?: { answer: ReviewAnswer; answeredAt: string };
}

const ANSWER_KEY = "processReviewAnswer";
const DECISION_LIMIT = 5;

/**
 * Reads what is already on this device (stored trades, check-ins, pauses) and runs the shared
 * detector over it. Nothing is invented: with no stored data every list is empty.
 */
export async function loadReview(
  db: ThehravDatabase,
  nowMs: number,
  decisionLimit: number = DECISION_LIMIT
): Promise<ReviewData> {
  const trades: Trade[] = (await db.trades.orderBy("timestamp").toArray()) as Trade[];
  const pact = getEffectivePact(await db.pacts.toArray(), nowMs) ?? DEFAULT_REPLAY_PACT;
  const flagged = replayHistory(trades, pact);

  const signalCounts: ReviewData["signalCounts"] = {};
  for (const item of flagged) {
    for (const hit of item.hits) signalCounts[hit.signal] = (signalCounts[hit.signal] ?? 0) + 1;
  }

  const checkIns = (await db.checkins.orderBy("timestamp").reverse().limit(decisionLimit).toArray()) as CheckIn[];
  const pauses = await db.pauses.toArray();
  const assessments = await db.riskAssessments.toArray();
  const decisions: DecisionRecord[] = checkIns.map((checkIn) => {
    // New records have an explicit link. Timestamp fallback keeps older local data readable.
    const pause = pauses.find((p) => p.checkInId === checkIn.id) ?? pauses.find((p) => p.startedAt === checkIn.timestamp);
    const assessment = pause && assessments.find((a) => a.assessmentId === pause.assessmentId);
    return { checkIn, tier: assessment?.tier ?? pause?.tier, outcome: pause?.outcome, pause, assessment };
  });

  const stored = await db.settings.get(ANSWER_KEY);
  const lastAnswer = isStoredAnswer(stored?.value) ? stored.value : undefined;

  return { totalTrades: trades.length, flagged, signalCounts, decisions, lastAnswer };
}

function isStoredAnswer(value: unknown): value is { answer: ReviewAnswer; answeredAt: string } {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { answer?: unknown; answeredAt?: unknown };
  return (candidate.answer === "followed" || candidate.answer === "breached") && typeof candidate.answeredAt === "string";
}

/** Local-only: the answer is kept in on-device settings and is never queued for sync. */
export async function saveReviewAnswer(db: ThehravDatabase, answer: ReviewAnswer, nowMs: number) {
  const record = { answer, answeredAt: new Date(nowMs).toISOString() };
  await db.settings.put({ key: ANSWER_KEY, value: record });
  return record;
}
