import { DEFAULT_ENGINE_CONFIG } from "@/config/defaults";
import { evaluateSignals } from "@/engine/signals";
import type { Pact, SignalHit, Trade } from "@/engine/types";

export interface FlaggedTrade<T extends Trade = Trade> {
  trade: T;
  hits: SignalHit[];
}

/** Used for retrospective replay when the user has not set a Pact yet. */
export const DEFAULT_REPLAY_PACT: Pact = {
  id: "default",
  userId: "local",
  dailyLossLimitPaise: 500000,
  maximumTradesPerDay: 5,
  cooldownAfterLossMinutes: 15,
  blockBorrowedFunds: true,
  blockEmergencyFunds: true,
  blockedWindows: [],
  revision: 1,
  effectiveAt: new Date(0).toISOString()
};

/**
 * Retrospective replay: runs the shared detector as of each trade, over the history up to
 * and including it. Returns only the trades where at least one signal fired, oldest first.
 */
export function replayHistory<T extends Trade>(
  trades: readonly T[],
  pact: Pact,
  pactCommitted: boolean
): FlaggedTrade<T>[] {
  const flagged: FlaggedTrade<T>[] = [];
  const historySoFar: T[] = [];
  for (const trade of trades) {
    historySoFar.push(trade);
    const hits = evaluateSignals({
      pact,
      pactCommitted,
      history: historySoFar,
      nowEpochMs: new Date(trade.timestamp).getTime(),
      checkIn: undefined,
      config: DEFAULT_ENGINE_CONFIG
    });
    if (hits.length > 0) flagged.push({ trade, hits });
  }
  return flagged;
}
