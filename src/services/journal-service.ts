import type { ThehravDatabase } from "@/storage/local/database";

import type { FlaggedTrade } from "./replay-service";
import { loadReview, type DecisionRecord, type ReviewData } from "./review-service";

export type JournalItem =
  | { kind: "checkin"; at: string; record: DecisionRecord }
  | { kind: "flagged_trade"; at: string; flagged: FlaggedTrade };

export interface JournalData {
  items: JournalItem[];
  lastAnswer?: ReviewData["lastAnswer"];
}

const CHECKIN_LIMIT = 500;

/**
 * The decision journal is the stored history, newest first: every check-in the user completed (with
 * its assessment and pause outcome) and every imported trade that touched their rules. It reads the
 * same stored data and the same shared detector as the Review screen; nothing is generated.
 */
export async function loadJournal(db: ThehravDatabase, nowMs: number): Promise<JournalData> {
  const review = await loadReview(db, nowMs, CHECKIN_LIMIT);
  const items: JournalItem[] = [
    ...review.decisions.map((record): JournalItem => ({ kind: "checkin", at: record.checkIn.timestamp, record })),
    ...review.flagged.map((flagged): JournalItem => ({ kind: "flagged_trade", at: flagged.trade.timestamp, flagged }))
  ];
  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return { items, lastAnswer: review.lastAnswer };
}
