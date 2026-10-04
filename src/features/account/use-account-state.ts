"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type BrokerStatus = "disconnected" | "connecting" | "live" | "reconnecting" | "stale" | "reauth_required";

export interface AccountState {
  user: { email: string | null; displayName: string } | null;
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

interface Snapshot {
  state: AccountState | null;
  reachable: boolean;
}

// One copy of the account state for the whole app, so a sign-in, sign-out or name change
// made on one screen shows up in the sidebar, top bar and every other screen at once.
let snapshot: Snapshot = { state: null, reachable: true };
let inflight: Promise<void> | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function publish(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** Re-reads the session from the server and updates every screen that shows account data. */
export function refreshAccountState(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const response = await fetch("/api/account/state", { cache: "no-store" });
      if (!response.ok) throw new Error("unavailable");
      publish({ state: (await response.json()) as AccountState, reachable: true });
    } catch {
      publish({ ...snapshot, reachable: false });
    } finally {
      loaded = true;
      inflight = null;
    }
  })();
  return inflight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverSnapshot: Snapshot = { state: null, reachable: true };

/** Session, consents and broker health. Fails soft: offline or unconfigured means guest mode. */
export function useAccountState() {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => serverSnapshot);

  useEffect(() => {
    if (!loaded) void refreshAccountState();
    // A session can change in another tab; pick that up when the user comes back.
    const onFocus = () => void refreshAccountState();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const reload = useCallback(() => void refreshAccountState(), []);
  return { state: current.state, reachable: current.reachable, reload };
}

/** First letter for an avatar. */
export function initialOf(name: string | undefined): string {
  return (name?.trim().charAt(0) || "G").toUpperCase();
}
