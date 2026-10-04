import type { PauseEvent, PauseOutcome, RiskResult, RiskTier, SignalHit } from "@/engine/types";
import { getEffectivePact } from "@/engine/pact";
import type { ThehravDatabase } from "@/storage/local/database";

import { pauseExpiry } from "./checkin-service";

export function remainingSeconds(pause: Pick<PauseEvent, "expiresAt">, nowMs: number): number {
  if (!pause.expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(pause.expiresAt).getTime() - nowMs) / 1000));
}

export interface PauseView {
  pause: PauseEvent;
  assessment: RiskResult;
  simulated: boolean;
}

export async function loadLocalPause(db: ThehravDatabase, pauseId: string): Promise<PauseView | null> {
  const pause = await db.pauses.get(pauseId);
  if (!pause) return null;
  const assessment = await db.riskAssessments.get(pause.assessmentId);
  return assessment ? { pause, assessment, simulated: false } : null;
}

interface RemotePauseResponse {
  pause: {
    id: string;
    assessment_id: string;
    tier: RiskTier;
    started_at: string;
    expires_at: string | null;
    outcome: PauseOutcome;
    revision: number | string;
  };
  assessment: {
    id: string;
    score: number | string;
    tier: RiskTier;
    signal_hits: SignalHit[];
    hard_rule_overrides: string[];
    engine_version: string;
    config_version: string;
    evaluated_at: string;
  };
  simulated: boolean;
}

/**
 * A pause created by a broker event only exists on the server. Opening it (from a push
 * or the in-app inbox) fetches the protected explanation and caches it for offline use.
 */
async function requestRemotePause(pauseId: string, fetchImpl: typeof fetch): Promise<RemotePauseResponse | null> {
  try {
    const response = await fetchImpl(`/api/pauses/${encodeURIComponent(pauseId)}`, { cache: "no-store" });
    return response.ok ? ((await response.json()) as RemotePauseResponse) : null;
  } catch {
    return null;
  }
}

/**
 * The server re-checks every synced check-in on its own history and Pact. When its level
 * is stricter than the one shown on this device, the stricter result wins (conflicts
 * resolve to stricter, ADR-7): the local pause takes the server's tier, explanation and a
 * re-derived expiry. The user's decision on this device is kept. Returns the updated view.
 */
export async function adoptStricterServerResult(
  db: ThehravDatabase,
  pauseId: string,
  nowMs: number,
  fetchImpl: typeof fetch = fetch
): Promise<PauseView | null> {
  const local = await db.pauses.get(pauseId);
  if (!local) return null;
  const remote = await requestRemotePause(pauseId, fetchImpl);
  if (!remote || remote.assessment.tier <= local.tier) return null;

  const assessment: RiskResult = {
    assessmentId: remote.assessment.id,
    score: Number(remote.assessment.score),
    tier: remote.assessment.tier,
    signalHits: remote.assessment.signal_hits,
    hardRuleOverrides: remote.assessment.hard_rule_overrides,
    engineVersion: remote.assessment.engine_version,
    configVersion: remote.assessment.config_version,
    evaluatedAt: remote.assessment.evaluated_at
  };
  const pact = getEffectivePact(await db.pacts.toArray(), nowMs);
  const pause: PauseEvent = {
    ...local,
    assessmentId: assessment.assessmentId,
    tier: assessment.tier,
    expiresAt: pauseExpiry(assessment.tier, new Date(local.startedAt).getTime(), {
      cooldownAfterLossMinutes: pact?.cooldownAfterLossMinutes ?? 30
    })
  };
  await db.transaction("rw", db.riskAssessments, db.pauses, async () => {
    await db.riskAssessments.put(assessment);
    await db.pauses.put(pause);
  });
  return { pause, assessment, simulated: remote.simulated };
}

export async function fetchRemotePause(
  db: ThehravDatabase,
  pauseId: string,
  fetchImpl: typeof fetch = fetch
): Promise<PauseView | null> {
  let response: Response;
  try {
    response = await fetchImpl(`/api/pauses/${encodeURIComponent(pauseId)}`, { cache: "no-store" });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const body = (await response.json()) as RemotePauseResponse;

  const assessment: RiskResult = {
    assessmentId: body.assessment.id,
    score: Number(body.assessment.score),
    tier: body.assessment.tier,
    signalHits: body.assessment.signal_hits,
    hardRuleOverrides: body.assessment.hard_rule_overrides,
    engineVersion: body.assessment.engine_version,
    configVersion: body.assessment.config_version,
    evaluatedAt: body.assessment.evaluated_at
  };
  const pause: PauseEvent = {
    id: body.pause.id,
    assessmentId: body.pause.assessment_id,
    tier: body.pause.tier,
    startedAt: body.pause.started_at,
    expiresAt: body.pause.expires_at ?? undefined,
    outcome: body.pause.outcome,
    revision: Number(body.pause.revision)
  };

  await db.transaction("rw", db.riskAssessments, db.pauses, async () => {
    await db.riskAssessments.put(assessment);
    await db.pauses.put(pause);
  });
  return { pause, assessment, simulated: body.simulated };
}

export interface ResolveDeps {
  db: ThehravDatabase;
  enqueue: (entityType: "pause", payload: unknown, id: string) => Promise<unknown>;
}

/** Records the user's decision locally and queues it with a bumped revision. */
export async function resolvePause(pauseId: string, outcome: Exclude<PauseOutcome, "waiting">, deps: ResolveDeps) {
  const pause = await deps.db.pauses.get(pauseId);
  if (!pause) return;
  const revision = (pause.revision ?? 0) + 1;
  await deps.db.pauses.update(pauseId, { outcome, revision });
  await deps.enqueue(
    "pause",
    {
      id: pause.id,
      assessmentId: pause.assessmentId,
      tier: pause.tier,
      startedAt: pause.startedAt,
      expiresAt: pause.expiresAt ?? null,
      outcome,
      revision
    },
    `pause-${pause.id}-r${revision}`
  );
}
