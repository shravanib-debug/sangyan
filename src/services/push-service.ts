const SUBSCRIPTION_KEY = "pushSubscriptionId";

export type PushSupport = "supported" | "unsupported" | "denied";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission === "denied" ? "denied" : "supported";
}

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=").replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

interface SettingsStore {
  get(key: string): Promise<{ value: unknown } | undefined>;
  put(entry: { key: string; value: unknown }): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

/** Subscribes this device. The server stores the endpoint encrypted and only after push consent. */
export async function enablePush(vapidPublicKey: string, store: SettingsStore): Promise<boolean> {
  if (pushSupport() !== "supported") return false;
  if ((await Notification.requestPermission()) !== "granted") return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    }));

  const json = subscription.toJSON();
  const response = await fetch("/api/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys })
  });
  if (!response.ok) return false;
  const { id } = (await response.json()) as { id: string };
  await store.put({ key: SUBSCRIPTION_KEY, value: id });
  return true;
}

export async function disablePush(store: SettingsStore): Promise<void> {
  const stored = await store.get(SUBSCRIPTION_KEY);
  if (typeof stored?.value === "string") {
    await fetch("/api/push/subscriptions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: stored.value })
    }).catch(() => undefined);
  }
  const registration = await navigator.serviceWorker.ready;
  await (await registration.pushManager.getSubscription())?.unsubscribe();
  await store.delete(SUBSCRIPTION_KEY);
}

export async function hasPushSubscription(store: SettingsStore): Promise<boolean> {
  return typeof (await store.get(SUBSCRIPTION_KEY))?.value === "string";
}
