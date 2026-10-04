import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_CONFIG } from "@/config/defaults";
import { applyPactChange, isTighterOrEqual, mergePactsStrict } from "@/engine/pact";
import { evaluateRisk } from "@/engine/score";
import { detectBreach, detectSizeEscalation } from "@/engine/signals";
import type { CheckIn, Pact, Trade, WorkerDetectRequest } from "@/engine/types";
import { pactFromRow } from "@/lib/pipeline/pact-store";
import { checkInSyncSchema } from "@/lib/validation/schemas";
import { refreshBrokerHistory } from "@/services/broker-history";
import { moneySourceFigures, runCheckIn } from "@/services/checkin-service";
import { adoptStricterServerResult, loadLocalPause } from "@/services/pause-service";
import { ThehravDatabase } from "@/storage/local/database";

// 12:00 IST: outside the default late-night window and the default 00:00-06:00 Pact window.
const NOON = Date.UTC(2026, 9, 5, 6, 30, 0);
const ONE_THIRTY_AM_IST = Date.UTC(2026, 9, 4, 20, 0, 0);

const pact: Pact = {
  id: "p1",
  dailyLossLimitPaise: 500_000,
  maximumTradesPerDay: 5,
  cooldownAfterLossMinutes: 30,
  blockedWindows: [{ startMinuteIst: 0, endMinuteIst: 360 }],
  blockBorrowedFunds: false,
  blockEmergencyFunds: false,
  revision: 1,
  effectiveAt: new Date(0).toISOString()
};

type CheckInPart = NonNullable<WorkerDetectRequest["checkIn"]>;
const checkIn = (overrides: Partial<CheckInPart> = {}): CheckInPart => ({
  amountPaise: 100_000,
  fundSource: "surplus",
  borrowKind: "none",
  timestamp: new Date(NOON).toISOString(),
  horizon: "weeks",
  exitPlan: "price_level",
  triggers: ["own_research"],
  ...overrides
});
const risk = (input: Partial<WorkerDetectRequest>) =>
  evaluateRisk({
    history: [],
    pact,
    pactCommitted: false,
    nowEpochMs: NOON,
    config: DEFAULT_ENGINE_CONFIG,
    ...input
  });

const buy = (id: string, minutesAgo: number, notionalRupees: number): Trade => ({
  id,
  timestamp: new Date(NOON - minutesAgo * 60_000).toISOString(),
  symbol: "INFY",
  side: "buy",
  quantity: 1,
  pricePaise: notionalRupees * 100,
  source: "csv"
});

describe("#2 graded money source (SPEC §8.4 weight x signal strength)", () => {
  it("scores savings, emergency and borrowed by their triage strength; floors unchanged", () => {
    const savings = risk({ checkIn: checkIn({ fundSource: "savings" }) });
    expect(savings.score).toBe(0.1);
    expect(savings.tier).toBe("L0");
    expect(savings.signalHits[0]?.contribution).toBeCloseTo(0.1, 10);

    const emergency = risk({ checkIn: checkIn({ fundSource: "emergency_fund" }) });
    expect(emergency.score).toBe(0.2);
    expect(emergency.tier).toBe("L1");
    expect(emergency.hardRuleOverrides).toContain("money_source_emergency_fund");

    const borrowed = risk({ checkIn: checkIn({ fundSource: "borrowed", borrowKind: "bank_loan" }) });
    expect(borrowed.score).toBe(0.25);
    expect(borrowed.tier).toBe("L2");
  });
});

describe("#1 structured plan floors", () => {
  it("planned or researched decisions with a set exit add nothing", () => {
    const result = risk({ checkIn: checkIn({ triggers: ["own_research", "planned"], horizon: "intraday" }) });
    expect(result.tier).toBe("L0");
    expect(result.hardRuleOverrides).toEqual([]);
  });

  it.each(["recover_loss", "tip", "fomo"] as const)("a self-reported %s trigger gets at least L1, score unchanged", (trigger) => {
    const result = risk({ checkIn: checkIn({ triggers: [trigger] }) });
    expect(result.score).toBe(0);
    expect(result.tier).toBe("L1");
    expect(result.hardRuleOverrides).toEqual([`plan_trigger_${trigger}`]);
  });

  it("no exit plan gets at least L1 only on intraday or borrowed-money trades", () => {
    expect(risk({ checkIn: checkIn({ exitPlan: "undecided", horizon: "intraday" }) }).hardRuleOverrides).toEqual(["plan_no_exit"]);
    const borrowed = risk({ checkIn: checkIn({ exitPlan: "undecided", fundSource: "borrowed", borrowKind: "bank_loan" }) });
    expect(borrowed.hardRuleOverrides).toContain("plan_no_exit");
    expect(borrowed.tier).toBe("L2");
    const longTerm = risk({ checkIn: checkIn({ exitPlan: "undecided", horizon: "years" }) });
    expect(longTerm.tier).toBe("L0");
    expect(longTerm.hardRuleOverrides).toEqual([]);
  });

  it("a floor never locks: L3 still needs a committed Pact breach", () => {
    const result = risk({ checkIn: checkIn({ triggers: ["recover_loss", "tip", "fomo"], exitPlan: "undecided", horizon: "intraday" }) });
    expect(result.tier).toBe("L1");
  });
});

describe("#3 amount vs the user's own limits", () => {
  const capped: Pact = { ...pact, blockedWindows: [], maxPositionPaise: 5_000_000 };

  it("a check-in above the Pact's per-trade cap is a breach and locks", () => {
    const over = risk({ pact: capped, pactCommitted: true, checkIn: checkIn({ amountPaise: 6_000_000 }) });
    expect(over.signalHits.map((hit) => hit.explanationCode)).toContain("signal.breach.position_size");
    expect(over.tier).toBe("L3");
    expect(risk({ pact: capped, pactCommitted: true, checkIn: checkIn({ amountPaise: 5_000_000 }) }).tier).toBe("L0");
  });

  it("applies the cap to a broker fill observed now, and not without a cap", () => {
    const fill: Trade = { ...buy("now", 0, 70_000) };
    expect(detectBreach([fill], capped, NOON)?.explanationCode).toBe("signal.breach.position_size");
    expect(detectBreach([fill], { ...capped, maxPositionPaise: undefined }, NOON)).toBeNull();
  });

  it("notes a position at least 2x the median of recent ones, without adding to the score", () => {
    const history = [10, 20, 30, 40, 50].map((minutes) => buy(`b${minutes}`, minutes, 10_000));
    const result = risk({ history, checkIn: checkIn({ amountPaise: 2_500_000 }) });
    const hit = result.signalHits.find((candidate) => candidate.signal === "size_escalation");
    expect(hit?.observedValue).toBe(2.5);
    expect(hit?.contribution).toBe(0);
    expect(result.score).toBe(0);
    const rule = { multiple: 2, lookbackTrades: 10, minimumTrades: 5 };
    expect(detectSizeEscalation(history.slice(0, 4), NOON, 2_500_000, rule)).toBeNull();
    expect(detectSizeEscalation(history, NOON, 1_900_000, rule)).toBeNull();
  });

  it("treats a lower cap as tightening and removing or raising it as loosening", () => {
    const withCap = { ...pact, maxPositionPaise: 5_000_000 };
    expect(isTighterOrEqual(pact, withCap)).toBe(true);
    expect(isTighterOrEqual(withCap, { ...withCap, maxPositionPaise: 4_000_000 })).toBe(true);
    expect(isTighterOrEqual(withCap, { ...withCap, maxPositionPaise: 6_000_000 })).toBe(false);
    expect(isTighterOrEqual(withCap, { ...pact })).toBe(false);
    expect(mergePactsStrict(withCap, { ...pact, maxPositionPaise: 3_000_000 }).maxPositionPaise).toBe(3_000_000);
    expect(mergePactsStrict(withCap, pact).maxPositionPaise).toBe(5_000_000);
    expect("maxPositionPaise" in mergePactsStrict(pact, pact)).toBe(false);
    const removed = applyPactChange(withCap, { ...pact, id: "p2" }, NOON, 86_400_000);
    expect(removed.classification).toBe("loosen");
    expect(removed.pending?.maxPositionPaise).toBeUndefined();
  });

  it("maps the database column both ways", () => {
    const row = {
      id: "p1",
      user_id: "u1",
      daily_loss_limit_paise: "500000",
      maximum_trades_per_day: 5,
      cooldown_after_loss_minutes: 30,
      blocked_windows: [],
      block_borrowed_funds: true,
      block_emergency_funds: true,
      revision: "2",
      effective_at: new Date(0).toISOString()
    };
    expect(pactFromRow({ ...row, max_position_paise: "5000000" }).maxPositionPaise).toBe(5_000_000);
    expect("maxPositionPaise" in pactFromRow({ ...row, max_position_paise: null })).toBe(false);
  });
});

describe("#5 trading inside a committed no-trade window is a Pact breach", () => {
  it("breaches and locks with a committed Pact; stays a late-night signal without one", () => {
    const committed = risk({ pactCommitted: true, nowEpochMs: ONE_THIRTY_AM_IST, history: [] });
    expect(committed.signalHits.map((hit) => hit.explanationCode)).toEqual([
      "signal.late_night.triggered",
      "signal.breach.window"
    ]);
    expect(committed.tier).toBe("L3");

    const uncommitted = risk({ pactCommitted: false, nowEpochMs: ONE_THIRTY_AM_IST });
    expect(uncommitted.signalHits.map((hit) => hit.signal)).toEqual(["late_night"]);
    expect(uncommitted.tier).toBe("L0");
  });

  it("does not fire outside the window", () => {
    expect(detectBreach([], pact, NOON)).toBeNull();
  });
});

describe("check-in service", () => {
  let db: ThehravDatabase;
  let queued: Array<{ entityType: string; payload: unknown }>;
  let counter = 0;
  const deps = () => ({
    db,
    now: () => NOON,
    newId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
    enqueue: async (entityType: string, payload: unknown) => {
      queued.push({ entityType, payload });
    }
  });
  const base = {
    amountRupees: 50_000,
    source: "emergency_fund" as const,
    borrowKind: "none" as const,
    horizon: "weeks" as const,
    reason: "Planned",
    exitCondition: "Below my stop",
    exitPlan: "price_level" as const,
    triggers: ["planned" as const]
  };

  beforeEach(async () => {
    db = new ThehravDatabase();
    await Promise.all(db.tables.map((table) => table.clear()));
    queued = [];
  });

  it("keeps the money-source inputs on the device and syncs the plan", async () => {
    await runCheckIn({ ...base, emergencyFundRupees: 300_000, monthlyExpensesRupees: 50_000 }, deps());
    const stored = (await db.checkins.toArray())[0]!;
    expect(stored.emergencyFundBalancePaise).toBe(30_000_000);
    const payload = queued.find((item) => item.entityType === "checkin")!.payload as Record<string, unknown>;
    expect(checkInSyncSchema.safeParse(payload).success).toBe(true);
    expect(payload).not.toHaveProperty("emergencyFundBalancePaise");
    expect(payload).not.toHaveProperty("monthlyExpensesPaise");
    expect(payload).toMatchObject({ exitPlan: "price_level", triggers: ["planned"] });
    expect(checkInSyncSchema.safeParse({ ...payload, loanYears: 2 }).success).toBe(false);
  });

  it("computes runway and loan break-even from the user's own inputs (SPEC §8.2)", () => {
    const emergency = {
      fundSource: "emergency_fund",
      amountPaise: 5_000_000,
      emergencyFundBalancePaise: 30_000_000,
      monthlyExpensesPaise: 5_000_000
    } as CheckIn;
    expect(moneySourceFigures(emergency).runway).toEqual({ beforeMonths: 6, afterMonths: 5 });
    const loan = { fundSource: "borrowed", amountPaise: 1, loanAnnualRatePercent: 18, loanYears: 2 } as CheckIn;
    expect(moneySourceFigures(loan).loanBreakEven?.requiredReturn).toBeCloseTo(0.3924, 4);
    expect(moneySourceFigures({ fundSource: "surplus", amountPaise: 1 } as CheckIn)).toEqual({});
  });

  it("#4 copies the user's own broker fills into local history, only with sync enabled", async () => {
    const rows = [
      { id: "11111111-1111-4111-8111-111111111111", observed_at: new Date(NOON - 600_000).toISOString(), symbol: "INFY", side: "buy", quantity: 10, average_price_paise: 150_000, status: "COMPLETE" },
      { id: "22222222-2222-4222-8222-222222222222", observed_at: new Date(NOON - 300_000).toISOString(), symbol: "INFY", side: "sell", quantity: 10, average_price_paise: 140_000, status: "COMPLETE" }
    ];
    const fetchImpl = (async () => new Response(JSON.stringify({ rows }))) as unknown as typeof fetch;
    expect(await refreshBrokerHistory(db, { syncEnabled: async () => false, fetchImpl })).toBe("skipped");
    expect(await refreshBrokerHistory(db, { syncEnabled: async () => true, fetchImpl })).toEqual({ stored: 2 });
    const trades = await db.trades.toArray();
    expect(trades.map((trade) => trade.source)).toEqual(["connected", "connected"]);
    expect(trades.find((trade) => trade.side === "sell")?.pnlPaise).toBe(-100_000);
    const offline = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await refreshBrokerHistory(db, { syncEnabled: async () => true, fetchImpl: offline })).toBe("unavailable");
  });

  it("#4 adopts a stricter server re-check, never a looser one, and keeps the local decision", async () => {
    const outcome = await runCheckIn({ ...base, source: "surplus", triggers: ["tip"] }, deps());
    expect(outcome.tier).toBe("L1");
    const local = (await loadLocalPause(db, outcome.pauseId))!;
    const remote = (tier: "L0" | "L3") =>
      (async () =>
        new Response(
          JSON.stringify({
            pause: { id: local.pause.id, assessment_id: "a2", tier, started_at: local.pause.startedAt, expires_at: null, outcome: "waiting", revision: 0 },
            assessment: {
              id: "a2",
              score: "0.25",
              tier,
              signal_hits: [],
              hard_rule_overrides: ["pact_breach_lock"],
              engine_version: "v",
              config_version: "v",
              evaluated_at: local.pause.startedAt
            },
            simulated: false
          })
        )) as unknown as typeof fetch;

    expect(await adoptStricterServerResult(db, outcome.pauseId, NOON, remote("L0"))).toBeNull();
    expect((await loadLocalPause(db, outcome.pauseId))?.pause.tier).toBe("L1");

    const updated = await adoptStricterServerResult(db, outcome.pauseId, NOON, remote("L3"));
    expect(updated?.pause.tier).toBe("L3");
    expect(updated?.pause.expiresAt).toBe(new Date(NOON + 30 * 60_000).toISOString());
    expect(updated?.pause.outcome).toBe("waiting");
    expect((await loadLocalPause(db, outcome.pauseId))?.assessment.hardRuleOverrides).toEqual(["pact_breach_lock"]);
  });
});
