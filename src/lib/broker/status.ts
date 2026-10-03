import type { BrokerConnectionStatus } from "@/engine/types";

export const HEARTBEAT_STALE_MS = 90_000;

export interface ConnectionRow {
  status: BrokerConnectionStatus;
  expires_at: string | null;
  last_heartbeat_at: string | null;
}

/**
 * Status shown to the user. Fails closed: an expired session is `reauth_required`
 * and a silent worker is `stale`, never `live`.
 */
export function deriveConnectionStatus(row: ConnectionRow, nowMs: number): BrokerConnectionStatus {
  if (row.status === "disconnected" || row.status === "reauth_required") return row.status;
  if (row.expires_at && new Date(row.expires_at).getTime() <= nowMs) return "reauth_required";
  if (row.status === "connecting") return "connecting";
  const heartbeat = row.last_heartbeat_at ? new Date(row.last_heartbeat_at).getTime() : 0;
  if (nowMs - heartbeat > HEARTBEAT_STALE_MS) return "stale";
  return row.status;
}

export const REPLAY_PROVIDER_REF = "replay-simulated";

export function isReplayConnection(providerUserRef: string): boolean {
  return providerUserRef.startsWith("replay");
}
