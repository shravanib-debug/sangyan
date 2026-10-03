import type { EngineConfig } from "@/engine/types";

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  version: "2026-10-03.phase0",
  weights: {
    revenge: 0.22,
    overtrade: 0.16,
    late_night: 0.1,
    loss_hold: 0.12,
    pact_breach: 0.2,
    money_source: 0.2
  },
  tiers: {
    l1: 0.25,
    l2: 0.5,
    l3: 0.8
  }
};

export function assertValidEngineConfig(config: EngineConfig): void {
  const total = Object.values(config.weights).reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(total - 1) > Number.EPSILON * 10) {
    throw new Error("Engine weights must sum to 1.");
  }
}
