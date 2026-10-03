import type { BrokerEventSource } from "../source.js";
import { normalizeKiteOrder, type KiteOrder } from "../normalize.js";
import type { BrokerEvent, BrokerEventHandlers } from "../types.js";

const KITE_API = "https://api.kite.trade";
const KITE_WS = "wss://ws.kite.trade";
const SILENCE_LIMIT_MS = 30_000;
const WATCHDOG_MS = 10_000;
const MAX_BACKOFF_MS = 60_000;

export interface ZerodhaAdapterOptions {
  apiKey: string;
  accessToken: string;
  userId: string;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

/**
 * Read-only Kite Connect adapter: listens to the order WebSocket and reconciles through
 * GET /orders after every (re)connect. Only GET requests and the WebSocket are used.
 */
export class ZerodhaAdapter implements BrokerEventSource {
  readonly provider = "zerodha" as const;
  private socket: WebSocket | undefined;
  private watchdog: ReturnType<typeof setInterval> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private lastMessageAt = 0;
  private attempt = 0;
  private stopped = false;
  private handlers: BrokerEventHandlers | undefined;
  private readonly now: () => number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ZerodhaAdapterOptions) {
    this.now = options.now ?? (() => Date.now());
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  start(handlers: BrokerEventHandlers): void {
    this.handlers = handlers;
    handlers.onState("connecting");
    this.connect();
    this.watchdog = setInterval(() => {
      if (this.socket && this.now() - this.lastMessageAt > SILENCE_LIMIT_MS) this.socket.close();
    }, WATCHDOG_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.watchdog) clearInterval(this.watchdog);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.close();
  }

  async reconcile(): Promise<BrokerEvent[]> {
    const response = await this.get("/orders");
    if (!response.ok) throw new Error(`orders_http_${response.status}`);
    const body = (await response.json()) as { data?: KiteOrder[] };
    const nowIso = new Date(this.now()).toISOString();
    return (body.data ?? [])
      .map((order) => normalizeKiteOrder(order, { userId: this.options.userId, nowIso, eventType: "reconciliation" }))
      .filter((event): event is BrokerEvent => event !== null);
  }

  private get(path: string): Promise<Response> {
    return this.fetchImpl(`${KITE_API}${path}`, {
      method: "GET",
      headers: {
        "X-Kite-Version": "3",
        Authorization: `token ${this.options.apiKey}:${this.options.accessToken}`
      }
    });
  }

  private connect(): void {
    if (this.stopped) return;
    const url = `${KITE_WS}?api_key=${encodeURIComponent(this.options.apiKey)}&access_token=${encodeURIComponent(this.options.accessToken)}`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.attempt = 0;
      this.lastMessageAt = this.now();
      this.handlers?.onState("live");
      // Close any gap left by a disconnect; duplicates dedupe on the server.
      void this.reconcile()
        .then(async (events) => {
          for (const event of events) await this.handlers?.onEvent(event);
        })
        .catch(() => undefined);
    });

    socket.addEventListener("message", (message) => {
      this.lastMessageAt = this.now();
      if (typeof message.data !== "string") return; // binary frames are heartbeats/ticks
      try {
        const parsed = JSON.parse(message.data) as { type?: string; data?: KiteOrder };
        if (parsed.type !== "order" || !parsed.data) return;
        const event = normalizeKiteOrder(parsed.data, {
          userId: this.options.userId,
          nowIso: new Date(this.now()).toISOString(),
          eventType: "order_update"
        });
        if (event) void this.handlers?.onEvent(event);
      } catch {
        // Ignore malformed frames; never log payloads.
      }
    });

    const onDrop = () => {
      if (this.socket !== socket || this.stopped) return;
      this.socket = undefined;
      void this.afterDrop();
    };
    socket.addEventListener("close", onDrop);
    socket.addEventListener("error", onDrop);
  }

  private async afterDrop(): Promise<void> {
    this.handlers?.onState("reconnecting");
    // A 403 means the daily session ended: stop and ask for a fresh login.
    try {
      const profile = await this.get("/user/profile");
      if (profile.status === 403) {
        this.handlers?.onState("reauth_required");
        this.stop();
        return;
      }
    } catch {
      // Network trouble: keep retrying with backoff.
    }
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt);
    this.attempt += 1;
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }
}
