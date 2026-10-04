import type { EngineConfig } from "@/engine/types";

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  version: "2026-10-03.phase1",
  weights: {
    revenge: 0.25,
    overtrade: 0.10,
    late_night: 0.10,
    loss_hold: 0.05,
    pact_breach: 0.25,
    money_source: 0.25,
    // Explanatory only: shown as a reason, adds nothing to the score.
    size_escalation: 0
  },
  tiers: {
    l1: 0.25,
    l2: 0.50,
    l3: 0.75
  }
};

export function assertValidEngineConfig(config: EngineConfig): void {
  const total = Object.values(config.weights).reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(total - 1) > Number.EPSILON * 10) {
    throw new Error("Engine weights must sum to 1.");
  }
}

/** Check-in rules that set a minimum pause level (like the money-source hard rules). */
export const CHECKIN_RULES = {
  /** Self-reported triggers that always get at least an L1 pause. */
  floorTriggers: ["recover_loss", "tip", "fomo"],
  /** No exit plan gets at least L1 when the trade is intraday or uses borrowed money. */
  undecidedExitFloor: "L1"
} as const;

/** "Bigger than your usual": amount vs the median of your recent positions. */
export const SIZE_ESCALATION = {
  multiple: 2,
  lookbackTrades: 10,
  minimumTrades: 5
} as const;

/** Friction ladder durations. L3 lasts until the Pact cooldown elapses. */
export const PAUSE_POLICY = {
  l1Seconds: 10,
  l2Seconds: 120
} as const;

/** Loosening a Pact only takes effect after this server-authoritative delay. */
export const PACT_LOOSEN_DELAY_MS = 24 * 60 * 60 * 1000;
