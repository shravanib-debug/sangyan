import { DEFAULT_ENGINE_CONFIG } from "@/config/defaults";
import { evaluateRisk } from "@/engine/score";
import type { BrokerEvent, Pact, RiskResult } from "@/engine/types";

import { FILL_STATUSES, tradesFromEvents, type TradeEventRow } from "./history";

export interface PauseDraft {
  id: string;
  assessmentId: string;
  tier: RiskResult["tier"];
  startedAt: string;
  expiresAt: string | null;
}

export interface BrokerAssessment {
  result: RiskResult;
  pause: PauseDraft | null;
}

export const DEFAULT_PACT: Pact = {
  id: "00000000-0000-4000-8000-000000000000",
  dailyLossLimitPaise: 500_000,
  maximumTradesPerDay: 5,
  cooldownAfterLossMinutes: 30,
  blockedWindows: [{ startMinuteIst: 0, endMinuteIst: 360 }],
  blockBorrowedFunds: true,
  blockEmergencyFunds: true,
  revision: 0,
  effectiveAt: new Date(0).toISOString()
};

export function isFillEvent(event: Pick<BrokerEvent, "status">): boolean {
  return FILL_STATUSES.has(event.status.toUpperCase());
}

export function eventToRow(event: BrokerEvent): TradeEventRow {
  return {
    id: event.id,
    observed_at: event.observedAt,
    symbol: event.symbol ?? null,
    side: event.side ?? null,
    quantity: event.quantity ?? null,
    average_price_paise: event.averagePricePaise ?? null,
    provider_order_id: event.providerOrderId ?? null,
    status: event.status.toUpperCase()
  };
}

/**
 * Deterministic server-side verification of a broker event: pairs fills FIFO,
 * runs the shared engine at the event's observed time, and drafts the pause.
 */
export function assessBrokerEvent(input: {
  event: BrokerEvent;
  history: readonly TradeEventRow[];
  pact: Pact | null;
  newId: () => string;
}): BrokerAssessment {
  const pact = input.pact ?? DEFAULT_PACT;
  const rows = input.history.some((row) => row.id === input.event.id)
    ? [...input.history]
    : [...input.history, eventToRow(input.event)];
  const trades = tradesFromEvents(rows);
  const nowEpochMs = new Date(input.event.observedAt).getTime();

  const result = evaluateRisk({
    history: trades,
    pact,
    nowEpochMs,
    config: DEFAULT_ENGINE_CONFIG
  });
  result.assessmentId = input.newId();

  if (result.tier === "L0") return { result, pause: null };

  const expiresAt =
    result.tier === "L3" ? new Date(nowEpochMs + pact.cooldownAfterLossMinutes * 60_000).toISOString() : null;
  return {
    result,
    pause: {
      id: input.newId(),
      assessmentId: result.assessmentId,
      tier: result.tier,
      startedAt: result.evaluatedAt,
      expiresAt
    }
  };
}
