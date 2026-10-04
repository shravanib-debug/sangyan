import { parseBrokerCsv } from "@/engine/csv-parser";
import { pairFifo, type FifoTrade } from "@/engine/fifo";
import { getEffectivePact } from "@/engine/pact";
import type { ThehravDatabase } from "@/storage/local/database";

import { DEFAULT_REPLAY_PACT, replayHistory, type FlaggedTrade } from "./replay-service";

export interface ImportedHistory {
  trades: FifoTrade[];
  flaggedTrades: FlaggedTrade<FifoTrade>[];
  droppedRows: number;
  parseErrors: string[];
}

/**
 * Runs the complete local import path in production order: parse the CSV, pair fills
 * into canonical FIFO trades, replace the saved CSV history, then replay the shared
 * signal detector over exactly what was persisted.
 */
export async function importBrokerCsvHistory(
  csvText: string,
  db: ThehravDatabase,
  nowMs: number
): Promise<ImportedHistory> {
  const parsed = parseBrokerCsv(csvText);
  const trades = pairFifo(parsed.trades);

  await db.transaction("rw", db.trades, async () => {
    await db.trades.where("source").equals("csv").delete();
    await db.trades.bulkPut(trades);
  });

  const persistedTrades = (await db.trades.where("source").equals("csv").sortBy("timestamp")) as FifoTrade[];
  const pact = getEffectivePact(await db.pacts.toArray(), nowMs) ?? DEFAULT_REPLAY_PACT;

  return {
    trades: persistedTrades,
    flaggedTrades: replayHistory(persistedTrades, pact),
    droppedRows: parsed.droppedRows,
    parseErrors: parsed.errors
  };
}
