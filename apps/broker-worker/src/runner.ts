import type { SupabaseClient } from "@supabase/supabase-js";

import { AngelOneAdapter } from "./adapters/angel-one.js";
import { ReplayAdapter } from "./adapters/replay.js";
import { ZerodhaAdapter } from "./adapters/zerodha.js";
import type { WorkerConfig } from "./config.js";
import { brokerAad, decryptSecret, fromPgBytea } from "./crypto.js";
import { postEvent } from "./ingest-client.js";
import { log } from "./log.js";
import type { BrokerEventSource } from "./source.js";
import type { BrokerProvider, SessionState } from "./types.js";

interface ConnectionRow {
  id: string;
  user_id: string;
  provider?: BrokerProvider;
  provider_user_ref: string;
  encrypted_access_token: string | null;
}

interface Session {
  source: BrokerEventSource;
  state: SessionState;
}

export interface RunnerStats {
  activeSessions: number;
  lastTickAt: number;
}

/**
 * Leases live connections, runs one observation-only session per connection, and
 * reports health. A session is dropped as soon as its lease is no longer granted
 * (disconnect, consent revoked, expiry), which stops ingestion.
 */
export class Runner {
  private readonly sessions = new Map<string, Session>();
  private timer: ReturnType<typeof setInterval> | undefined;
  readonly stats: RunnerStats = { activeSessions: 0, lastTickAt: Date.now() };

  constructor(
    private readonly config: WorkerConfig,
    private readonly db: SupabaseClient
  ) {}

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.config.tickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    for (const session of this.sessions.values()) session.source.stop();
    this.sessions.clear();
  }

  async tick(): Promise<void> {
    try {
      const { data, error } = await this.db.rpc("claim_broker_connections", {
        p_worker: this.config.workerId,
        p_lease_seconds: this.config.leaseSeconds,
        p_limit: 50
      });
      if (error) {
        log("error", "claim_failed", { code: error.code });
        return;
      }
      const rows = (data ?? []) as ConnectionRow[];
      const leased = new Set(rows.map((row) => row.id));

      for (const [id, session] of this.sessions) {
        if (!leased.has(id)) {
          session.source.stop();
          this.sessions.delete(id);
          log("info", "session_stopped", { connectionId: id, code: "lease_lost" });
        }
      }
      for (const row of rows) {
        if (!this.sessions.has(row.id)) this.open(row);
      }
      await Promise.all([...this.sessions].map(([id, session]) => this.report(id, session)));

      this.stats.activeSessions = this.sessions.size;
      this.stats.lastTickAt = Date.now();
    } catch {
      log("error", "tick_failed");
    }
  }

  private open(row: ConnectionRow): void {
    const source = this.createSource(row);
    if (!source) return;
    const session: Session = { source, state: "connecting" };
    this.sessions.set(row.id, session);

    source.start({
      onState: (state) => {
        session.state = state;
        if (state === "reauth_required") void this.markReauth(row.id);
      },
      onEvent: async (event) => {
        const outcome = await postEvent({ appUrl: this.config.appUrl, signingKey: this.config.signingKey, event });
        if (outcome === "not_monitored") {
          source.stop();
          this.sessions.delete(row.id);
          log("info", "session_stopped", { connectionId: row.id, code: "not_monitored" });
        } else if (outcome !== "ok") {
          log("warn", "ingest_not_accepted", { connectionId: row.id, code: outcome });
        }
      }
    });
    log("info", "session_started", { connectionId: row.id });
  }

  private createSource(row: ConnectionRow): BrokerEventSource | null {
    const provider = row.provider ?? "zerodha";
    if (row.provider_user_ref.startsWith("replay")) {
      return new ReplayAdapter({
        connectionId: row.id,
        userId: row.user_id,
        provider,
        stepIntervalMs: this.config.replayStepMs,
        now: () => Date.now()
      });
    }
    // Real sessions need approved credentials and a non-replay worker; otherwise health goes stale honestly.
    const apiKey = provider === "angel_one" ? this.config.angelOneApiKey : this.config.zerodhaApiKey;
    if (this.config.mode === "replay" || !apiKey || !this.config.tokenEncryptionKey) {
      log("warn", "adapter_unavailable", { connectionId: row.id, code: "live_mode_not_configured" });
      return null;
    }
    if (!row.encrypted_access_token) {
      void this.markReauth(row.id);
      return null;
    }
    try {
      const accessToken = decryptSecret(
        fromPgBytea(row.encrypted_access_token),
        this.config.tokenEncryptionKey,
        brokerAad(row.user_id)
      );
      return provider === "angel_one"
        ? new AngelOneAdapter({ apiKey, jwtToken: accessToken, userId: row.user_id })
        : new ZerodhaAdapter({ apiKey, accessToken, userId: row.user_id });
    } catch {
      log("error", "token_decrypt_failed", { connectionId: row.id });
      void this.markReauth(row.id);
      return null;
    }
  }

  /** Heartbeat only while genuinely live, so a dead socket becomes `stale` in the app. */
  private async report(id: string, session: Session): Promise<void> {
    if (session.state === "live") {
      await this.db
        .from("broker_connections")
        .update({ status: "live", last_heartbeat_at: new Date().toISOString() })
        .eq("id", id);
    } else if (session.state === "reconnecting") {
      await this.db.from("broker_connections").update({ status: "reconnecting" }).eq("id", id);
    }
  }

  private async markReauth(id: string): Promise<void> {
    this.sessions.get(id)?.source.stop();
    this.sessions.delete(id);
    await this.db
      .from("broker_connections")
      .update({
        status: "reauth_required",
        encrypted_access_token: null,
        token_key_version: null,
        lease_owner: null,
        lease_expires_at: null
      })
      .eq("id", id);
    log("info", "reauth_required", { connectionId: id });
  }
}
