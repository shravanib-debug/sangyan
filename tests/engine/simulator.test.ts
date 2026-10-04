import { describe, it, expect } from "vitest";
import { calculateFeeDrag, leverageWipeOutThreshold, barrierRuinProbability, simulateCohorts } from "../../src/engine/simulator";

describe("Consequence Simulator", () => {
  it("calculates exact fee drag", () => {
    // 100000 principal, 5% return, 1% fee, 10 trades
    // A[10] = 100000 * (1 + 0.05 - 0.01)^10 = 100000 * 1.04^10 = 148024.428...
    const result = calculateFeeDrag(100000, 0.05, 0.01, 10);
    expect(result).toBeCloseTo(148024.428, 2);
  });

  it("calculates leverage wipe-out threshold", () => {
    // Leverage 5x means 20% against you wipes you out (-1/5)
    expect(leverageWipeOutThreshold(5)).toBe(-0.2);
    expect(leverageWipeOutThreshold(10)).toBe(-0.1);
  });

  it("calculates barrier ruin approximation", () => {
    // L = 5, sigma = 0.02, T = 100
    // wipeOut = 1/5 = 0.2
    // denom = 0.02 * 10 = 0.2
    // Phi(-1) = ~0.15865, so 2 * Phi(-1) = 0.3173
    const prob = barrierRuinProbability(5, 0.02, 100);
    expect(prob).toBeCloseTo(0.3173, 3);
  });

  describe("Monte Carlo cohorts", () => {
    it("is reproducible deterministically with the same seed", () => {
      const input = {
        seed: 42,
        numPaths: 1000,
        numSteps: 50,
        startPrincipal: 100000,
        leverage: 5,
        mu: -0.001, // slight negative drift
        sigma: 0.02, // 2% volatility per step
        dailyLossLimit: 20000 // stop if they lose 20k
      };

      const run1 = simulateCohorts(input);
      const run2 = simulateCohorts(input);

      expect(run1.baselineRuinProb).toBe(run2.baselineRuinProb);
      expect(run1.ruleBoundRuinProb).toBe(run2.ruleBoundRuinProb);
    });

    it("confirms baseline ruin probability > rule-bound ruin probability", () => {
      const input = {
        seed: 12345,
        numPaths: 5000,
        numSteps: 100,
        startPrincipal: 100000,
        leverage: 8,
        mu: -0.005,
        sigma: 0.15, // 15% volatility per step to ensure some paths hit -12.5% in a single step
        dailyLossLimit: 15000
      };

      const result = simulateCohorts(input);

      // Baseline doesn't stop, rule-bound stops if they hit 15k loss limit
      // Therefore, rule-bound should have significantly lower ruin probability
      expect(result.baselineRuinProb).toBeGreaterThan(result.ruleBoundRuinProb);
      // Ensure we got non-zero values
      expect(result.baselineRuinProb).toBeGreaterThan(0);
    });

    it("changes only the outputs that mathematically depend on each UI input", () => {
      const base = {
        seed: 12345,
        numPaths: 5000,
        numSteps: 100,
        startPrincipal: 100000,
        leverage: 8,
        mu: -0.005,
        sigma: 0.15,
        dailyLossLimit: 15000
      };
      const original = simulateCohorts(base);
      const moreCapital = simulateCohorts({ ...base, startPrincipal: 200000 });
      const lowerLeverage = simulateCohorts({ ...base, leverage: 4 });
      const tighterLimit = simulateCohorts({ ...base, dailyLossLimit: 5000 });
      const lowerVolatility = simulateCohorts({ ...base, sigma: 0.05 });

      // Scaling starting capital cannot change percentage baseline ruin, but the
      // absolute daily-loss limit becomes relatively tighter for the rule cohort.
      expect(moreCapital.baselineRuinProb).toBe(original.baselineRuinProb);
      expect(moreCapital.ruleBoundRuinProb).not.toBe(original.ruleBoundRuinProb);

      expect(lowerLeverage.baselineRuinProb).not.toBe(original.baselineRuinProb);
      expect(lowerLeverage.ruleBoundRuinProb).not.toBe(original.ruleBoundRuinProb);

      // The baseline cohort has no loss-limit rule.
      expect(tighterLimit.baselineRuinProb).toBe(original.baselineRuinProb);
      expect(tighterLimit.ruleBoundRuinProb).not.toBe(original.ruleBoundRuinProb);

      expect(lowerVolatility.baselineRuinProb).not.toBe(original.baselineRuinProb);
      expect(lowerVolatility.ruleBoundRuinProb).not.toBe(original.ruleBoundRuinProb);
    });
  });
});
