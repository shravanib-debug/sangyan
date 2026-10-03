import "server-only";

import { z } from "zod";

const optionalSecret = z.string().min(1).optional();

const serverEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  APP_ORIGIN: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
  VAPID_PUBLIC_KEY: optionalSecret,
  VAPID_PRIVATE_KEY: optionalSecret,
  ZERODHA_API_KEY: optionalSecret,
  ZERODHA_API_SECRET: optionalSecret,
  BROKER_TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),
  PUSH_SUBSCRIPTION_ENCRYPTION_KEY: z.string().min(32).optional(),
  BROKER_INTERNAL_SIGNING_KEY: z.string().min(32).optional(),
  BROKER_WORKER_MODE: z.enum(["replay", "sandbox", "live"]).default("replay")
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function readServerEnvironment(environment: NodeJS.ProcessEnv = process.env): ServerEnvironment {
  return serverEnvironmentSchema.parse(environment);
}
