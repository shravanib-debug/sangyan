import type { EngineConfig } from "@/engine/types";

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  version: "2026-10-03.phase1",
  weights: {
    revenge: 0.25,
    overtrade: 0.10,
    late_night: 0.10,
    loss_hold: 0.05,
    pact_breach: 0.25,
    money_source: 0.25
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

/** Friction ladder durations. L3 lasts until the Pact cooldown elapses. */
export const PAUSE_POLICY = {
  l1Seconds: 10,
  l2Seconds: 120
} as const;

/** Loosening a Pact only takes effect after this server-authoritative delay. */
export const PACT_LOOSEN_DELAY_MS = 24 * 60 * 60 * 1000;
