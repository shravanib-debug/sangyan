import type { ParsedRow } from "@/engine/csv-parser";
import { pairFifo } from "@/engine/fifo";
import type { Trade } from "@/engine/types";

export interface TradeEventRow {
  id: string;
  observed_at: string;
  symbol: string | null;
  side: "buy" | "sell" | null;
  quantity: number | string | null;
  average_price_paise: number | string | null;
  provider_order_id?: string | null;
  status?: string | null;
}

export const FILL_STATUSES = new Set(["COMPLETE", "FILLED"]);

/**
 * Canonical fills carry no P&L from the broker, so realised P&L and hold time are
 * derived by FIFO pairing. Rows are sorted by time before pairing.
 */
export function tradesFromEvents(rows: readonly TradeEventRow[]): Trade[] {
  const fills = rows
    .filter((row) => row.symbol && row.side && (!row.status || FILL_STATUSES.has(row.status)))
    .sort((a, b) => new Date(a.observed_at).getTime() - new Date(b.observed_at).getTime());

  const parsed: ParsedRow[] = fills.map((row) => ({
    timestamp: row.observed_at,
    symbol: row.symbol as string,
    side: row.side as "buy" | "sell",
    quantity: Number(row.quantity ?? 1),
    pricePaise: Number(row.average_price_paise ?? 0),
    orderId: row.provider_order_id ?? undefined
  }));

  return pairFifo(parsed).map((paired, index) => {
    const trade: Trade & { holdTimeSeconds?: number } = {
      id: fills[index]?.id ?? paired.id,
      timestamp: paired.timestamp,
      symbol: paired.symbol,
      side: paired.side,
      quantity: paired.quantity,
      pricePaise: paired.pricePaise,
      pnlPaise: paired.pnlPaise,
      orderId: paired.orderId,
      source: "connected"
    };
    if (paired.holdTimeSeconds !== undefined) trade.holdTimeSeconds = paired.holdTimeSeconds;
    return trade;
  });
}
