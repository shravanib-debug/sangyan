import { describe, it, expect } from "vitest";
import { evaluateMoneySource } from "../../src/engine/triage";

describe("Money Source Triage", () => {
  it("assigns correct multipliers and hard rules based on source", () => {
    const surplus = evaluateMoneySource({ source: "surplus", amountPaise: 100000 });
    expect(surplus.multiplier).toBe(0.0);
    expect(surplus.hardRuleTier).toBe("L0");

    const savings = evaluateMoneySource({ source: "savings", amountPaise: 100000 });
    expect(savings.multiplier).toBe(0.4);
    expect(savings.hardRuleTier).toBe("L0");

    const emergency = evaluateMoneySource({ source: "emergency_fund", amountPaise: 100000 });
    expect(emergency.multiplier).toBe(0.8);
    expect(emergency.hardRuleTier).toBe("L1");

    const borrowed = evaluateMoneySource({ source: "borrowed", amountPaise: 100000 });
    expect(borrowed.multiplier).toBe(1.0);
    expect(borrowed.hardRuleTier).toBe("L2");
  });

  describe("Emergency runway", () => {
    it("calculates runway correctly", () => {
      const res = evaluateMoneySource({
        source: "emergency_fund",
        amountPaise: 5000000, // 50k INR
        emergencyFundBalancePaise: 15000000, // 150k INR
        monthlyExpensesPaise: 3000000 // 30k INR
      });
      // runwayBefore = 150k / 30k = 5 months
      // runwayWorst = (150k - 50k) / 30k = 100k / 30k = 3.33 months
      expect(res.runwayBeforeMonths).toBeCloseTo(5);
      expect(res.runwayWorstMonths).toBeCloseTo(3.333, 3);
    });

    it("handles zero expense safely without throwing or giving advice", () => {
      const res = evaluateMoneySource({
        source: "emergency_fund",
        amountPaise: 5000,
        emergencyFundBalancePaise: 10000,
        monthlyExpensesPaise: 0
      });
      expect(res.runwayBeforeMonths).toBe(Infinity);
      expect(res.runwayWorstMonths).toBe(Infinity);
    });

    it("handles amount above fund cleanly", () => {
      const res = evaluateMoneySource({
        source: "emergency_fund",
        amountPaise: 20000,
        emergencyFundBalancePaise: 10000,
        monthlyExpensesPaise: 5000
      });
      expect(res.runwayBeforeMonths).toBe(2);
      expect(res.runwayWorstMonths).toBe(0); // Should be max(0, -2) = 0
    });
  });

  describe("Borrowing break-even", () => {
    it("calculates break-even return required", () => {
      const res = evaluateMoneySource({
        source: "borrowed",
        amountPaise: 10000,
        annualInterestRate: 0.12, // 12%
        horizonYears: 2
      });
      // rStar = (1 + 0.12)^2 - 1 = 1.2544 - 1 = 0.2544 (25.44%)
      expect(res.borrowingBreakEvenRate).toBeCloseTo(0.2544, 4);
    });

    it("handles short horizon (e.g., a few days as fraction of year)", () => {
      const res = evaluateMoneySource({
        source: "borrowed",
        amountPaise: 10000,
        annualInterestRate: 0.36,
        horizonYears: 7 / 365
      });
      // very short horizon should just compute cleanly
      expect(res.borrowingBreakEvenRate).toBeCloseTo(Math.pow(1.36, 7/365) - 1, 6);
    });

    it("handles invalid inputs without advice wording (e.g. negative time)", () => {
      const res = evaluateMoneySource({
        source: "borrowed",
        amountPaise: 10000,
        annualInterestRate: 0.10,
        horizonYears: -1
      });
      expect(res.borrowingBreakEvenRate).toBeNaN();
    });
  });
});
