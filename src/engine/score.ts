import { WorkerDetectRequest, RiskResult, RiskTier } from "./types";
import { evaluateSignals } from "./signals";
import { evaluateMoneySource } from "./triage";
import { CHECKIN_RULES, DEFAULT_ENGINE_CONFIG } from "../config/defaults";

export function evaluateRisk(request: WorkerDetectRequest): RiskResult {
  const config = request.config || DEFAULT_ENGINE_CONFIG;
  const hits = evaluateSignals(request);

  // Calculate raw score (sum of hit weights)
  let raw = 0;
  // Calculate max possible score for normalization
  const maxScore = Object.values(config.weights).reduce((sum, weight) => sum + weight, 0);

  for (const hit of hits) {
    // Look up weight from config. Money source is graded by its triage strength
    // (SPEC §8.4: weight[k] * signal[k]); every other signal is on/off.
    const weight = config.weights[hit.signal] || 0;
    const strength =
      hit.signal === "money_source" && request.checkIn
        ? evaluateMoneySource({ source: request.checkIn.fundSource, amountPaise: request.checkIn.amountPaise }).multiplier
        : 1;
    hit.contribution = weight * strength;
    raw += hit.contribution;
  }

  // Rounded so binary float sums land on the SPEC §8.4 boundaries (0.25+0.10+0.10+0.05 is 0.49999999999999994).
  const normalised = maxScore > 0 ? Math.round((raw / maxScore) * 1e9) / 1e9 : 0;

  // Determine tier from score
  let tierFromScore: RiskTier = "L0";
  if (normalised >= config.tiers.l3) tierFromScore = "L3";
  else if (normalised >= config.tiers.l2) tierFromScore = "L2";
  else if (normalised >= config.tiers.l1) tierFromScore = "L1";

  // Determine hard rule tier
  let hardRuleTier: RiskTier = "L0";
  const overrides: string[] = [];

  // Check money source triage for hard rules
  if (request.checkIn) {
    const triage = evaluateMoneySource({
      source: request.checkIn.fundSource,
      amountPaise: request.checkIn.amountPaise
    });
    if (triage.hardRuleTier > hardRuleTier) {
      hardRuleTier = triage.hardRuleTier;
      overrides.push(`money_source_${request.checkIn.fundSource}`);
    }
  }

  // Check-in plan floors: what the user told us about this decision sets a minimum level.
  if (request.checkIn) {
    for (const trigger of request.checkIn.triggers ?? []) {
      if ((CHECKIN_RULES.floorTriggers as readonly string[]).includes(trigger)) {
        if ("L1" > hardRuleTier) hardRuleTier = "L1";
        overrides.push(`plan_trigger_${trigger}`);
      }
    }
    const riskyContext = request.checkIn.horizon === "intraday" || request.checkIn.fundSource === "borrowed";
    if (request.checkIn.exitPlan === "undecided" && riskyContext) {
      if (CHECKIN_RULES.undecidedExitFloor > hardRuleTier) hardRuleTier = CHECKIN_RULES.undecidedExitFloor;
      overrides.push("plan_no_exit");
    }
  }

  const sourceBlockedByPact = Boolean(
    request.pactCommitted &&
      request.checkIn &&
      ((request.checkIn.fundSource === "borrowed" && request.pact.blockBorrowedFunds) ||
        (request.checkIn.fundSource === "emergency_fund" && request.pact.blockEmergencyFunds))
  );
  const committedPactBreach =
    request.pactCommitted && (sourceBlockedByPact || hits.some((hit) => hit.signal === "pact_breach"));

  // L3 is an enforcement tier, so it requires a breached rule from a Pact the user
  // explicitly saved. Fallback defaults can still inform and pause, but never lock.
  if (committedPactBreach) {
    hardRuleTier = "L3";
    overrides.push("pact_breach_lock");
  }

  // Final tier is max of score tier and hard rule tier
  let finalTier = hardRuleTier > tierFromScore ? hardRuleTier : tierFromScore;
  if (finalTier === "L3" && !committedPactBreach) finalTier = "L2";

  return {
    assessmentId: crypto.randomUUID ? crypto.randomUUID() : "test-id", // basic polyfill for testing
    score: normalised,
    tier: finalTier,
    signalHits: hits,
    hardRuleOverrides: overrides,
    engineVersion: config.version,
    configVersion: config.version,
    evaluatedAt: new Date(request.nowEpochMs).toISOString()
  };
}
