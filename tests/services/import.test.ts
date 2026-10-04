import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import { importBrokerCsvHistory } from "@/services/import-service";
import { loadReview } from "@/services/review-service";
import { ThehravDatabase } from "@/storage/local/database";

const NOW = Date.UTC(2026, 9, 5, 6, 30, 0);

let db: ThehravDatabase;

beforeEach(async () => {
  db = new ThehravDatabase();
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("local CSV import data flow", () => {
  it("persists canonical trades and changes replay signals when the re-entry row is removed", async () => {
    const sample = readFileSync("fixtures/synthetic_revenge.csv", "utf8");
    const complete = await importBrokerCsvHistory(sample, db, NOW);

    expect(complete.trades).toHaveLength(3);
    expect(await db.trades.count()).toBe(3);
    expect(complete.flaggedTrades.some((item) => item.hits.some((hit) => hit.signal === "revenge"))).toBe(true);

    const review = await loadReview(db, NOW);
    expect(review.totalTrades).toBe(3);
    expect(review.flagged.map((item) => item.trade.id)).toEqual(
      complete.flaggedTrades.map((item) => item.trade.id)
    );

    const withoutReentry = sample
      .split(/\r?\n/)
      .filter((row) => !row.startsWith("INFY,Buy,200,"))
      .join("\n");
    const changed = await importBrokerCsvHistory(withoutReentry, db, NOW);

    expect(changed.trades).toHaveLength(2);
    expect(await db.trades.count()).toBe(2);
    expect(changed.flaggedTrades.some((item) => item.hits.some((hit) => hit.signal === "revenge"))).toBe(false);
    expect(changed.flaggedTrades.length).toBeLessThan(complete.flaggedTrades.length);
  });
});
