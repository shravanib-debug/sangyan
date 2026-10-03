import { describe, it, expect } from "vitest";
import { evaluateRisk } from "../../src/engine/score";
import { Trade, Pact, WorkerDetectRequest } from "../../src/engine/types";
import { DEFAULT_ENGINE_CONFIG } from "../../src/config/defaults";

describe("Six-signal engine & Risk Score", () => {
  const basePact: Pact = {
    id: "p1",
    dailyLossLimitPaise: 500000,
    maximumTradesPerDay: 5,
    cooldownAfterLossMinutes: 30,
    blockBorrowedFunds: true,
    blockEmergencyFunds: false,
    blockedWindows: [{ startMinuteIst: 0, endMinuteIst: 360 }],
    revision: 1,
    effectiveAt: new Date().toISOString()
  };

  const createRequest = (history: Trade[], now: number, checkIn?: any): WorkerDetectRequest => ({
    history,
    pact: basePact,
    checkIn,
    nowEpochMs: now,
    config: DEFAULT_ENGINE_CONFIG
  });

  it("returns L0 and 0 score when no signals fire", () => {
    // Normal single trade, no losses, no pact breaches
    const trades: Trade[] = [
      { id: "1", timestamp: new Date("2026-10-03T10:00:00Z").toISOString(), symbol: "INFY", side: "buy", quantity: 10, pricePaise: 150000, source: "synthetic" }
    ];
    
    // Evaluate 10 minutes later (10:10 UTC = 15:40 IST -> Not late night)
    const result = evaluateRisk(createRequest(trades, new Date("2026-10-03T10:10:00Z").getTime()));
    
    expect(result.score).toBe(0);
    expect(result.tier).toBe("L0");
    expect(result.signalHits.length).toBe(0);
  });

  it("detects revenge trading (L1/L2)", () => {
    const lossTime = new Date("2026-10-03T10:00:00Z").getTime();
    const trades: Trade[] = [
      // A large loss 5 mins ago
      { id: "1", timestamp: new Date(lossTime).toISOString(), symbol: "INFY", side: "sell", quantity: 10, pricePaise: 150000, pnlPaise: -20000, source: "synthetic" }
    ];
    
    // Evaluate 5 mins later
    const result = evaluateRisk(createRequest(trades, lossTime + 5 * 60000));
    
    expect(result.signalHits.some(h => h.signal === "revenge")).toBe(true);
    // Also hits pact breach (cooldown after loss is 30m)
    expect(result.signalHits.some(h => h.signal === "pact_breach")).toBe(true);
    
    // Score should be 0.25 (revenge) + 0.25 (pact breach) = 0.50
    expect(result.score).toBe(0.50);
    // Pact breach hard rule forces L3
    expect(result.tier).toBe("L3");
  });

  it("detects overtrading", () => {
    const now = new Date("2026-10-03T10:00:00Z").getTime();
    const trades: Trade[] = Array.from({ length: 8 }).map((_, i) => ({
      id: `t${i}`, timestamp: new Date(now - i * 60000).toISOString(), symbol: "INFY", side: "buy", quantity: 10, pricePaise: 150000, source: "synthetic"
    }));
    
    const result = evaluateRisk(createRequest(trades, now));
    expect(result.signalHits.some(h => h.signal === "overtrade")).toBe(true);
    // Also hits pact breach (max 5 trades)
    expect(result.signalHits.some(h => h.signal === "pact_breach")).toBe(true);
    
    // overtrade (0.10) + breach (0.25) = 0.35
    expect(result.score).toBe(0.35);
    // Total = 0.10 + 0.25 = 0.35 -> L1, BUT breach gives hard rule L3
    expect(result.tier).toBe("L3");
    expect(result.hardRuleOverrides).toContain("pact_breach_lock");
  });

  it("applies hard rule overrides for borrowed money", () => {
    const now = new Date("2026-10-03T10:00:00Z").getTime();
    const result = evaluateRisk(createRequest([], now, { fundSource: "borrowed" }));
    
    // Score is just 0.25 from source, which is L1. But borrowed hard rule is L2.
    expect(result.score).toBe(0.25);
    expect(result.tier).toBe("L2");
    expect(result.hardRuleOverrides).toContain("money_source_borrowed");
  });
});
