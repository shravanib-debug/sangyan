import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { getEffectivePact } from "@/engine/pact";
import { describeHit } from "@/features/pause/describe-hit";
import { runCheckIn, pauseExpiry } from "@/services/checkin-service";
import { loadPactState, savePact } from "@/services/pact-service";
import { loadLocalPause, remainingSeconds, resolvePause } from "@/services/pause-service";
import { loadJournal } from "@/services/journal-service";
import { ThehravDatabase } from "@/storage/local/database";
import { checkInSyncSchema, pactSchema, pauseSyncSchema } from "@/lib/validation/schemas";

// 12:00 IST on a weekday: outside the default late-night window.
const NOON = Date.UTC(2026, 9, 5, 6, 30, 0);

let db: ThehravDatabase;
let queued: Array<{ entityType: string; payload: unknown; id: string }>;
let counter: number;
let clock: number;

const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
const enqueue = async (entityType: string, payload: unknown, id: string) => {
  queued.push({ entityType, payload, id });
};

const form = {
  dailyLossLimitRupees: 5000,
  maximumTradesPerDay: 5,
  cooldownAfterLossMinutes: 30,
  blockBorrowedFunds: true,
  blockEmergencyFunds: true
};
const pactDeps = () => ({ db, now: () => clock, newId, enqueue });
const checkInDeps = () => ({ db, now: () => clock, newId, enqueue });
const input = {
  amountRupees: 1000,
  source: "surplus" as const,
  borrowKind: "none" as const,
  horizon: "intraday" as const,
  reason: "I planned this last week",
  exitCondition: "Exit below my stop"
};

beforeEach(async () => {
  db = new ThehravDatabase();
  await Promise.all(db.tables.map((table) => table.clear()));
  queued = [];
  counter = 0;
  clock = NOON;
});

describe("Pact (offline, local-first)", () => {
  it("creates the first Pact immediately and queues it", async () => {
    const change = await savePact(form, pactDeps());
    expect(change.classification).toBe("tighten");
    const { effective, pending } = await loadPactState(db, clock);
    expect(effective?.maximumTradesPerDay).toBe(5);
    expect(pending).toBeNull();
    expect(queued).toHaveLength(1);
    expect(pactSchema.safeParse(queued[0]?.payload).success).toBe(true);
  });

  it("applies tightening immediately", async () => {
    await savePact(form, pactDeps());
    clock += 1000;
    await savePact({ ...form, maximumTradesPerDay: 3 }, pactDeps());
    expect((await loadPactState(db, clock)).effective?.maximumTradesPerDay).toBe(3);
  });

  it("holds loosening for 24 hours, then activates it", async () => {
    await savePact(form, pactDeps());
    clock += 1000;
    const change = await savePact({ ...form, maximumTradesPerDay: 9 }, pactDeps());
    expect(change.classification).toBe("loosen");

    const during = await loadPactState(db, clock);
    expect(during.effective?.maximumTradesPerDay).toBe(5);
    expect(during.pending?.maximumTradesPerDay).toBe(9);

    const after = await loadPactState(db, clock + 24 * 3_600_000 + 1);
    expect(after.effective?.maximumTradesPerDay).toBe(9);
  });

  it("lets a stricter edit cancel a pending loosening", async () => {
    await savePact(form, pactDeps());
    clock += 1000;
    await savePact({ ...form, maximumTradesPerDay: 9 }, pactDeps());
    clock += 1000;
    await savePact({ ...form, maximumTradesPerDay: 5 }, pactDeps());
    const state = await loadPactState(db, clock);
    expect(state.pending).toBeNull();
    expect(getEffectivePact(await db.pacts.toArray(), clock + 48 * 3_600_000)?.maximumTradesPerDay).toBe(5);
  });
});

describe("check-in and pause (offline, local-first)", () => {
  it("shows a clear result for surplus money inside the Pact", async () => {
    await savePact(form, pactDeps());
    const outcome = await runCheckIn(input, checkInDeps());
    expect(outcome.tier).toBe("L0");
    const view = await loadLocalPause(db, outcome.pauseId);
    expect(view?.pause.expiresAt).toBeUndefined();
    expect(remainingSeconds(view!.pause, clock)).toBe(0);
  });

  it("gives borrowed money a 2-minute pause with an explanation of why", async () => {
    await savePact(form, pactDeps());
    const outcome = await runCheckIn(
      { ...input, source: "borrowed", borrowKind: "instant_loan" },
      checkInDeps()
    );
    expect(outcome.tier).toBe("L2");

    const view = await loadLocalPause(db, outcome.pauseId);
    expect(remainingSeconds(view!.pause, clock)).toBe(120);
    const hit = view!.assessment.signalHits.find((candidate) => candidate.signal === "money_source");
    expect(hit).toBeDefined();
    expect(view!.assessment.hardRuleOverrides).toContain("money_source_borrowed");

    const description = describeHit(hit!);
    expect(description.key).toBe("signal.source.triggered");
    expect(description.observedKey).toBe("signal.sourceName.borrowed");
  });

  it("materially changes the complete persisted flow for a high-risk re-entry", async () => {
    await savePact(form, pactDeps());

    const low = await runCheckIn(input, checkInDeps());
    const lowView = await loadLocalPause(db, low.pauseId);
    expect(lowView?.assessment.score).toBe(0);
    expect(lowView?.assessment.signalHits).toEqual([]);
    expect(lowView?.pause.tier).toBe("L0");
    expect(lowView?.pause.expiresAt).toBeUndefined();

    clock += 60_000;
    await db.trades.put({
      id: "recent-loss",
      timestamp: new Date(clock - 5 * 60_000).toISOString(),
      symbol: "INFY",
      side: "sell",
      quantity: 10,
      pricePaise: 10_000,
      pnlPaise: -20_000,
      source: "csv"
    });

    const highInput = {
      ...input,
      amountRupees: 2_000,
      source: "borrowed" as const,
      borrowKind: "instant_loan" as const,
      reason: "I want to recover the recent loss",
      exitCondition: "No clear exit plan"
    };
    const high = await runCheckIn(highInput, checkInDeps());
    const highView = await loadLocalPause(db, high.pauseId);

    expect(highView?.assessment.score).toBe(0.75);
    expect(highView?.assessment.signalHits.map((hit) => hit.signal)).toEqual([
      "revenge",
      "pact_breach",
      "money_source"
    ]);
    expect(highView?.assessment.hardRuleOverrides).toEqual(["money_source_borrowed", "pact_breach_lock"]);
    expect(highView?.pause.tier).toBe("L3");
    expect(remainingSeconds(highView!.pause, clock)).toBe(30 * 60);

    await resolvePause(high.pauseId, "abandoned", { db, enqueue });
    const journal = await loadJournal(db, clock);
    const highEntry = journal.items.find(
      (item) => item.kind === "checkin" && item.record.checkIn.reason === highInput.reason
    );
    if (highEntry?.kind !== "checkin") throw new Error("expected the high-risk check-in in the journal");
    expect(highEntry.record.checkIn.amountPaise).toBe(200_000);
    expect(highEntry.record.assessment?.assessmentId).toBe(high.assessmentId);
    expect(highEntry.record.tier).toBe("L3");
    expect(highEntry.record.outcome).toBe("abandoned");
  });

  it("keeps the countdown across a reload because it derives from the stored expiry", async () => {
    const outcome = await runCheckIn({ ...input, source: "borrowed", borrowKind: "bank_loan" }, checkInDeps());
    const view = await loadLocalPause(db, outcome.pauseId);
    expect(remainingSeconds(view!.pause, clock + 100_000)).toBe(20);
    expect(remainingSeconds(view!.pause, clock + 500_000)).toBe(0);
  });

  it("queues sync payloads that satisfy the server's strict schemas", async () => {
    const outcome = await runCheckIn({ ...input, source: "emergency_fund" }, checkInDeps());
    const checkin = queued.find((item) => item.entityType === "checkin");
    const pause = queued.find((item) => item.entityType === "pause");
    expect(checkInSyncSchema.safeParse(checkin?.payload).success).toBe(true);
    expect(pauseSyncSchema.safeParse(pause?.payload).success).toBe(true);
    expect((checkin?.payload as { assessmentId: string }).assessmentId).toBe(outcome.assessmentId);
  });

  it("records the decision with a bumped revision and queues it", async () => {
    const outcome = await runCheckIn({ ...input, source: "borrowed", borrowKind: "bank_loan" }, checkInDeps());
    queued.length = 0;
    await resolvePause(outcome.pauseId, "abandoned", { db, enqueue });
    const view = await loadLocalPause(db, outcome.pauseId);
    expect(view?.pause.outcome).toBe("abandoned");
    expect(view?.pause.revision).toBe(1);
    expect(queued).toHaveLength(1);
    expect(pauseSyncSchema.parse(queued[0]?.payload).revision).toBe(1);
  });

  it("keeps check-ins fully local until sync is enabled (the queue is just pending items)", async () => {
    await runCheckIn(input, checkInDeps());
    expect(await db.checkins.count()).toBe(1);
    expect(await db.riskAssessments.count()).toBe(1);
    expect(await db.pauses.count()).toBe(1);
  });
});

describe("pause timing policy", () => {
  it("scales friction with the tier and uses the user's own cooldown for L3", () => {
    const pact = { cooldownAfterLossMinutes: 45 };
    expect(pauseExpiry("L0", NOON, pact)).toBeUndefined();
    expect(pauseExpiry("L1", NOON, pact)).toBe(new Date(NOON + 10_000).toISOString());
    expect(pauseExpiry("L2", NOON, pact)).toBe(new Date(NOON + 120_000).toISOString());
    expect(pauseExpiry("L3", NOON, pact)).toBe(new Date(NOON + 45 * 60_000).toISOString());
  });
});
