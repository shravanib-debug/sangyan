import { describe, it, expect } from "vitest";
import { calculateFeeDrag, leverageWipeOutThreshold, barrierRuinProbability, simulateCohorts, simulatePath } from "../../src/engine/simulator";
import { createRng } from "../../src/engine/rng";

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

    it("confirms baseline ruin probability > rule-bound ruin probability across the UI range", () => {
      // Under extreme daily volatility (e.g. 15%), re-entering at full leverage each day after a stop
      // can raise rule-bound ruin above baseline; that is a real model outcome, so this checks the UI range.
      const input = {
        seed: 12345,
        numPaths: 2000,
        numSteps: 30,
        startPrincipal: 100000,
        leverage: 8,
        mu: 0.0005,
        sigma: 0.03,
        dailyLossLimit: 5000
      };

      const result = simulateCohorts(input);

      expect(result.baselineRuinProb).toBeGreaterThan(result.ruleBoundRuinProb);
      expect(result.baselineRuinProb).toBeGreaterThan(0);
    });

    it("changes only the outputs that mathematically depend on each UI input", () => {
      const base = {
        seed: 12345,
        numPaths: 2000,
        numSteps: 30,
        startPrincipal: 100000,
        leverage: 8,
        mu: 0.0005,
        sigma: 0.05,
        dailyLossLimit: 20000
      };
      const original = simulateCohorts(base);
      const moreCapital = simulateCohorts({ ...base, startPrincipal: 200000 });
      const lowerLeverage = simulateCohorts({ ...base, leverage: 4 });
      const tighterLimit = simulateCohorts({ ...base, dailyLossLimit: 5000 });
      const lowerVolatility = simulateCohorts({ ...base, sigma: 0.02 });

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

  describe("entry-price barrier and daily loss limit (SPEC §8.6)", () => {
    const ui = {
      seed: 7,
      numPaths: 2000,
      numSteps: 30,
      startPrincipal: 100000,
      leverage: 4,
      mu: 0.0005,
      sigma: 0.025,
      dailyLossLimit: 5000
    };

    it("produces identical results for a fixed seed and different results for another seed", () => {
      expect(simulateCohorts(ui)).toEqual(simulateCohorts(ui));
      expect(simulateCohorts({ ...ui, seed: 8 })).not.toEqual(simulateCohorts(ui));
    });

    it("higher leverage increases wipeout exposure", () => {
      const l1 = simulateCohorts({ ...ui, leverage: 1 });
      const l4 = simulateCohorts({ ...ui, leverage: 4 });
      const l10 = simulateCohorts({ ...ui, leverage: 10 });
      expect(l4.baselineRuinProb).toBeGreaterThan(l1.baselineRuinProb);
      expect(l10.baselineRuinProb).toBeGreaterThan(l4.baselineRuinProb);
      expect(l10.baselineAvgWorstDayLoss).toBeGreaterThan(l4.baselineAvgWorstDayLoss);
      expect(l4.baselineAvgWorstDayLoss).toBeGreaterThan(l1.baselineAvgWorstDayLoss);
    });

    it("higher volatility increases wipeout exposure", () => {
      const low = simulateCohorts({ ...ui, sigma: 0.01 });
      const mid = simulateCohorts({ ...ui, sigma: 0.025 });
      const high = simulateCohorts({ ...ui, sigma: 0.05 });
      expect(mid.baselineRuinProb).toBeGreaterThan(low.baselineRuinProb);
      expect(high.baselineRuinProb).toBeGreaterThan(mid.baselineRuinProb);
      expect(high.baselineAvgWorstDayLoss).toBeGreaterThan(low.baselineAvgWorstDayLoss);
    });

    it("tracks the barrier approximation within discrete-monitoring tolerance", () => {
      const r = simulateCohorts({ ...ui, leverage: 10, mu: 0 });
      const approx = barrierRuinProbability(10, 0.025, 30);
      // Discrete checkpoints and log returns make the MC slightly lower than the continuous approximation.
      expect(r.baselineRuinProb).toBeLessThanOrEqual(approx);
      expect(r.baselineRuinProb).toBeGreaterThan(approx * 0.6);
    });

    it("a wipeout needs the market move from entry to reach -1/leverage", () => {
      const path = simulatePath({ ...ui, numPaths: 1, leverage: 1 }, createRng(1));
      expect(path.baseline.ruined).toBe(false);
    });

    it("lower daily loss limits reduce losses in the rule-bound cohort", () => {
      const tight = simulateCohorts({ ...ui, dailyLossLimit: 2000 });
      const medium = simulateCohorts({ ...ui, dailyLossLimit: 5000 });
      const loose = simulateCohorts({ ...ui, dailyLossLimit: 20000 });
      expect(tight.ruleBoundAvgWorstDayLoss).toBeLessThan(medium.ruleBoundAvgWorstDayLoss);
      expect(medium.ruleBoundAvgWorstDayLoss).toBeLessThan(loose.ruleBoundAvgWorstDayLoss);
      expect(tight.ruleBoundRuinProb).toBeLessThanOrEqual(loose.ruleBoundRuinProb);
      // The baseline has no rule, so the limit cannot change it.
      expect(tight.baselineRuinProb).toBe(loose.baselineRuinProb);
      expect(tight.baselineAvgWorstDayLoss).toBe(loose.baselineAvgWorstDayLoss);
    });

    it("applies the limit to the loss within each day, not cumulative loss", () => {
      // A small limit stops trading for the day, but the cohort re-enters the next day.
      const rng = createRng(3);
      const path = simulatePath({ ...ui, dailyLossLimit: 500 }, rng);
      expect(path.ruleBound.daysTraded).toBe(ui.numSteps);
      expect(path.ruleBound.finalCapital).not.toBe(ui.startPrincipal);
    });

    it("simulates the two cohorts independently", () => {
      // An unreachable limit makes the rule-bound cohort trade exactly like the baseline.
      const noLimit = simulateCohorts({ ...ui, leverage: 10, dailyLossLimit: Number.POSITIVE_INFINITY });
      expect(noLimit.ruleBoundRuinProb).toBe(noLimit.baselineRuinProb);
      expect(noLimit.ruleBoundAvgWorstDayLoss).toBe(noLimit.baselineAvgWorstDayLoss);

      // A baseline wipeout must not stop the rule-bound cohort from trading later days.
      const rng = createRng(ui.seed);
      let checked = 0;
      for (let p = 0; p < 500; p++) {
        const { baseline, ruleBound } = simulatePath({ ...ui, leverage: 10 }, rng);
        if (baseline.ruined && baseline.ruinDay! < ui.numSteps - 1 && !ruleBound.ruined) {
          expect(ruleBound.daysTraded).toBe(ui.numSteps);
          expect(baseline.daysTraded).toBe(baseline.ruinDay! + 1);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(0);
    });
  });
});
