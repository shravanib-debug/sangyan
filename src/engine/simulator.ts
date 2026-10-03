import { createRng } from "./rng";

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
  numSteps: number;
  startPrincipal: number;
  leverage: number;
  mu: number; // expected drift
  sigma: number; // volatility
  dailyLossLimit: number; // absolute loss threshold to stop trading
}

/**
 * Monte Carlo simulator comparing baseline vs rule-bound cohorts.
 * The cohort view is an illustrative sensitivity simulation, never a personal forecast.
 */
export function simulateCohorts(input: CohortSimInput) {
  const rng = createRng(input.seed);
  
  let baseRuin = 0;
  let ruleRuin = 0;
  
  for (let p = 0; p < input.numPaths; p++) {
    let baseCapital = input.startPrincipal;
    let ruleCapital = input.startPrincipal;
    let ruleTrading = true;
    
    for (let s = 0; s < input.numSteps; s++) {
      // Box-Muller transform for standard normal distribution
      let u1 = rng.next();
      // Ensure u1 is > 0 to avoid Math.log(0)
      while (u1 === 0) u1 = rng.next();
      const u2 = rng.next();
      
      const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      
      const returnPct = input.mu + input.sigma * z0;
      
      // Leveraged return
      const plBase = input.leverage * baseCapital * returnPct;
      baseCapital += plBase;
      
      if (ruleTrading) {
        const plRule = input.leverage * ruleCapital * returnPct;
        ruleCapital += plRule;
        
        // If they breach their rule, they stop trading for the remainder of the simulation window
        if ((input.startPrincipal - ruleCapital) >= input.dailyLossLimit) {
          ruleTrading = false;
        }
      }
      
      if (baseCapital <= 0) {
        baseRuin++;
        break; // Baseline is wiped out; we stop processing this path for baseline
      }
    }
    
    if (ruleCapital <= 0) {
      ruleRuin++;
    }
  }

  return {
    baselineRuinProb: baseRuin / input.numPaths,
    ruleBoundRuinProb: ruleRuin / input.numPaths
  };
}
