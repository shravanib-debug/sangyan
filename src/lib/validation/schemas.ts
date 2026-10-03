import { z } from "zod";

export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const uuidSchema = z.string().uuid();
export const nonNegativePaiseSchema = z.number().int().nonnegative().max(10_000_000_00);

export const tradeSchema = z
  .object({
    id: uuidSchema,
    timestamp: isoDateTimeSchema,
    symbol: z.string().trim().min(1).max(32).regex(/^[A-Z0-9._-]+$/),
    side: z.enum(["buy", "sell"]),
    quantity: z.number().positive().finite(),
    pricePaise: nonNegativePaiseSchema,
    pnlPaise: z.number().int().finite().optional(),
    orderId: z.string().trim().min(1).max(128).optional(),
    source: z.enum(["csv", "synthetic", "connected"])
  })
  .strict();

export const brokerEventSchema = z
  .object({
    id: uuidSchema,
    userId: uuidSchema,
    provider: z.enum(["zerodha", "angel_one"]),
    providerEventId: z.string().trim().min(1).max(160),
    providerOrderId: z.string().trim().min(1).max(160).optional(),
    observedAt: isoDateTimeSchema,
    receivedAt: isoDateTimeSchema,
    eventType: z.enum(["order_update", "trade_update", "reconciliation"]),
    status: z.string().trim().min(1).max(64),
    symbol: z.string().trim().min(1).max(32).optional(),
    side: z.enum(["buy", "sell"]).optional(),
    quantity: z.number().positive().finite().optional(),
    averagePricePaise: nonNegativePaiseSchema.optional(),
    pnlPaise: z.number().int().finite().optional(),
    dedupeHash: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict();

export const pactSchema = z
  .object({
    id: uuidSchema,
    userId: uuidSchema.optional(),
    dailyLossLimitPaise: nonNegativePaiseSchema,
    maximumTradesPerDay: z.number().int().min(1).max(100),
    cooldownAfterLossMinutes: z.number().int().min(1).max(1440),
    blockedWindows: z
      .array(
        z
          .object({
            startMinuteIst: z.number().int().min(0).max(1439),
            endMinuteIst: z.number().int().min(0).max(1439)
          })
          .strict()
      )
      .max(8),
    blockBorrowedFunds: z.boolean(),
    blockEmergencyFunds: z.boolean(),
    revision: z.number().int().nonnegative(),
    effectiveAt: isoDateTimeSchema
  })
  .strict();

export const checkInSchema = z
  .object({
    id: uuidSchema,
    userId: uuidSchema.optional(),
    timestamp: isoDateTimeSchema,
    amountPaise: nonNegativePaiseSchema,
    fundSource: z.enum(["surplus", "savings", "emergency_fund", "borrowed"]),
    borrowKind: z.enum(["none", "bank_loan", "instant_loan", "credit_card", "other"]),
    horizon: z.enum(["intraday", "days", "weeks", "months", "years"]),
    reason: z.string().trim().min(1).max(1000),
    exitCondition: z.string().trim().min(1).max(500)
  })
  .strict();

export const syncMetadataSchema = z
  .object({
    id: uuidSchema,
    userId: uuidSchema.optional(),
    clientCreatedAt: isoDateTimeSchema,
    serverReceivedAt: isoDateTimeSchema.optional(),
    revision: z.number().int().nonnegative(),
    idempotencyKey: z.string().trim().min(16).max(128),
    syncStatus: z.enum(["local_only", "pending", "synced", "conflict"])
  })
  .strict();

export const brokerConnectionSummarySchema = z
  .object({
    provider: z.enum(["zerodha", "angel_one"]),
    status: z.enum([
      "disconnected",
      "connecting",
      "live",
      "reconnecting",
      "stale",
      "reauth_required"
    ]),
    expiresAt: isoDateTimeSchema.optional(),
    lastEventAt: isoDateTimeSchema.optional(),
    lastHeartbeatAt: isoDateTimeSchema.optional()
  })
  .strict();
