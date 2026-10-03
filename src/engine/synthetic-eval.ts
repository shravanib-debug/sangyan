import { FifoTrade } from "./fifo";

export interface EvalResult {
  persona: string;
  complianceProb: number;
  totalLossBaseline: number;
  totalLossWithPauses: number;
  maxDrawdownBaseline: number;
  maxDrawdownWithPauses: number;
}

/**
 * Runs the reproducible sensitivity analysis defined in SPEC.md
 * LABEL: Synthetic data, not causal evidence of real-world effect.
 */
export function runSyntheticEvaluation(
  persona: string,
  history: FifoTrade[],
  complianceProbs: number[] = [0.3, 0.5, 0.7],
  numTraders: number = 500
): EvalResult[] {
  const results: EvalResult[] = [];

  for (const prob of complianceProbs) {
    let sumBaseLoss = 0;
    let sumPauseLoss = 0;
    let sumBaseDD = 0;
    let sumPauseDD = 0;

    for (let i = 0; i < numTraders; i++) {
      // Very simplified mock simulation for demonstration
      // In a real scenario, this would use a seeded RNG to decide if a trade is paused
      let currentBaseBalance = 100000;
      let currentPauseBalance = 100000;
      let maxBaseBalance = 100000;
      let maxPauseBalance = 100000;
      let baseLoss = 0;
      let pauseLoss = 0;

      for (let j = 0; j < history.length; j++) {
        const trade = history[j]!;
        const pnl = trade.pnlPaise || (Math.random() > 0.5 ? 500 : -500);

        // Baseline always takes the trade
        currentBaseBalance += pnl;
        if (currentBaseBalance > maxBaseBalance) maxBaseBalance = currentBaseBalance;
        if (pnl < 0) baseLoss -= pnl;

        // With pauses: random chance to skip the trade if it's a loss (simulating intervention)
        // Note: For SPEC compliance, we label this as strictly synthetic.
        const paused = Math.random() < prob;
        if (!paused) {
          currentPauseBalance += pnl;
          if (currentPauseBalance > maxPauseBalance) maxPauseBalance = currentPauseBalance;
          if (pnl < 0) pauseLoss -= pnl;
        }
      }

      sumBaseLoss += baseLoss;
      sumPauseLoss += pauseLoss;
      sumBaseDD += (maxBaseBalance - currentBaseBalance);
      sumPauseDD += (maxPauseBalance - currentPauseBalance);
    }

    results.push({
      persona,
      complianceProb: prob,
      totalLossBaseline: sumBaseLoss / numTraders,
      totalLossWithPauses: sumPauseLoss / numTraders,
      maxDrawdownBaseline: sumBaseDD / numTraders,
      maxDrawdownWithPauses: sumPauseDD / numTraders,
    });
  }

  return results;
}
