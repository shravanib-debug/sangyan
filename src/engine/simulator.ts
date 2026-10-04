import { createRng } from "./rng";
import type { Rng } from "./types";

/**
 * Calculates the exact fee drag after n round trips.
 * A[n] = P * (1 + r - f)^n
 */
export function calculateFeeDrag(principal: number, avgReturn: number, fee: number, nTrades: number): number {
  return principal * Math.pow(1 + avgReturn - fee, nTrades);
}

/**
 * Calculates the leverage wipe-out threshold.
 * Wipe-out occurs when the asset moves against you by this fraction.
 */
export function leverageWipeOutThreshold(leverage: number): number {
  if (leverage <= 0) return -1;
  return -1 / leverage;
}

/**
 * Standard Normal cumulative distribution function (Phi)
 * Using the accurate fractional approximation.
 */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/**
 * Barrier approximation for ruin probability over T time or trades
 * 2 * Phi(-(1/L) / (sigma * sqrt(T)))
 */
export function barrierRuinProbability(leverage: number, volatility: number, T: number): number {
  if (leverage <= 0 || volatility <= 0 || T <= 0) return 0;
  const wipeOut = 1 / leverage;
  const denom = volatility * Math.sqrt(T);
  return 2 * normalCdf(-wipeOut / denom);
}

export interface CohortSimInput {
  seed: number;
  numPaths: number;
  numSteps: number; // trading days
  startPrincipal: number;
  leverage: number;
  mu: number; // expected daily drift
  sigma: number; // daily volatility
  dailyLossLimit: number; // absolute loss within one day that stops trading for the rest of that day
  stepsPerDay?: number; // intraday checkpoints for the barrier and the loss limit
}

export interface CohortPathResult {
  ruined: boolean;
  ruinDay: number | null;
  finalCapital: number;
  worstDayLoss: number;
  daysTraded: number;
}

export interface PathResult {
  baseline: CohortPathResult;
  ruleBound: CohortPathResult;
}

export const DEFAULT_STEPS_PER_DAY = 8;

function standardNormal(rng: Rng): number {
  // Box-Muller; u1 must be > 0 to avoid Math.log(0)
  let u1 = rng.next();
  while (u1 === 0) u1 = rng.next();
  const u2 = rng.next();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * One market path, two cohorts trading it independently (SPEC §8.6).
 *
 * Both cohorts open a position of `leverage x capital` at the entry price. A position is
 * wiped out when the market move from its entry price reaches `-1 / leverage`.
 * - Baseline: holds the day-0 position for the whole window, no rules.
 * - Rule-bound: same position, but once the loss since the day's open reaches
 *   `dailyLossLimit` it closes and stays flat for the rest of that day. It re-enters at
 *   the next day's open with `leverage x remaining capital`.
 * Checks run at intraday checkpoints, so a gap between checkpoints can overshoot the
 * limit; capital is floored at zero at wipeout.
 * The market path is drawn in full regardless of either cohort's state, so a baseline
 * wipeout never alters the rule-bound cohort's path.
 */
export function simulatePath(input: CohortSimInput, rng: Rng): PathResult {
  const steps = input.stepsPerDay ?? DEFAULT_STEPS_PER_DAY;
  const stepMu = input.mu / steps;
  const stepSigma = input.sigma / Math.sqrt(steps);
  const barrier = leverageWipeOutThreshold(input.leverage);
  const P = input.startPrincipal;
  const L = input.leverage;

  let price = 1;

  const base: CohortPathResult = { ruined: false, ruinDay: null, finalCapital: P, worstDayLoss: 0, daysTraded: 0 };
  const baseEntry = 1;

  const rule: CohortPathResult = { ruined: false, ruinDay: null, finalCapital: P, worstDayLoss: 0, daysTraded: 0 };
  let ruleEntryPrice = 1;
  let ruleEntryCapital = P;
  let ruleInPosition = true;

  for (let d = 0; d < input.numSteps; d++) {
    if (!rule.ruined && !ruleInPosition) {
      ruleEntryPrice = price;
      ruleEntryCapital = rule.finalCapital;
      ruleInPosition = true;
    }
    const baseDayStart = base.finalCapital;
    const ruleDayStart = rule.finalCapital;
    if (!base.ruined) base.daysTraded++;
    if (!rule.ruined) rule.daysTraded++;

    for (let k = 0; k < steps; k++) {
      price *= Math.exp(stepMu + stepSigma * standardNormal(rng));

      if (!base.ruined) {
        const move = price / baseEntry - 1;
        if (move <= barrier) {
          base.ruined = true;
          base.ruinDay = d;
          base.finalCapital = 0;
        } else {
          base.finalCapital = P * (1 + L * move);
        }
      }

      if (!rule.ruined && ruleInPosition) {
        const move = price / ruleEntryPrice - 1;
        if (move <= barrier) {
          rule.ruined = true;
          rule.ruinDay = d;
          rule.finalCapital = 0;
          ruleInPosition = false;
        } else {
          rule.finalCapital = ruleEntryCapital * (1 + L * move);
          if (ruleDayStart - rule.finalCapital >= input.dailyLossLimit) {
            ruleInPosition = false;
          }
        }
      }
    }

    base.worstDayLoss = Math.max(base.worstDayLoss, baseDayStart - base.finalCapital);
    rule.worstDayLoss = Math.max(rule.worstDayLoss, ruleDayStart - rule.finalCapital);
  }

  return { baseline: base, ruleBound: rule };
}

/**
 * Monte Carlo simulator comparing baseline vs rule-bound cohorts.
 * The cohort view is an illustrative sensitivity simulation, never a personal forecast.
 * Returns are seeded random normal draws; the historical bootstrap in SPEC §8.6 is not implemented yet.
 */
export function simulateCohorts(input: CohortSimInput) {
  const rng = createRng(input.seed);
  let baseRuin = 0;
  let ruleRuin = 0;
  let baseWorstDay = 0;
  let ruleWorstDay = 0;

  for (let p = 0; p < input.numPaths; p++) {
    const { baseline, ruleBound } = simulatePath(input, rng);
    if (baseline.ruined) baseRuin++;
    if (ruleBound.ruined) ruleRuin++;
    baseWorstDay += baseline.worstDayLoss;
    ruleWorstDay += ruleBound.worstDayLoss;
  }

  return {
    baselineRuinProb: baseRuin / input.numPaths,
    ruleBoundRuinProb: ruleRuin / input.numPaths,
    baselineAvgWorstDayLoss: baseWorstDay / input.numPaths,
    ruleBoundAvgWorstDayLoss: ruleWorstDay / input.numPaths
  };
}
