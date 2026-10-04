import { tradesFromEvents, type TradeEventRow } from "@/lib/pipeline/history";
import type { ThehravDatabase } from "@/storage/local/database";

export type BrokerHistoryRefresh = "skipped" | "unavailable" | { stored: number };

/**
 * Copies the user's own recent broker fills (already on the server) into the local trade
 * history, so a check-in on this device sees the same fills as the server re-check.
 * Download only: nothing local is uploaded. Best-effort; a check-in never waits for it.
 */
export async function refreshBrokerHistory(
  db: ThehravDatabase,
  deps: { syncEnabled: () => Promise<boolean>; fetchImpl?: typeof fetch }
): Promise<BrokerHistoryRefresh> {
  if (!(await deps.syncEnabled())) return "skipped";
  let response: Response;
  try {
    response = await (deps.fetchImpl ?? fetch)("/api/trades/recent", { cache: "no-store" });
  } catch {
    return "unavailable";
  }
  if (!response.ok) return "unavailable";
  const body = (await response.json()) as { rows?: TradeEventRow[] };
  const trades = tradesFromEvents(body.rows ?? []).map((trade) => ({ ...trade, source: "connected" as const }));
  if (trades.length > 0) await db.trades.bulkPut(trades);
  return { stored: trades.length };
}
