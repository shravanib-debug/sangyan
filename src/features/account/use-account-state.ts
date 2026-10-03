"use client";

import { useCallback, useEffect, useState } from "react";

export type BrokerStatus = "disconnected" | "connecting" | "live" | "reconnecting" | "stale" | "reauth_required";

export interface AccountState {
  user: { email: string | null } | null;
  consents: Partial<Record<"sync" | "journal_sync" | "broker_monitoring" | "push", boolean>>;
  broker: {
    status: BrokerStatus;
    simulated: boolean;
    expiresAt: string | null;
    lastEventAt: string | null;
    lastHeartbeatAt: string | null;
  };
  config: { zerodhaConfigured: boolean; replayAvailable: boolean; vapidPublicKey: string | null };
}

/** Session, consents and broker health. Fails soft: offline or unconfigured means guest mode. */
export function useAccountState() {
  const [state, setState] = useState<AccountState | null>(null);
  const [reachable, setReachable] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/account/state", { cache: "no-store" });
        if (!response.ok) throw new Error("unavailable");
        const body = (await response.json()) as AccountState;
        if (!cancelled) {
          setState(body);
          setReachable(true);
        }
      } catch {
        if (!cancelled) setReachable(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { state, reachable, reload };
}
