import { expect, test } from "vitest";
import { runSyntheticEvaluation } from "./synthetic-eval";
import { FifoTrade } from "./fifo";

test("runs synthetic evaluation and returns probabilities", () => {
  const dummyHistory: FifoTrade[] = [
    { id: "1", timestamp: new Date().toISOString(), symbol: "A", side: "buy", quantity: 1, pricePaise: 100, source: "synthetic", pnlPaise: -500 },
    { id: "2", timestamp: new Date().toISOString(), symbol: "A", side: "buy", quantity: 1, pricePaise: 100, source: "synthetic", pnlPaise: -1000 },
  ];

  const results = runSyntheticEvaluation("loss-averse", dummyHistory, [0.3, 0.5, 0.7], 100);
  
  expect(results.length).toBe(3);
  expect(results[0]?.complianceProb).toBe(0.3);
  expect(results[1]?.complianceProb).toBe(0.5);
  expect(results[2]?.complianceProb).toBe(0.7);

  // Since it uses Math.random (seeded ideally, but random here), we just check presence
  expect(results[0]?.totalLossBaseline).toBeGreaterThan(0);
});
