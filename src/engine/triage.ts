import { FundSource, RiskTier } from "./types";

export interface TriageInput {
  source: FundSource;
  amountPaise: number;
  
  // For emergency fund
  emergencyFundBalancePaise?: number;
  monthlyExpensesPaise?: number;
  
  // For borrowed
  annualInterestRate?: number; // e.g. 0.15 for 15%
  horizonYears?: number;
}

export interface TriageResult {
  multiplier: number;
  hardRuleTier: RiskTier;
  
  // Optional detailed fields
  runwayBeforeMonths?: number;
  runwayWorstMonths?: number;
  borrowingBreakEvenRate?: number; // the total return needed to break even
}

export function evaluateMoneySource(input: TriageInput): TriageResult {
  let multiplier = 0;
  let hardRuleTier: RiskTier = "L0";

  switch (input.source) {
    case "surplus":
      multiplier = 0.0;
      break;
    case "savings":
      multiplier = 0.4;
      break;
    case "emergency_fund":
      multiplier = 0.8;
      hardRuleTier = "L1";
      break;
    case "borrowed":
      multiplier = 1.0;
      hardRuleTier = "L2";
      break;
  }

  const result: TriageResult = { multiplier, hardRuleTier };

  // Emergency runway calculation
  if (input.source === "emergency_fund" && input.emergencyFundBalancePaise !== undefined && input.monthlyExpensesPaise !== undefined) {
    const { emergencyFundBalancePaise: E, monthlyExpensesPaise: M, amountPaise: P } = input;
    if (M <= 0) {
      // zero expense edge case
      result.runwayBeforeMonths = Infinity;
      result.runwayWorstMonths = Infinity;
    } else {
      result.runwayBeforeMonths = Math.max(0, E / M);
      result.runwayWorstMonths = Math.max(0, (E - P) / M);
    }
  }

  // Borrowing break-even calculation
  if (input.source === "borrowed" && input.annualInterestRate !== undefined && input.horizonYears !== undefined) {
    const { annualInterestRate: i, horizonYears: T } = input;
    if (T < 0 || i < 0) {
      // Invalid input case
      result.borrowingBreakEvenRate = NaN;
    } else {
      result.borrowingBreakEvenRate = Math.pow(1 + i, T) - 1;
    }
  }

  return result;
}
