import { WorkerDetectRequest, RiskResult, RiskTier } from "./types";
import { evaluateSignals } from "./signals";
import { evaluateMoneySource } from "./triage";
import { DEFAULT_ENGINE_CONFIG } from "../config/defaults";

export function evaluateRisk(request: WorkerDetectRequest): RiskResult {
  const config = request.config || DEFAULT_ENGINE_CONFIG;
  const hits = evaluateSignals(request);

  // Calculate raw score (sum of hit weights)
  let raw = 0;
  // Calculate max possible score for normalization
  const maxScore = Object.values(config.weights).reduce((sum, weight) => sum + weight, 0);

  for (const hit of hits) {
    // Look up weight from config
    const weight = config.weights[hit.signal] || 0;
    hit.contribution = weight;
    raw += weight;
  }

  const normalised = maxScore > 0 ? raw / maxScore : 0;

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
