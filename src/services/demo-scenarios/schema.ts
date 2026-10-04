import { z } from "zod";

/**
 * A demo scenario is a behavioural recipe: when fills happen, which side, what size and
 * how the price moves. It never carries a score, tier, signal result or pause outcome;
 * those come only from the engine. `demonstrates` is a claim that tests verify.
 */
export const demoScenarioSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    symbol: z.string().regex(/^[A-Z0-9._-]{1,32}$/),
    /** Session start in IST minutes after midnight. */
    startMinuteIst: z.number().int().min(0).max(1439),
    basePriceRupees: z.object({ min: z.number().positive(), max: z.number().positive() }).strict(),
    /**
     * The user's Pact for this scenario (an input). Omitted: the sample Pact. Object: the
     * sample Pact with these rule inputs. null: the user has not committed a Pact.
     */
    pact: z
      .object({
        dailyLossLimitPaise: z.number().int().nonnegative().optional(),
        maximumTradesPerDay: z.number().int().min(1).max(100).optional(),
        cooldownAfterLossMinutes: z.number().int().min(1).max(1440).optional()
      })
      .strict()
      .nullable()
      .optional(),
    demonstrates: z
      .object({
        signals: z.array(z.enum(["revenge", "overtrade", "late_night", "loss_hold", "pact_breach"])),
        explanationCodes: z.array(z.string().min(1)).optional()
      })
      .strict(),
    steps: z
      .array(
        z
          .object({
            minute: z.number().int().min(0),
            side: z.enum(["buy", "sell"]),
            quantity: z.number().int().positive(),
            /** Price move from the session's base price, e.g. -0.019 for 1.9% lower. */
            move: z.number().min(-0.5).max(0.5)
          })
          .strict()
      )
      .min(1)
      .max(20)
  })
  .strict()
  .refine((scenario) => scenario.basePriceRupees.min <= scenario.basePriceRupees.max, "base price range")
  .refine(
    (scenario) => scenario.steps.every((step, index) => index === 0 || step.minute > scenario.steps[index - 1]!.minute),
    "step minutes must strictly increase"
  )
  .refine(
    (scenario) => scenario.startMinuteIst + scenario.steps[scenario.steps.length - 1]!.minute < 1440,
    "session must end the same IST day"
  );

export type DemoScenario = z.infer<typeof demoScenarioSchema>;
