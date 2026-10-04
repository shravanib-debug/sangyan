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

/** Fields Thehrav reads from an Angel One SmartAPI order book entry. Everything else is dropped. */
export interface AngelOrder {
  orderid?: string;
  status?: string;
  orderstatus?: string;
  tradingsymbol?: string;
  transactiontype?: string;
  filledshares?: string | number;
  averageprice?: string | number;
  updatetime?: string | null;
  exchorderupdatetime?: string | null;
}

const MONTHS: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12"
};

/** SmartAPI timestamps are IST wall-clock strings: "DD-Mon-YYYY HH:mm:ss". */
export function parseAngelTimestamp(value: string | null | undefined, fallbackIso: string): string {
  const match = value?.trim().match(/^(\d{2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  const month = match ? MONTHS[match[2]!.toUpperCase()] : undefined;
  if (!match || !month) return fallbackIso;
  const parsed = new Date(`${match[3]}-${month}-${match[1]}T${match[4]}:${match[5]}:${match[6]}+05:30`);
  return Number.isNaN(parsed.getTime()) ? fallbackIso : parsed.toISOString();
}

/**
 * Normalises an Angel One order into the same canonical event as Kite. Only completed
 * fills are behavioural context; everything else returns null.
 */
export function normalizeAngelOrder(
  order: AngelOrder,
  context: { userId: string; nowIso: string; eventType: BrokerEvent["eventType"] }
): BrokerEvent | null {
  const status = (order.orderstatus ?? order.status ?? "").toLowerCase();
  if (!order.orderid || status !== "complete") return null;
  const quantity = Number(order.filledshares ?? 0);
  const side = order.transactiontype?.toLowerCase();
  const symbol = order.tradingsymbol ? sanitizeSymbol(order.tradingsymbol) : undefined;
  if (!(quantity > 0) || (side !== "buy" && side !== "sell") || !symbol) return null;

  const stamp = order.exchorderupdatetime || order.updatetime || "";
  const dedupeHash = sha256Hex(`angel_one|${order.orderid}|COMPLETE|${quantity}|${stamp}`);

  return {
    id: uuidFromHash(dedupeHash),
    userId: context.userId,
    provider: "angel_one",
    providerEventId: `${order.orderid}:COMPLETE:${quantity}`,
    providerOrderId: order.orderid,
    observedAt: parseAngelTimestamp(stamp, context.nowIso),
    receivedAt: context.nowIso,
    eventType: context.eventType,
    status: "COMPLETE",
    symbol,
    side,
    quantity,
    averagePricePaise: Math.max(0, Math.round(Number(order.averageprice ?? 0) * 100)),
    dedupeHash
  };
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
