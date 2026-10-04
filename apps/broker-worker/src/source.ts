import type { BrokerEvent, BrokerEventHandlers, BrokerProvider } from "./types.js";

/**
 * Observation-only broker contract. It can listen for order/trade updates and
 * reconcile history. It deliberately has no method that places, modifies or
 * cancels an order, creates a GTT or basket, or moves funds. Tests enforce this.
 */
export interface BrokerEventSource {
  readonly provider: BrokerProvider;
  start(handlers: BrokerEventHandlers): void;
  reconcile(): Promise<BrokerEvent[]>;
  stop(): void;
}
