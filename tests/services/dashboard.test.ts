import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { runCheckIn, type CheckInInput } from "@/services/checkin-service";
import { describeDecision, loadDashboard } from "@/services/dashboard-service";
import { ThehravDatabase } from "@/storage/local/database";

const NOON = Date.UTC(2026, 9, 5, 6, 30, 0);
const DAY = 24 * 60 * 60 * 1000;

let db: ThehravDatabase;
let counter: number;
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

const calm: CheckInInput = {
  amountRupees: 2000,
  source: "surplus",
  borrowKind: "none",
  horizon: "months",
  reason: "Planned SIP top-up",
  exitCondition: "Review in six months"
};

const checkInAt = (at: number, input: Partial<CheckInInput> = {}) =>
  runCheckIn({ ...calm, ...input }, { db, now: () => at, newId, enqueue: async () => undefined });

beforeEach(async () => {
  counter = 0;
  db = new ThehravDatabase();
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("dashboard service", () => {
  it("shows nothing invented when no data is stored", async () => {
    const dashboard = await loadDashboard(db, NOON);
    expect(dashboard).toMatchObject({
      decisionsToday: 0,
      decisionsThisWeek: 0,
      adherencePercent: null,
      cooldownMinutes: 0,
      streakDays: 0,
      recent: [],
      pact: null
    });
  });

  it("lists the newest decisions first and picks up each new check-in", async () => {
    await checkInAt(NOON - 2 * 60_000, { reason: "First" });
    await checkInAt(NOON - 60_000, { reason: "Second", amountRupees: 7500 });

    let dashboard = await loadDashboard(db, NOON);
    expect(dashboard.recent.map((decision) => decision.reason)).toEqual(["Second", "First"]);
    expect(dashboard.recent[0]?.amountPaise).toBe(750_000);
    expect(dashboard.decisionsToday).toBe(2);

    await checkInAt(NOON, { reason: "Third" });
    await checkInAt(NOON + 1000, { reason: "Fourth" });
    dashboard = await loadDashboard(db, NOON + 2000);
    expect(dashboard.recent.map((decision) => decision.reason)).toEqual(["Fourth", "Third", "Second"]);
  });

  it("counts a streak of consecutive days with a check-in", async () => {
    await checkInAt(NOON - 2 * DAY);
    await checkInAt(NOON - DAY);
    await checkInAt(NOON);
    expect((await loadDashboard(db, NOON)).streakDays).toBe(3);
    expect((await loadDashboard(db, NOON + 3 * DAY)).streakDays).toBe(0);
  });

  it("labels how each decision ended", () => {
    expect(describeDecision({ tier: "L0", outcome: "continued" })).toEqual({ label: "Aligned", tone: "success" });
    expect(describeDecision({ tier: "L2", outcome: "abandoned" })).toEqual({ label: "Stepped back", tone: "success" });
    expect(describeDecision({ tier: "L2", outcome: "skipped_pause" }).tone).toBe("danger");
    expect(describeDecision({ tier: "L2", outcome: "waiting" }).label).toBe("Pausing");
  });
});
