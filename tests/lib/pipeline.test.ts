import { describe, expect, it } from "vitest";

import { applyPactChange } from "@/engine/pact";
import type { BrokerEvent, Pact } from "@/engine/types";
import { assessBrokerEvent, eventToRow } from "@/lib/pipeline/assess";
import { tradesFromEvents, type TradeEventRow } from "@/lib/pipeline/history";
import { brokerEventSchema, checkInSyncSchema, pauseSyncSchema, syncRequestSchema } from "@/lib/validation/schemas";

// 12:00 IST: outside the default late-night window.
const NOON = Date.UTC(2026, 9, 5, 6, 30, 0);
const iso = (offsetSeconds: number) => new Date(NOON + offsetSeconds * 1000).toISOString();

let counter = 0;
const id = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

function fill(offset: number, side: "buy" | "sell", quantity: number, pricePaise: number): TradeEventRow {
  return {
    id: id(),
    observed_at: iso(offset),
    symbol: "SIMULATED",
    side,
    quantity,
    average_price_paise: pricePaise,
    status: "COMPLETE"
  };
}

function toEvent(row: TradeEventRow): BrokerEvent {
  return {
    id: row.id,
    userId: "00000000-0000-4000-8000-0000000000aa",
    provider: "zerodha",
    providerEventId: `p-${row.id}`,
    observedAt: row.observed_at,
    receivedAt: row.observed_at,
    eventType: "trade_update",
    status: "COMPLETE",
    symbol: row.symbol ?? undefined,
    side: row.side ?? undefined,
    quantity: Number(row.quantity),
    averagePricePaise: Number(row.average_price_paise),
    dedupeHash: "a".repeat(64)
  };
}

describe("broker fill history", () => {
  it("derives realised P&L by FIFO pairing and ignores non-fills", () => {
    const rows = [
      fill(0, "buy", 10, 10_000),
      { ...fill(5, "buy", 1, 1), status: "OPEN" },
      fill(15, "sell", 10, 8_500)
    ];
    const trades = tradesFromEvents(rows);
    expect(trades).toHaveLength(2);
    expect(trades[1]?.pnlPaise).toBe(-15_000);
    expect(trades.every((trade) => trade.source === "connected")).toBe(true);
  });

  it("is order independent: rows are sorted by time before pairing", () => {
    const buy = fill(0, "buy", 10, 10_000);
    const sell = fill(15, "sell", 10, 12_000);
    expect(tradesFromEvents([sell, buy])[1]?.pnlPaise).toBe(20_000);
  });
});

describe("broker event assessment", () => {
  const buy = fill(0, "buy", 10, 10_000);
  const loss = fill(15, "sell", 10, 8_500);
  const reentry = fill(30, "buy", 15, 8_500);

  it("raises no pause for the first, unremarkable fill", () => {
    const result = assessBrokerEvent({ event: toEvent(buy), history: [], pact: null, newId: id });
    expect(result.result.tier).toBe("L0");
    expect(result.pause).toBeNull();
  });

  it("explains a larger re-entry right after a loss and locks until the cooldown", () => {
    const outcome = assessBrokerEvent({
      event: toEvent(reentry),
      history: [buy, loss],
      pact: null,
      newId: id
    });
    const signals = outcome.result.signalHits.map((hit) => hit.signal);
    expect(signals).toContain("revenge");
    expect(signals).toContain("pact_breach");
    expect(outcome.result.tier).toBe("L3");
    expect(outcome.pause?.expiresAt).toBe(iso(30 + 30 * 60));
    // I8: every hit carries value, threshold and a non-zero contribution.
    for (const hit of outcome.result.signalHits) {
      expect(hit.threshold).toBeDefined();
      expect(hit.contribution).toBeGreaterThan(0);
    }
  });

  it("is deterministic for identical inputs", () => {
    const run = () =>
      assessBrokerEvent({ event: toEvent(reentry), history: [buy, loss], pact: null, newId: () => "fixed" }).result;
    expect(run()).toEqual(run());
  });

  it("does not double count an event already present in history", () => {
    const withSelf = assessBrokerEvent({
      event: toEvent(reentry),
      history: [buy, loss, reentry],
      pact: null,
      newId: id
    });
    const without = assessBrokerEvent({ event: toEvent(reentry), history: [buy, loss], pact: null, newId: id });
    expect(withSelf.result.score).toBe(without.result.score);
  });

  it("uses the user's own Pact when one exists", () => {
    const lenient: Pact = {
      id: id(),
      dailyLossLimitPaise: 100_000_000,
      maximumTradesPerDay: 100,
      cooldownAfterLossMinutes: 1,
      blockedWindows: [],
      blockBorrowedFunds: false,
      blockEmergencyFunds: false,
      revision: 3,
      effectiveAt: iso(-3600)
    };
    const outcome = assessBrokerEvent({ event: toEvent(reentry), history: [buy, loss], pact: lenient, newId: id });
    // The breach explanation quotes the user's own cooldown, not a default.
    const breach = outcome.result.signalHits.find((hit) => hit.signal === "pact_breach");
    expect(breach?.explanationCode).toBe("signal.breach.cooldown");
    expect(breach?.threshold).toBe(1);
  });

  it("maps events back to rows for history pairing", () => {
    expect(eventToRow(toEvent(buy)).status).toBe("COMPLETE");
  });
});

describe("boundary schemas", () => {
  const event = toEvent(buy());
  function buy() {
    return fill(0, "buy", 1, 100);
  }

  it("accepts a canonical event, with or without the simulated flag", () => {
    expect(brokerEventSchema.safeParse(event).success).toBe(true);
    expect(brokerEventSchema.safeParse({ ...event, simulated: true }).success).toBe(true);
  });

  it("rejects unknown privileged fields and bad hashes", () => {
    expect(brokerEventSchema.safeParse({ ...event, accessToken: "x" }).success).toBe(false);
    expect(brokerEventSchema.safeParse({ ...event, dedupeHash: "short" }).success).toBe(false);
  });

  it("validates sync payloads strictly", () => {
    const checkIn = {
      id: id(),
      timestamp: iso(0),
      amountPaise: 100_000,
      fundSource: "borrowed",
      borrowKind: "instant_loan",
      horizon: "intraday",
      reason: "r",
      exitCondition: "e",
      assessmentId: id()
    };
    expect(checkInSyncSchema.safeParse(checkIn).success).toBe(true);
    expect(checkInSyncSchema.safeParse({ ...checkIn, tier: "L0" }).success).toBe(false);
    expect(pauseSyncSchema.safeParse({ id: id(), assessmentId: id(), tier: "L2", startedAt: iso(0), expiresAt: null, outcome: "waiting", revision: 0 }).success).toBe(true);
    expect(pauseSyncSchema.safeParse({ id: id(), assessmentId: id(), tier: "L9", startedAt: iso(0), outcome: "waiting" }).success).toBe(false);
    expect(syncRequestSchema.safeParse({ items: Array.from({ length: 51 }, () => ({ id: "x", entityType: "pact", payload: {} })) }).success).toBe(false);
  });
});

describe("applyPactChange", () => {
  const delay = 24 * 3_600_000;
  const base: Pact = {
    id: "00000000-0000-4000-8000-0000000000b1",
    dailyLossLimitPaise: 500_000,
    maximumTradesPerDay: 5,
    cooldownAfterLossMinutes: 30,
    blockedWindows: [{ startMinuteIst: 0, endMinuteIst: 360 }],
    blockBorrowedFunds: true,
    blockEmergencyFunds: true,
    revision: 1,
    effectiveAt: iso(-100)
  };
  const propose = (patch: Partial<Pact>): Pact => ({ ...base, ...patch, id: id(), revision: 2, effectiveAt: iso(0) });

  it("creates the first Pact immediately", () => {
    const result = applyPactChange(null, propose({}), NOON, delay);
    expect(result.classification).toBe("tighten");
    expect(result.effective.effectiveAt).toBe(iso(0));
    expect(result.pending).toBeUndefined();
  });

  it("applies tightening immediately", () => {
    const result = applyPactChange(base, propose({ maximumTradesPerDay: 3 }), NOON, delay);
    expect(result.classification).toBe("tighten");
    expect(result.effective.maximumTradesPerDay).toBe(3);
    expect(result.effective.revision).toBe(2);
    expect(result.pending).toBeUndefined();
  });

  it("holds loosening back for the delay on the injected clock", () => {
    const result = applyPactChange(base, propose({ maximumTradesPerDay: 9 }), NOON, delay);
    expect(result.classification).toBe("loosen");
    expect(result.effective).toBe(base);
    expect(result.effective.maximumTradesPerDay).toBe(5);
    expect(result.pending?.maximumTradesPerDay).toBe(9);
    expect(result.pending?.effectiveAt).toBe(new Date(NOON + delay).toISOString());
    expect(result.pending?.id).not.toBe(result.effective.id);
  });

  it("tightens now and loosens later on a mixed edit", () => {
    const result = applyPactChange(base, propose({ maximumTradesPerDay: 3, cooldownAfterLossMinutes: 10 }), NOON, delay);
    expect(result.classification).toBe("mixed");
    expect(result.effective.maximumTradesPerDay).toBe(3);
    expect(result.effective.cooldownAfterLossMinutes).toBe(30);
    expect(result.pending?.cooldownAfterLossMinutes).toBe(10);
  });

  it("treats an unchanged request as a no-op", () => {
    const result = applyPactChange(base, propose({}), NOON, delay);
    expect(result.classification).toBe("none");
    expect(result.effective).toBe(base);
  });
});
