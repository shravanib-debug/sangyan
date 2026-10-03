/** Canonical event contract. Mirrors src/engine/types.ts BrokerEvent (the worker is a separate package). */
export interface BrokerEvent {
  id: string;
  userId: string;
  provider: "zerodha";
  providerEventId: string;
  providerOrderId?: string;
  observedAt: string;
  receivedAt: string;
  eventType: "order_update" | "trade_update" | "reconciliation";
  status: string;
  symbol?: string;
  side?: "buy" | "sell";
  quantity?: number;
  averagePricePaise?: number;
  dedupeHash: string;
  simulated?: boolean;
}

export type SessionState = "connecting" | "live" | "reconnecting" | "reauth_required";

export interface BrokerEventHandlers {
  onEvent(event: BrokerEvent): Promise<void>;
  onState(state: SessionState): void;
}
