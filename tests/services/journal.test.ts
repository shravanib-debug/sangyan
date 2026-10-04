import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import { parseBrokerCsv } from "@/engine/csv-parser";
import { pairFifo } from "@/engine/fifo";
import { formatDateTime } from "@/i18n/format";
import { runCheckIn } from "@/services/checkin-service";
import { loadJournal } from "@/services/journal-service";
import { saveReviewAnswer } from "@/services/review-service";
import { ThehravDatabase } from "@/storage/local/database";

const NOON = Date.UTC(2026, 9, 5, 6, 30, 0);

let db: ThehravDatabase;
let counter: number;
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

beforeEach(async () => {
  counter = 0;
  db = new ThehravDatabase();
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("journal service", () => {
  it("is empty when nothing is stored", async () => {
    const journal = await loadJournal(db, NOON);
    expect(journal.items).toEqual([]);
    expect(journal.lastAnswer).toBeUndefined();
  });

  it("combines check-ins and flagged trades, newest first, from stored data only", async () => {
    const trades = pairFifo(parseBrokerCsv(readFileSync("fixtures/synthetic_revenge.csv", "utf8")).trades);
    await db.trades.bulkPut(trades);
    await runCheckIn(
      {
        amountRupees: 2500,
        source: "borrowed",
        borrowKind: "instant_loan",
        horizon: "days",
        reason: "Heard it from a friend",
        exitCondition: "Sell if it drops 5%"
      },
      { db, now: () => NOON, newId, enqueue: async () => undefined }
    );
    await saveReviewAnswer(db, "breached", NOON + 1000);

    const journal = await loadJournal(db, NOON + 60_000);
    const kinds = journal.items.map((item) => item.kind);
    expect(kinds).toContain("checkin");
    expect(kinds).toContain("flagged_trade");

    const times = journal.items.map((item) => new Date(item.at).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));

    const checkin = journal.items.find((item) => item.kind === "checkin");
    if (checkin?.kind !== "checkin") throw new Error("expected a check-in item");
    expect(checkin.record.checkIn.reason).toBe("Heard it from a friend");
    expect(checkin.record.assessment?.signalHits.length).toBeGreaterThan(0);
    expect(checkin.record.outcome).toBe("waiting");
    expect(journal.lastAnswer?.answer).toBe("breached");
  });
});

describe("formatDateTime", () => {
  it("uses the selected language and falls back to English for unknown ones", () => {
    const iso = "2026-10-02T12:05:00.000Z";
    expect(formatDateTime(iso, "en")).toBe(formatDateTime(iso, "xx"));
    expect(formatDateTime(iso, "hi")).not.toBe(formatDateTime(iso, "en"));
  });
});
