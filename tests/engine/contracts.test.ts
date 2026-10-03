import { describe, expect, it } from "vitest";

import { assertValidEngineConfig, DEFAULT_ENGINE_CONFIG } from "@/config/defaults";
import { brokerEventSchema, checkInSchema, pactSchema, tradeSchema } from "@/lib/validation/schemas";

const id = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

describe("Phase 0 contracts", () => {
  it("uses normalized weights", () => {
    expect(() => assertValidEngineConfig(DEFAULT_ENGINE_CONFIG)).not.toThrow();
    expect(Object.values(DEFAULT_ENGINE_CONFIG.weights).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
  });

  it("accepts an allowlisted canonical trade", () => {
    expect(
      tradeSchema.parse({
        id,
        timestamp: "2026-10-03T12:00:00+05:30",
        symbol: "NIFTY26OCT",
        side: "buy",
        quantity: 1,
        pricePaise: 125_00,
        source: "synthetic"
      })
    ).toBeDefined();
  });

  it("rejects unknown privileged trade fields", () => {
    expect(() =>
      tradeSchema.parse({
        id,
        timestamp: "2026-10-03T12:00:00+05:30",
        symbol: "NIFTY26OCT",
        side: "buy",
        quantity: 1,
        pricePaise: 125_00,
        source: "synthetic",
        placeOrder: true
      })
    ).toThrow();
  });

  it("rejects order-mutation data at the broker event boundary", () => {
    expect(() =>
      brokerEventSchema.parse({
        id,
        userId,
        provider: "zerodha",
        providerEventId: "synthetic-event-1",
        observedAt: "2026-10-03T12:00:00+05:30",
        receivedAt: "2026-10-03T12:00:01+05:30",
        eventType: "order_update",
        status: "COMPLETE",
        dedupeHash: "a".repeat(64),
        cancelOrder: true
      })
    ).toThrow();
  });

  it("validates Pact and check-in boundaries", () => {
    expect(
      pactSchema.safeParse({
        id,
        dailyLossLimitPaise: 100_000,
        maximumTradesPerDay: 5,
        cooldownAfterLossMinutes: 15,
        blockedWindows: [],
        blockBorrowedFunds: true,
        blockEmergencyFunds: true,
        revision: 0,
        effectiveAt: "2026-10-03T12:00:00+05:30"
      }).success
    ).toBe(true);

    expect(
      checkInSchema.safeParse({
        id,
        timestamp: "2026-10-03T12:00:00+05:30",
        amountPaise: 50_000,
        fundSource: "borrowed",
        borrowKind: "instant_loan",
        horizon: "intraday",
        reason: "Synthetic test reason",
        exitCondition: "Synthetic test exit"
      }).success
    ).toBe(true);
  });
});
