import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import { parseBrokerCsv } from "@/engine/csv-parser";
import { pairFifo } from "@/engine/fifo";
import { runCheckIn } from "@/services/checkin-service";
import { DEFAULT_REPLAY_PACT, replayHistory } from "@/services/replay-service";
import { loadReview, saveReviewAnswer } from "@/services/review-service";
import { ThehravDatabase } from "@/storage/local/database";

const NOON = Date.UTC(2026, 9, 5, 6, 30, 0);

let db: ThehravDatabase;
let counter: number;
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

function fixtureTrades(name: string) {
  return pairFifo(parseBrokerCsv(readFileSync(`fixtures/${name}`, "utf8")).trades);
}

beforeEach(async () => {
  counter = 0;
  db = new ThehravDatabase();
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("review service", () => {
  it("returns an empty review when nothing is stored", async () => {
    const review = await loadReview(db, NOON);
    expect(review.totalTrades).toBe(0);
    expect(review.flagged).toEqual([]);
    expect(review.signalCounts).toEqual({});
    expect(review.decisions).toEqual([]);
    expect(review.lastAnswer).toBeUndefined();
  });

  it("derives flagged trades from stored trades with the shared detector", async () => {
    const trades = fixtureTrades("synthetic_revenge.csv");
    await db.trades.bulkPut(trades);

    const review = await loadReview(db, NOON);
    const expected = replayHistory(
      [...trades].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      DEFAULT_REPLAY_PACT
    );

    expect(review.totalTrades).toBe(trades.length);
    expect(review.flagged.length).toBeGreaterThan(0);
    expect(review.flagged.map((f) => f.trade.id)).toEqual(expected.map((f) => f.trade.id));
    const counted = Object.values(review.signalCounts).reduce((sum, count) => sum + (count ?? 0), 0);
    expect(counted).toBe(review.flagged.reduce((sum, f) => sum + f.hits.length, 0));
  });

  it("lists recent check-ins with their pause tier and outcome", async () => {
    await runCheckIn(
      {
        amountRupees: 1000,
        source: "surplus",
        borrowKind: "none",
        horizon: "intraday",
        reason: "Planned last week",
        exitCondition: "Exit at my stop"
      },
      { db, now: () => NOON, newId, enqueue: async () => undefined }
    );

    const review = await loadReview(db, NOON + 60_000);
    expect(review.decisions).toHaveLength(1);
    expect(review.decisions[0]?.checkIn.reason).toBe("Planned last week");
    expect(review.decisions[0]?.tier).toBeDefined();
    expect(review.decisions[0]?.outcome).toBe("waiting");
  });

  it("links each check-in to its own assessment even when timestamps collide", async () => {
    const deps = { db, now: () => NOON, newId, enqueue: async () => undefined };
    await runCheckIn(
      {
        amountRupees: 1000,
        source: "surplus",
        borrowKind: "none",
        horizon: "days",
        reason: "calm plan",
        exitCondition: "fixed stop"
      },
      deps
    );
    await runCheckIn(
      {
        amountRupees: 25000,
        source: "borrowed",
        borrowKind: "instant_loan",
        horizon: "intraday",
        reason: "changed input",
        exitCondition: "none yet"
      },
      deps
    );

    const review = await loadReview(db, NOON);
    const calm = review.decisions.find((decision) => decision.checkIn.reason === "calm plan");
    const changed = review.decisions.find((decision) => decision.checkIn.reason === "changed input");

    expect(calm?.assessment?.score).toBe(0);
    expect(calm?.tier).toBe("L0");
    expect(changed?.assessment?.score).toBe(0.25);
    expect(changed?.tier).toBe("L2");
    expect(calm?.assessment?.assessmentId).not.toBe(changed?.assessment?.assessmentId);
  });

  it("keeps the reflection answer on the device only", async () => {
    await saveReviewAnswer(db, "followed", NOON);
    const review = await loadReview(db, NOON);
    expect(review.lastAnswer?.answer).toBe("followed");
    expect(await db.syncQueue.count()).toBe(0);
  });
});
