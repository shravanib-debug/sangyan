import { hostname } from "node:os";

export interface WorkerConfig {
  port: number;
  supabaseUrl: string;
  serviceRoleKey: string;
  appUrl: string;
  signingKey: string;
  tokenEncryptionKey: string;
  zerodhaApiKey: string | undefined;
  mode: "replay" | "sandbox" | "live";
  workerId: string;
  leaseSeconds: number;
  tickMs: number;
  replayStepMs: number;
}

export function readConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const required = (name: string): string => {
    const value = environment[name];
    if (!value) throw new Error(`missing_env:${name}`);
    return value;
  };
  const mode = environment.BROKER_WORKER_MODE ?? "replay";
  if (mode !== "replay" && mode !== "sandbox" && mode !== "live") throw new Error("invalid_env:BROKER_WORKER_MODE");

  return {
    port: Number.parseInt(environment.PORT ?? "8080", 10),
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    appUrl: required("APP_URL"),
    signingKey: required("BROKER_INTERNAL_SIGNING_KEY"),
    tokenEncryptionKey: environment.BROKER_TOKEN_ENCRYPTION_KEY ?? "",
    zerodhaApiKey: environment.ZERODHA_API_KEY,
    mode,
    workerId: `${hostname()}-${process.pid}`,
    leaseSeconds: 60,
    tickMs: 10_000,
    replayStepMs: Number.parseInt(environment.REPLAY_STEP_MS ?? "15000", 10)
  };
}
