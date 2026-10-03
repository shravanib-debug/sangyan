import type { SupabaseClient } from "@supabase/supabase-js";

import type { BrokerConnectionStatus } from "@/engine/types";
import { decryptSecret, fromPgBytea, parseEncryptionKey } from "@/lib/crypto/secret-box";

import { deriveConnectionStatus, isReplayConnection } from "./status";
import { invalidateAccessToken } from "./zerodha";

export interface ConnectionSummary {
  provider: "zerodha";
  status: BrokerConnectionStatus;
  /** True for replay connections: events are labelled simulated everywhere. */
  simulated: boolean;
  expiresAt: string | null;
  lastEventAt: string | null;
  lastHeartbeatAt: string | null;
}

export const DISCONNECTED_SUMMARY: ConnectionSummary = {
  provider: "zerodha",
  status: "disconnected",
  simulated: false,
  expiresAt: null,
  lastEventAt: null,
  lastHeartbeatAt: null
};

export function brokerAad(userId: string): string {
  return `broker:${userId}:zerodha`;
}

/** Provider, health and expiry only. Credentials are never selected. */
export async function getConnectionSummary(
  admin: SupabaseClient,
  userId: string,
  nowMs: number
): Promise<ConnectionSummary> {
  const { data } = await admin
    .from("broker_connections")
    .select("status, provider_user_ref, expires_at, last_event_at, last_heartbeat_at")
    .eq("user_id", userId)
    .eq("provider", "zerodha")
    .maybeSingle();
  if (!data) return DISCONNECTED_SUMMARY;

  return {
    provider: "zerodha",
    status: deriveConnectionStatus(
      {
        status: data.status as BrokerConnectionStatus,
        expires_at: data.expires_at as string | null,
        last_heartbeat_at: data.last_heartbeat_at as string | null
      },
      nowMs
    ),
    simulated: isReplayConnection(data.provider_user_ref as string),
    expiresAt: data.expires_at as string | null,
    lastEventAt: data.last_event_at as string | null,
    lastHeartbeatAt: data.last_heartbeat_at as string | null
  };
}

export interface DisconnectEnvironment {
  ZERODHA_API_KEY?: string;
  BROKER_TOKEN_ENCRYPTION_KEY?: string;
}

/**
 * Stops monitoring and deletes stored access material. The worker drops the session
 * at its next lease renewal because the row is no longer claimable.
 */
export async function disconnectConnection(
  admin: SupabaseClient,
  userId: string,
  environment: DisconnectEnvironment,
  nowIso: string
): Promise<void> {
  const { data } = await admin
    .from("broker_connections")
    .select("encrypted_access_token")
    .eq("user_id", userId)
    .eq("provider", "zerodha")
    .maybeSingle();

  // Best effort: ask Kite to invalidate the token before it is deleted.
  if (data?.encrypted_access_token && environment.ZERODHA_API_KEY && environment.BROKER_TOKEN_ENCRYPTION_KEY) {
    try {
      const token = decryptSecret(
        fromPgBytea(data.encrypted_access_token as string),
        parseEncryptionKey(environment.BROKER_TOKEN_ENCRYPTION_KEY),
        brokerAad(userId)
      );
      await invalidateAccessToken({ apiKey: environment.ZERODHA_API_KEY, accessToken: token });
    } catch {
      // Deleting the stored token below is the guarantee that matters.
    }
  }

  const { error } = await admin
    .from("broker_connections")
    .update({
      status: "disconnected",
      encrypted_access_token: null,
      token_key_version: null,
      lease_owner: null,
      lease_expires_at: null,
      expires_at: null,
      disconnected_at: nowIso
    })
    .eq("user_id", userId)
    .eq("provider", "zerodha");
  if (error) throw new Error("disconnect_failed");
}
