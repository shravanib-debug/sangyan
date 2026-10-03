import { localDatabase, type SyncQueueItem } from "./database";

export async function enqueueSyncItem(entityType: SyncQueueItem["entityType"], payload: Record<string, unknown>, id?: string) {
  const itemId = id || crypto.randomUUID();
  await localDatabase.syncQueue.put({
    id: itemId,
    userId: "local", // local placeholder
    entityType,
    syncStatus: "pending",
    clientCreatedAt: new Date().toISOString(),
    revision: payload?.revision ?? 1,
    idempotencyKey: itemId,
    payload
  });
  
  // Attempt sync immediately without awaiting
  syncLocalQueue().catch(console.error);
  return itemId;
}

export async function syncLocalQueue() {
  if (typeof window === "undefined" || !navigator.onLine) {
    return;
  }

  const items = await localDatabase.syncQueue.where("syncStatus").equals("pending").toArray();
  
  if (items.length === 0) return;

  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items })
    });

    if (res.ok) {
      const { results } = await res.json();
      for (const result of results) {
        if (result.status === "success") {
          await localDatabase.syncQueue.update(result.id, { syncStatus: "synced" });
        } else if (result.status === "failed") {
          await localDatabase.syncQueue.update(result.id, { syncStatus: "failed", lastAttemptAt: new Date().toISOString() });
        }
      }
    } else if (res.status === 401) {
      // User is not signed in, can't sync
      console.warn("User is not signed in, skipping sync");
    }
  } catch (err) {
    console.error("Failed to sync:", err);
  }
}
