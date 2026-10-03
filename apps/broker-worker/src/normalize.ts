import { createHash } from "node:crypto";

import type { BrokerEvent } from "./types.js";

export interface KiteOrder {
  order_id?: string;
  status?: string;
  tradingsymbol?: string;
  transaction_type?: string;
  filled_quantity?: number;
  average_price?: number;
  order_timestamp?: string | null;
  exchange_update_timestamp?: string | null;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Deterministic RFC 4122 style UUID from a hash, so re-delivery yields the same event id. */
export function uuidFromHash(hash: string): string {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** Kite timestamps are IST wall-clock strings: "YYYY-MM-DD HH:mm:ss". */
export function parseKiteTimestamp(value: string | null | undefined, fallbackIso: string): string {
  if (!value) return fallbackIso;
  const parsed = new Date(`${value.replace(" ", "T")}+05:30`);
  return Number.isNaN(parsed.getTime()) ? fallbackIso : parsed.toISOString();
}

/** Keeps only the canonical symbol characters the schema allows. */
export function sanitizeSymbol(symbol: string): string | undefined {
  const cleaned = symbol.toUpperCase().replace(/[^A-Z0-9._-]/g, "_").slice(0, 32);
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Normalises a Kite order into the canonical event. Only completed fills are
 * meaningful behavioural context; everything else returns null.
 */
export function normalizeKiteOrder(
  order: KiteOrder,
  context: { userId: string; nowIso: string; eventType: BrokerEvent["eventType"] }
): BrokerEvent | null {
  if (!order.order_id || order.status?.toUpperCase() !== "COMPLETE") return null;
  const quantity = Number(order.filled_quantity ?? 0);
  const side = order.transaction_type?.toLowerCase();
  const symbol = order.tradingsymbol ? sanitizeSymbol(order.tradingsymbol) : undefined;
  if (!(quantity > 0) || (side !== "buy" && side !== "sell") || !symbol) return null;

  const stamp = order.exchange_update_timestamp ?? order.order_timestamp ?? "";
  // The hash ignores eventType so a WebSocket update and a later REST reconciliation dedupe to one row.
  const dedupeHash = sha256Hex(`zerodha|${order.order_id}|COMPLETE|${quantity}|${stamp}`);

  return {
    id: uuidFromHash(dedupeHash),
    userId: context.userId,
    provider: "zerodha",
    providerEventId: `${order.order_id}:COMPLETE:${quantity}`,
    providerOrderId: order.order_id,
    observedAt: parseKiteTimestamp(stamp, context.nowIso),
    receivedAt: context.nowIso,
    eventType: context.eventType,
    status: "COMPLETE",
    symbol,
    side,
    quantity,
    averagePricePaise: Math.max(0, Math.round(Number(order.average_price ?? 0) * 100)),
    dedupeHash
  };
}
