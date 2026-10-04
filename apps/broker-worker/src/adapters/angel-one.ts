import type { BrokerEventSource } from "../source.js";
import { normalizeAngelOrder, type AngelOrder } from "../normalize.js";
import type { BrokerEvent, BrokerEventHandlers } from "../types.js";

const SMARTAPI = "https://apiconnect.angelone.in";
const ORDER_BOOK_PATH = "/rest/secure/angelbroking/order/v1/getOrderBook";
const DEFAULT_POLL_MS = 15_000;
const MAX_BACKOFF_MS = 120_000;
/** SmartAPI error codes for an invalid or expired session token. */
const REAUTH_CODES = new Set(["AG8001", "AG8002", "AG8003"]);

export interface AngelOneAdapterOptions {
  apiKey: string;
  jwtToken: string;
  userId: string;
  pollMs?: number;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

export class AngelReauthError extends Error {
  constructor() {
    super("angel_reauth_required");
  }
}

/**
 * Read-only Angel One SmartAPI adapter. It polls the order book with GET and emits
 * completed fills it has not seen before; ingestion dedupes again server-side.
 * Not yet exercised against a live account (pending broker activation).
 */
export class AngelOneAdapter implements BrokerEventSource {
  readonly provider = "angel_one" as const;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private failures = 0;
  private readonly seen = new Set<string>();
  private readonly now: () => number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: AngelOneAdapterOptions) {
    this.now = options.now ?? (() => Date.now());
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  start(handlers: BrokerEventHandlers): void {
    handlers.onState("connecting");
    const poll = async () => {
      if (this.stopped) return;
      let delay = this.options.pollMs ?? DEFAULT_POLL_MS;
      try {
        const events = await this.reconcile();
        this.failures = 0;
        handlers.onState("live");
        for (const event of events) {
          if (this.seen.has(event.dedupeHash)) continue;
          this.seen.add(event.dedupeHash);
          await handlers.onEvent(event);
        }
      } catch (error) {
        if (error instanceof AngelReauthError) {
          handlers.onState("reauth_required");
          this.stop();
          return;
        }
        this.failures += 1;
        handlers.onState("reconnecting");
        delay = Math.min(MAX_BACKOFF_MS, delay * 2 ** this.failures);
      }
      if (!this.stopped) this.timer = setTimeout(() => void poll(), delay);
    };
    void poll();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  async reconcile(): Promise<BrokerEvent[]> {
    const response = await this.fetchImpl(`${SMARTAPI}${ORDER_BOOK_PATH}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.options.jwtToken}`,
        "X-PrivateKey": this.options.apiKey,
        "X-UserType": "USER",
        "X-SourceID": "WEB",
        Accept: "application/json",
        "Content-Type": "application/json"
      }
    });
    if (response.status === 401 || response.status === 403) throw new AngelReauthError();
    if (!response.ok) throw new Error(`order_book_http_${response.status}`);

    const body = (await response.json()) as { status?: boolean; errorcode?: string; data?: AngelOrder[] | null };
    if (body.errorcode && REAUTH_CODES.has(body.errorcode)) throw new AngelReauthError();
    if (body.status === false) throw new Error("order_book_rejected");

    const nowIso = new Date(this.now()).toISOString();
    return (body.data ?? [])
      .map((order) => normalizeAngelOrder(order, { userId: this.options.userId, nowIso, eventType: "reconciliation" }))
      .filter((event): event is BrokerEvent => event !== null);
  }
}
