import { describe, it, expect } from "vitest";
import { isTighterOrEqual, mergePactsStrict, getEffectivePact } from "../../src/engine/pact";
import { Pact } from "../../src/engine/types";

describe("Pact Engine", () => {
  const basePact: Pact = {
    id: "p1",
    dailyLossLimitPaise: 500000,
    maximumTradesPerDay: 5,
    cooldownAfterLossMinutes: 30,
    blockBorrowedFunds: true,
    blockEmergencyFunds: false,
    blockedWindows: [{ startMinuteIst: 0, endMinuteIst: 360 }], // midnight to 6 AM
    revision: 1,
    effectiveAt: "2026-10-01T00:00:00Z"
  };

  describe("Tighter or looser classification", () => {
    it("recognizes stricter loss limit as tighter", () => {
      const proposed = { ...basePact, dailyLossLimitPaise: 200000 }; // 2k vs 5k limit
      expect(isTighterOrEqual(basePact, proposed)).toBe(true);
    });

    it("recognizes looser loss limit as NOT tighter", () => {
      const proposed = { ...basePact, dailyLossLimitPaise: 1000000 };
      expect(isTighterOrEqual(basePact, proposed)).toBe(false);
    });

    it("recognizes increased cooldown as tighter", () => {
      const proposed = { ...basePact, cooldownAfterLossMinutes: 60 };
      expect(isTighterOrEqual(basePact, proposed)).toBe(true);
    });

    it("recognizes allowing emergency funds as NOT tighter", () => {
      // base does NOT block emergency. So enabling it is tighter.
      const proposed = { ...basePact, blockEmergencyFunds: true };
      expect(isTighterOrEqual(basePact, proposed)).toBe(true);

      // if base DID block borrowed, disabling it is looser.
      const proposed2 = { ...basePact, blockBorrowedFunds: false };
      expect(isTighterOrEqual(basePact, proposed2)).toBe(false);
    });
  });

  describe("Strict multi-device conflict merge", () => {
    it("takes the strictest fields from both pacts", () => {
      const pactA = { ...basePact, dailyLossLimitPaise: 300000, maximumTradesPerDay: 10, revision: 2 };
      const pactB = { ...basePact, dailyLossLimitPaise: 400000, maximumTradesPerDay: 3, revision: 3, blockEmergencyFunds: true };
      
      const merged = mergePactsStrict(pactA, pactB);
      
      // Stricter loss limit from A
      expect(merged.dailyLossLimitPaise).toBe(300000);
      // Stricter max trades from B
      expect(merged.maximumTradesPerDay).toBe(3);
      // Emergency funds blocked because B blocked it
      expect(merged.blockEmergencyFunds).toBe(true);
      // Revision bumps above max
      expect(merged.revision).toBe(4);
    });

    it("merges blocked windows correctly", () => {
      const pactA = { ...basePact, blockedWindows: [{ startMinuteIst: 0, endMinuteIst: 100 }, { startMinuteIst: 200, endMinuteIst: 300 }] };
      const pactB = { ...basePact, blockedWindows: [{ startMinuteIst: 50, endMinuteIst: 150 }] };
      
      const merged = mergePactsStrict(pactA, pactB);
      // Should merge 0-100 and 50-150 into 0-150, and keep 200-300
      expect(merged.blockedWindows).toEqual([
        { startMinuteIst: 0, endMinuteIst: 150 },
        { startMinuteIst: 200, endMinuteIst: 300 }
      ]);
    });
  });

  describe("Delayed loosening and effective pact", () => {
    it("returns the correct effective pact based on fake-clock time", () => {
      const now = new Date("2026-10-03T10:00:00Z").getTime();
      
      const activePact = { ...basePact, revision: 1, effectiveAt: "2026-10-01T00:00:00Z" };
      // User tried to loosen it, server set effectiveAt 24 hours later
      const pendingLoosen = { ...basePact, dailyLossLimitPaise: 1000000, revision: 2, effectiveAt: "2026-10-04T10:00:00Z" };

      // Before effective time, the active pact is still revision 1
      const effective1 = getEffectivePact([activePact, pendingLoosen], now);
      expect(effective1?.revision).toBe(1);

      // After effective time, the active pact becomes revision 2
      const future = new Date("2026-10-05T10:00:00Z").getTime();
      const effective2 = getEffectivePact([activePact, pendingLoosen], future);
      expect(effective2?.revision).toBe(2);
    });
  });
});
