import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Runner } from "../../apps/broker-worker/src/runner";
import type { WorkerConfig } from "../../apps/broker-worker/src/config";
import { verifyBodySignature } from "@/lib/crypto/signing";
import { disconnectConnection } from "@/lib/broker/connection-store";
import { ingestBrokerEvent } from "@/lib/pipeline/ingest";
import { brokerEventSchema } from "@/lib/validation/schemas";

import { createDatabase, createUser, supabaseOver } from "./harness";

const SIGNING_KEY = "w".repeat(40);

let db: PGlite;
let admin: SupabaseClient;
let userId: string;
let runner: Runner | undefined;
const deliveries: Array<{ status: string; kind: string }> = [];

const config: WorkerConfig = {
  port: 0,
  supabaseUrl: "http://unused",
  serviceRoleKey: "unused",
  appUrl: "http://app.test",
  signingKey: SIGNING_KEY,
  tokenEncryptionKey: "",
  zerodhaApiKey: undefined,
  mode: "replay",
  workerId: "test-worker",
  leaseSeconds: 60,
  tickMs: 60_000,
  replayStepMs: 25
};

beforeAll(async () => {
  db = await createDatabase();
  admin = supabaseOver(db, { role: "service_role" });
  userId = await createUser(db, "pipeline@example.com");

  const userClient = supabaseOver(db, { role: "authenticated", userId });
  const consent = await userClient
    .from("consents")
    .insert({ user_id: userId, purpose: "broker_monitoring", policy_version: "v" })
    .select("id")
    .single();
  await admin.from("broker_connections").insert({
    user_id: userId,
    consent_id: (consent.data as { id: string }).id,
    provider: "zerodha",
    provider_user_ref: "replay-simulated",
    status: "connecting"
  });

  // Stand in for the Next.js route: verify the signature, validate, then run the real pipeline.
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    expect(url).toBe("http://app.test/api/internal/broker-events");
    const headers = init.headers as Record<string, string>;
    const rawBody = String(init.body);
    const authentic = verifyBodySignature({
      key: SIGNING_KEY,
      rawBody,
      timestampMs: headers["x-thehrav-timestamp"] ?? null,
      signature: headers["x-thehrav-signature"] ?? null,
      nowMs: Date.now()
    });
    if (!authentic) return new Response("{}", { status: 401 });
    const parsed = brokerEventSchema.safeParse(JSON.parse(rawBody).event);
    if (!parsed.success) return new Response("{}", { status: 400 });
    const result = await ingestBrokerEvent(admin, parsed.data, Date.now(), () => crypto.randomUUID());
    deliveries.push({ status: result.kind, kind: result.kind });
    return result.kind === "not_monitored" ? new Response("{}", { status: 409 }) : new Response("{}", { status: 200 });
  });
}, 60_000);

afterEach(() => runner?.stop());

afterAll(async () => {
  vi.unstubAllGlobals();
  await db.close();
});

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timed out");
}

const count = async (table: string) =>
  Number((await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where user_id = $1`, [userId])).rows[0]!.n);

describe("worker to database, end to end (replay mode)", () => {
  it("leases the connection, replays the scenario and produces one explainable pause and notification", async () => {
    runner = new Runner(config, admin);
    await runner.tick();
    expect(runner.stats.activeSessions).toBe(1);

    await waitFor(async () => (await count("trade_events")) === 3);

    // Everything is labelled simulated, never live.
    const sources = (await db.query<{ source: string }>("select distinct source from public.trade_events where user_id = $1", [userId])).rows;
    expect(sources).toEqual([{ source: "synthetic" }]);

    // The re-entry after a loss raised a pause with explanation and exactly one logical notification.
    const pauses = (await db.query<{ id: string; tier: string }>("select id, tier from public.pause_events where user_id = $1", [userId])).rows;
    expect(pauses.length).toBeGreaterThanOrEqual(1);
    expect(pauses.some((pause) => pause.tier === "L3")).toBe(true);
    const outbox = (await db.query<{ aggregate_id: string }>("select aggregate_id from public.outbox_events where user_id = $1", [userId])).rows;
    expect(outbox.map((row) => row.aggregate_id).sort()).toEqual(pauses.map((pause) => pause.id).sort());

    const assessment = (await db.query<{ signal_hits: Array<{ signal: string }> }>(
      "select signal_hits from public.risk_assessments where user_id = $1 order by evaluated_at desc limit 1",
      [userId]
    )).rows[0]!;
    expect(assessment.signal_hits.map((hit) => hit.signal)).toContain("revenge");
  });

  it("reports health from the worker only while it is genuinely live", async () => {
    await runner?.tick();
    const row = (await db.query<{ status: string; last_heartbeat_at: string | null; lease_owner: string }>(
      "select status, last_heartbeat_at, lease_owner from public.broker_connections where user_id = $1",
      [userId]
    )).rows[0]!;
    expect(row.status).toBe("live");
    expect(row.last_heartbeat_at).not.toBeNull();
    expect(row.lease_owner).toBe("test-worker");
  });

  it("is not duplicated when the worker restarts and replays the same script", async () => {
    runner?.stop();
    runner = new Runner(config, admin);
    await runner.tick();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(await count("trade_events")).toBe(3);
    expect(deliveries.filter((delivery) => delivery.kind === "duplicate").length).toBeGreaterThanOrEqual(3);
  });

  it("stops ingestion and drops the session when the user disconnects", async () => {
    runner?.stop();
    await disconnectConnection(admin, userId, {}, new Date().toISOString());
    runner = new Runner(config, admin);
    await runner.tick();
    expect(runner.stats.activeSessions).toBe(0);
    const before = await count("trade_events");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await count("trade_events")).toBe(before);
  });
});
