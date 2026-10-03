export interface MetricsInput {
  honouredPauses: number;
  shownPauses: number;
  tier2OrHigherEvents: number;
  evaluatedEvents: number;
  checkInsWithJournal: number;
  checkIns: number;
  adheredDays: number;
  evaluatedDays: number;
}

export interface MetricsResult {
  PHR: number | "unavailable";
  II: number | "unavailable";
  JC: number | "unavailable";
  RA: number | "unavailable";
  BRS: number | "unavailable";
}

export function calculateMetrics(input: MetricsInput): MetricsResult {
  const PHR = input.shownPauses > 0 ? input.honouredPauses / input.shownPauses : "unavailable";
  const II = input.evaluatedEvents > 0 ? input.tier2OrHigherEvents / input.evaluatedEvents : "unavailable";
  const JC = input.checkIns > 0 ? input.checkInsWithJournal / input.checkIns : "unavailable";
  const RA = input.evaluatedDays > 0 ? input.adheredDays / input.evaluatedDays : "unavailable";

  let BRS: number | "unavailable" = "unavailable";
  
  if (PHR !== "unavailable" && II !== "unavailable" && JC !== "unavailable" && RA !== "unavailable") {
    BRS = 100 * (0.35 * PHR + 0.25 * RA + 0.20 * (1 - II) + 0.20 * JC);
  }

  return { PHR, II, JC, RA, BRS };
}

export function calculateRetrospectiveDifference(replayPnLPaise: number, actualPnLPaise: number): number {
  return replayPnLPaise - actualPnLPaise;
}
