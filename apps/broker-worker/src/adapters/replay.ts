import type { BrokerEventSource } from "../source.js";
import { sha256Hex, uuidFromHash } from "../normalize.js";
import type { BrokerEvent, BrokerEventHandlers } from "../types.js";

/** Scripted, deterministic scenario: a buy, a losing exit, then a larger re-entry. */
const SCRIPT: ReadonlyArray<{ side: "buy" | "sell"; quantity: number; pricePaise: number }> = [
  { side: "buy", quantity: 10, pricePaise: 10_000 },
  { side: "sell", quantity: 10, pricePaise: 8_500 },
  { side: "buy", quantity: 15, pricePaise: 8_500 }
];

/**
 * Replays synthetic activity through the same canonical boundary. Every event is
 * flagged `simulated`; the app stores it as synthetic and the UI labels it so.
 * Event identity depends only on (connection, step) so a restart cannot duplicate it.
 */
export class ReplayAdapter implements BrokerEventSource {
  readonly provider = "zerodha" as const;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(
    private readonly options: { connectionId: string; userId: string; stepIntervalMs: number; now: () => number }
  ) {}

  start(handlers: BrokerEventHandlers): void {
    handlers.onState("live");
    const emit = (step: number) => {
      if (this.stopped || step >= SCRIPT.length) return;
      const entry = SCRIPT[step]!;
      void handlers.onEvent(this.build(step, entry)).finally(() => {
        this.timer = setTimeout(() => emit(step + 1), this.options.stepIntervalMs);
      });
    };
    this.timer = setTimeout(() => emit(0), this.options.stepIntervalMs);
  }

  async reconcile(): Promise<BrokerEvent[]> {
    return [];
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private build(step: number, entry: (typeof SCRIPT)[number]): BrokerEvent {
    const nowIso = new Date(this.options.now()).toISOString();
    const hash = sha256Hex(`replay|${this.options.connectionId}|${step}`);
    return {
      id: uuidFromHash(hash),
      userId: this.options.userId,
      provider: "zerodha",
      providerEventId: `replay-${step}`,
      providerOrderId: `replay-order-${step}`,
      observedAt: nowIso,
      receivedAt: nowIso,
      eventType: "trade_update",
      status: "COMPLETE",
      symbol: "SIMULATED",
      side: entry.side,
      quantity: entry.quantity,
      averagePricePaise: entry.pricePaise,
      dedupeHash: hash,
      simulated: true
    };
  }
}
