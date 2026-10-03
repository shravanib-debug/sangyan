import "server-only";

import { z } from "zod";

const serverEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  ZERODHA_API_KEY: z.string().min(1).optional(),
  ZERODHA_API_SECRET: z.string().min(1).optional(),
  BROKER_TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),
  BROKER_INTERNAL_SIGNING_KEY: z.string().min(32).optional(),
  BROKER_WORKER_MODE: z.enum(["replay", "sandbox", "live"]).default("replay")
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function readServerEnvironment(environment: NodeJS.ProcessEnv = process.env): ServerEnvironment {
  return serverEnvironmentSchema.parse(environment);
}
