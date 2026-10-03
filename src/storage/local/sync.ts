import type { Pact } from "@/engine/types";

import { localDatabase, type SyncQueueItem } from "./database";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;
const SYNC_ENABLED_KEY = "syncEnabled";

export async function isSyncEnabled(): Promise<boolean> {
  const setting = await localDatabase.settings.get(SYNC_ENABLED_KEY);
  return setting?.value === true;
}

export async function setSyncEnabled(enabled: boolean): Promise<void> {
  await localDatabase.settings.put({ key: SYNC_ENABLED_KEY, value: enabled });
  if (enabled) void syncLocalQueue();
}

/**
 * Queues a mutation locally. Nothing leaves the device until the user has signed in and
 * enabled sync; guest data therefore stays local, and everything queued while a guest is
 * adopted idempotently (client-generated ids) once sync is enabled.
 */
export async function enqueueSyncItem<T>(
  entityType: SyncQueueItem["entityType"],
  payload: T,
  id: string = crypto.randomUUID()
): Promise<string> {
  const revision = (payload as { revision?: number } | null)?.revision;
  await localDatabase.syncQueue.put({
    id,
    userId: "local",
    entityType,
    syncStatus: "pending",
    clientCreatedAt: new Date().toISOString(),
    revision: typeof revision === "number" ? revision : 1,
    idempotencyKey: id,
    payload,
    attempts: 0
  });
  void syncLocalQueue();
  return id;
}

interface SyncResult {
  id: string;
  status: "success" | "failed" | "skipped";
  code?: string;
  retryable?: boolean;
  pact?: { effective: Pact | null; pending: Pact | null };
}

let inFlight: Promise<void> | null = null;

/** Sends pending items. Safe to call often: concurrent calls share one run. */
export function syncLocalQueue(): Promise<void> {
  if (!inFlight) {
    inFlight = runSync().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function runSync(): Promise<void> {
  if (typeof window === "undefined" || !navigator.onLine) return;
  if (!(await isSyncEnabled())) return;

  const items = (await localDatabase.syncQueue.where("syncStatus").equals("pending").sortBy("clientCreatedAt")).slice(
    0,
    BATCH_SIZE
  );
  if (items.length === 0) return;

  let response: Response;
  try {
    response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map(({ id, entityType, payload }) => ({ id, entityType, payload }))
      })
    });
  } catch {
    return; // Offline or server unreachable: items stay pending.
  }

  if (response.status === 403) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (body?.error === "consent_required") await localDatabase.settings.put({ key: SYNC_ENABLED_KEY, value: false });
    return;
  }
  if (!response.ok) return; // 401 (not signed in) and server errors keep items pending.

  const { results } = (await response.json()) as { results: SyncResult[] };
  const now = new Date().toISOString();

  for (const result of results) {
    const item = items.find((candidate) => candidate.id === result.id);
    if (!item) continue;
    if (result.status === "success") {
      await localDatabase.syncQueue.update(item.id, { syncStatus: "synced", lastAttemptAt: now });
      if (result.pact) await reconcilePact(result.pact);
    } else if (result.status === "skipped") {
      await localDatabase.syncQueue.update(item.id, { syncStatus: "local_only", lastAttemptAt: now, lastError: result.code });
    } else {
      const attempts = (item.attempts ?? 0) + 1;
      const giveUp = result.retryable === false || attempts >= MAX_ATTEMPTS;
      await localDatabase.syncQueue.update(item.id, {
        syncStatus: giveUp ? "failed" : "pending",
        attempts,
        lastAttemptAt: now,
        lastError: result.code
      });
    }
  }

  // More than one batch: continue until the queue drains.
  if (items.length === BATCH_SIZE) await runSync();
}

/**
 * The server is authoritative for the Pact. Adopt its effective and pending rules
 * unless newer local edits are still waiting to be sent.
 */
async function reconcilePact(state: { effective: Pact | null; pending: Pact | null }): Promise<void> {
  const unsent = await localDatabase.syncQueue
    .where("syncStatus")
    .equals("pending")
    .filter((item) => item.entityType === "pact")
    .count();
  if (unsent > 0 || !state.effective) return;

  await localDatabase.transaction("rw", localDatabase.pacts, async () => {
    await localDatabase.pacts.clear();
    await localDatabase.pacts.put({ ...state.effective!, userId: undefined });
    if (state.pending) await localDatabase.pacts.put({ ...state.pending, userId: undefined });
  });
}
