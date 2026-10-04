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

  // Check pact breaches for hard rules (breach of pact is an automatic lock if lockOnBreach is true, 
  // but in SPEC.md L3 is enforced if pre-committed).
  // If the user hit a breach signal, we check pact
  if (hits.some(h => h.signal === "pact_breach")) {
    // A pact breach is highly dangerous. 
    hardRuleTier = "L3";
    overrides.push("pact_breach_lock");
  }

  // Final tier is max of score tier and hard rule tier
  const finalTier = hardRuleTier > tierFromScore ? hardRuleTier : tierFromScore;

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
