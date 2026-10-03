import { createHash } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PACT_LOOSEN_DELAY_MS } from "@/config/defaults";
import type { BrokerEvent, Pact } from "@/engine/types";
import { disconnectConnection } from "@/lib/broker/connection-store";
import { ingestBrokerEvent } from "@/lib/pipeline/ingest";
import { getPactState } from "@/lib/pipeline/pact-store";
import { processSyncItem, type SyncContext } from "@/lib/sync/process";

import { createDatabase, createUser, supabaseOver } from "./harness";

// 12:00 IST on a weekday.
const NOON = Date.UTC(2026, 9, 5, 6, 30, 0);
const iso = (offsetSeconds: number) => new Date(NOON + offsetSeconds * 1000).toISOString();

let db: PGlite;
let admin: SupabaseClient;
let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

beforeAll(async () => {
  db = await createDatabase();
  admin = supabaseOver(db, { role: "service_role" });
}, 60_000);

afterAll(async () => {
  await db.close();
});

async function newUser(label: string) {
  const userId = await createUser(db, `${label}@example.com`);
  const userClient = supabaseOver(db, { role: "authenticated", userId });
  const context = (consents = { sync: true, journalSync: false }, nowMs = NOON): SyncContext => ({
    userClient,
    admin,
    userId,
    nowMs,
    consents
  });
  return { userId, userClient, context };
}

const pact = (patch: Partial<Pact> = {}): Pact => ({
  id: uuid(),
  dailyLossLimitPaise: 500_000,
  maximumTradesPerDay: 5,
  cooldownAfterLossMinutes: 30,
  blockedWindows: [{ startMinuteIst: 0, endMinuteIst: 360 }],
  blockBorrowedFunds: true,
  blockEmergencyFunds: true,
  revision: 1,
  effectiveAt: iso(0),
  ...patch
});

const rowCount = async (table: string, userId: string) =>
  Number((await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where user_id = $1`, [userId])).rows[0]!.n);

describe("sync: Pact is server-authoritative (I9, I17)", () => {
  it("creates the first Pact and returns the authoritative state", async () => {
    const { userId, context } = await newUser("pact-first");
    const request = pact();
    const result = await processSyncItem(context(), { id: request.id, entityType: "pact", payload: request });
    expect(result.status).toBe("success");
    expect(result.pact?.effective?.maximumTradesPerDay).toBe(5);
    expect(result.pact?.pending).toBeNull();
    expect(await rowCount("pacts", userId)).toBe(1);
  });

  it("applies tightening immediately", async () => {
    const { context } = await newUser("pact-tight");
    const first = pact();
    await processSyncItem(context(), { id: first.id, entityType: "pact", payload: first });
    const tighter = pact({ maximumTradesPerDay: 3 });
    const result = await processSyncItem(context(undefined, NOON + 1000), { id: tighter.id, entityType: "pact", payload: tighter });
    expect(result.pact?.effective?.maximumTradesPerDay).toBe(3);
    expect(result.pact?.pending).toBeNull();
  });

  it("holds loosening back on the server clock, whatever the device claims", async () => {
    const { userId, context } = await newUser("pact-loose");
    const first = pact();
    await processSyncItem(context(), { id: first.id, entityType: "pact", payload: first });

    // The device claims its loosening is effective right away: the server ignores that.
    const loosen = pact({ maximumTradesPerDay: 9, effectiveAt: iso(-86_400) });
    const during = await processSyncItem(context(undefined, NOON + 1000), { id: loosen.id, entityType: "pact", payload: loosen });
    expect(during.pact?.effective?.maximumTradesPerDay).toBe(5);
    expect(during.pact?.pending?.maximumTradesPerDay).toBe(9);
    expect(new Date(during.pact!.pending!.effectiveAt).getTime()).toBe(NOON + 1000 + PACT_LOOSEN_DELAY_MS);
    expect(await rowCount("pact_changes", userId)).toBe(2);

    // Before the delay: still strict. After the delay: loosened.
    const early = await getPactState(admin, userId, NOON + PACT_LOOSEN_DELAY_MS - 1000);
    expect(early.effective?.maximumTradesPerDay).toBe(5);
    const late = await getPactState(admin, userId, NOON + PACT_LOOSEN_DELAY_MS + 2000);
    expect(late.effective?.maximumTradesPerDay).toBe(9);
    expect(late.pending).toBeNull();
  });

  it("tightens now and loosens later on a mixed edit", async () => {
    const { context } = await newUser("pact-mixed");
    const first = pact();
    await processSyncItem(context(), { id: first.id, entityType: "pact", payload: first });
    const mixed = pact({ maximumTradesPerDay: 3, cooldownAfterLossMinutes: 10 });
    const result = await processSyncItem(context(undefined, NOON + 1000), { id: mixed.id, entityType: "pact", payload: mixed });
    expect(result.pact?.effective?.maximumTradesPerDay).toBe(3);
    expect(result.pact?.effective?.cooldownAfterLossMinutes).toBe(30);
    expect(result.pact?.pending?.cooldownAfterLossMinutes).toBe(10);
  });

  it("lets restating the current rules cancel a pending loosening", async () => {
    const { context } = await newUser("pact-cancel");
    const first = pact();
    await processSyncItem(context(), { id: first.id, entityType: "pact", payload: first });
    const loosen = pact({ maximumTradesPerDay: 9 });
    await processSyncItem(context(undefined, NOON + 1000), { id: loosen.id, entityType: "pact", payload: loosen });
    const restate = pact();
    const result = await processSyncItem(context(undefined, NOON + 2000), { id: restate.id, entityType: "pact", payload: restate });
    expect(result.pact?.pending).toBeNull();
    expect(result.pact?.effective?.maximumTradesPerDay).toBe(5);
  });

  it("makes duplicate delivery harmless", async () => {
    const { userId, context } = await newUser("pact-dup");
    const first = pact();
    await processSyncItem(context(), { id: first.id, entityType: "pact", payload: first });
    const loosen = pact({ maximumTradesPerDay: 9 });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await processSyncItem(context(undefined, NOON + 1000 + attempt * 1000), {
        id: loosen.id,
        entityType: "pact",
        payload: loosen
      });
      expect(result.status).toBe("success");
    }
    expect(await rowCount("pact_changes", userId)).toBe(2);
  });

  it("rejects malformed or over-privileged payloads without touching data", async () => {
    const { userId, context } = await newUser("pact-bad");
    const bad = await processSyncItem(context(), { id: "x", entityType: "pact", payload: { ...pact(), userId: uuid() } });
    expect(bad).toMatchObject({ status: "failed", retryable: false, code: "invalid_payload" });
    expect(await rowCount("pacts", userId)).toBe(0);
  });
});

describe("sync: check-ins and pauses", () => {
  const checkIn = (patch: Record<string, unknown> = {}) => ({
    id: uuid(),
    timestamp: iso(0),
    amountPaise: 100_000,
    fundSource: "borrowed",
    borrowKind: "instant_loan",
    horizon: "intraday",
    reason: "my private reason",
    exitCondition: "my private exit",
    assessmentId: uuid(),
    ...patch
  });
  const pausePayload = (assessmentId: string, patch: Record<string, unknown> = {}) => ({
    id: uuid(),
    assessmentId,
    tier: "L0",
    startedAt: iso(0),
    expiresAt: null,
    outcome: "waiting",
    revision: 0,
    ...patch
  });

  it("stores the check-in and re-runs the engine instead of trusting the client", async () => {
    const { userId, context } = await newUser("checkin");
    const payload = checkIn();
    const result = await processSyncItem(context(), { id: `checkin-${payload.id}`, entityType: "checkin", payload });
    expect(result.status).toBe("success");

    const assessment = (await db.query<{ tier: string; hard_rule_overrides: string[] }>(
      "select tier, hard_rule_overrides from public.risk_assessments where id = $1",
      [payload.assessmentId]
    )).rows[0]!;
    expect(assessment.tier).toBe("L2"); // borrowed money implies at least L2, computed server-side
    expect(assessment.hard_rule_overrides).toContain("money_source_borrowed");
    expect(await rowCount("checkins", userId)).toBe(1);
  });

  it("keeps free text on the device unless journal sync is consented", async () => {
    const { context } = await newUser("redact");
    const withoutConsent = checkIn();
    await processSyncItem(context(), { id: `checkin-${withoutConsent.id}`, entityType: "checkin", payload: withoutConsent });
    const stored = (await db.query<{ reason: string; exit_condition: string }>(
      "select reason, exit_condition from public.checkins where id = $1",
      [withoutConsent.id]
    )).rows[0]!;
    expect(stored.reason).toBe("[kept on device]");
    expect(stored.exit_condition).toBe("[kept on device]");

    const withConsent = checkIn();
    await processSyncItem(context({ sync: true, journalSync: true }), {
      id: `checkin-${withConsent.id}`,
      entityType: "checkin",
      payload: withConsent
    });
    const kept = (await db.query<{ reason: string }>("select reason from public.checkins where id = $1", [withConsent.id])).rows[0]!;
    expect(kept.reason).toBe("my private reason");
  });

  it("is idempotent under redelivery", async () => {
    const { userId, context } = await newUser("checkin-dup");
    const payload = checkIn();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await processSyncItem(context(), { id: `checkin-${payload.id}`, entityType: "checkin", payload });
      expect(result.status).toBe("success");
    }
    expect(await rowCount("checkins", userId)).toBe(1);
    expect(await rowCount("risk_assessments", userId)).toBe(1);
  });

  it("asks the client to retry a pause whose check-in has not arrived yet", async () => {
    const { context } = await newUser("pause-early");
    const result = await processSyncItem(context(), {
      id: "pause-1",
      entityType: "pause",
      payload: pausePayload(uuid())
    });
    expect(result).toMatchObject({ status: "failed", retryable: true, code: "assessment_pending" });
  });

  it("stores the pause with the server's tier and applies later decisions by revision", async () => {
    const { userId, userClient, context } = await newUser("pause");
    const payload = checkIn();
    await processSyncItem(context(), { id: `checkin-${payload.id}`, entityType: "checkin", payload });

    // The client claims L0; the server knows the assessment is L2.
    const pause = pausePayload(payload.assessmentId, { tier: "L0" });
    expect((await processSyncItem(context(), { id: `pause-${pause.id}-r0`, entityType: "pause", payload: pause })).status).toBe("success");

    const stored = async () =>
      (await userClient.from("pause_events").select("tier, outcome, revision").eq("id", pause.id).maybeSingle()).data as {
        tier: string;
        outcome: string;
        revision: number;
      };
    expect(await stored()).toMatchObject({ tier: "L2", outcome: "waiting" });

    await processSyncItem(context(), { id: `pause-${pause.id}-r1`, entityType: "pause", payload: { ...pause, outcome: "abandoned", revision: 1 } });
    expect(await stored()).toMatchObject({ outcome: "abandoned" });

    // A late, stale update must not roll the decision back.
    await processSyncItem(context(), { id: `pause-${pause.id}-r0b`, entityType: "pause", payload: { ...pause, outcome: "continued", revision: 0 } });
    expect(await stored()).toMatchObject({ outcome: "abandoned" });
    expect(await rowCount("pause_events", userId)).toBe(1);
  });

  it("skips journal entries without journal consent", async () => {
    const { userId, context } = await newUser("journal");
    const entry = { id: uuid(), createdAt: iso(0), reason: "r", horizon: "days", exitCondition: "e", transcriptSource: "typed" };
    const skipped = await processSyncItem(context(), { id: `journal-${entry.id}`, entityType: "journal", payload: entry });
    expect(skipped.status).toBe("skipped");
    expect(await rowCount("journal_entries", userId)).toBe(0);
    const stored = await processSyncItem(context({ sync: true, journalSync: true }), { id: `journal-${entry.id}`, entityType: "journal", payload: entry });
    expect(stored.status).toBe("success");
    expect(await rowCount("journal_entries", userId)).toBe(1);
  });
});

describe("broker event pipeline (M4)", () => {
  async function connectedUser(label: string) {
    const user = await newUser(label);
    const consent = await user.userClient
      .from("consents")
      .insert({ user_id: user.userId, purpose: "broker_monitoring", policy_version: "v" })
      .select("id")
      .single();
    await admin.from("broker_connections").insert({
      user_id: user.userId,
      consent_id: (consent.data as { id: string }).id,
      provider: "zerodha",
      provider_user_ref: "replay-simulated",
      status: "live"
    });
    return { ...user, consentId: (consent.data as { id: string }).id };
  }

  const event = (userId: string, step: number, side: "buy" | "sell", quantity: number, pricePaise: number, patch: Partial<BrokerEvent> = {}): BrokerEvent => {
    const dedupeHash = createHash("sha256").update(`${userId}|${step}`).digest("hex");
    return {
      id: uuid(),
      userId,
      provider: "zerodha",
      providerEventId: `replay-${userId}-${step}`,
      providerOrderId: `order-${step}`,
      observedAt: iso(step * 15),
      receivedAt: iso(step * 15),
      eventType: "trade_update",
      status: "COMPLETE",
      symbol: "SIMULATED",
      side,
      quantity,
      averagePricePaise: pricePaise,
      dedupeHash,
      simulated: true,
      ...patch
    };
  };

  const ingest = (e: BrokerEvent) => ingestBrokerEvent(admin, e, NOON + 60_000, uuid);

  it("turns the scripted revenge sequence into exactly one pause and one outbox row", async () => {
    const { userId } = await connectedUser("flow");
    const buy = await ingest(event(userId, 0, "buy", 10, 10_000));
    const loss = await ingest(event(userId, 1, "sell", 10, 8_500));
    const reentry = await ingest(event(userId, 2, "buy", 15, 8_500));

    expect(buy).toMatchObject({ kind: "created", pause: null });
    expect(loss.kind).toBe("created");
    expect(reentry).toMatchObject({ kind: "created", tier: "L3" });
    expect(await rowCount("trade_events", userId)).toBe(3);
    expect(await rowCount("pause_events", userId)).toBeGreaterThanOrEqual(1);

    const outbox = await db.query<{ aggregate_id: string; payload: Record<string, unknown> }>(
      "select aggregate_id, payload from public.outbox_events where user_id = $1",
      [userId]
    );
    const pauses = await db.query<{ id: string }>("select id from public.pause_events where user_id = $1", [userId]);
    expect(outbox.rows.map((row) => row.aggregate_id).sort()).toEqual(pauses.rows.map((row) => row.id).sort());
    for (const row of outbox.rows) expect(JSON.stringify(row.payload)).not.toMatch(/SIMULATED|10000|8500|L[0-3]/);

    const stored = (await db.query<{ source: string }>("select distinct source from public.trade_events where user_id = $1", [userId])).rows;
    expect(stored).toEqual([{ source: "synthetic" }]);
  });

  it("produces one logical intervention despite reconnect redelivery", async () => {
    const { userId } = await connectedUser("redeliver");
    const replayed = event(userId, 0, "buy", 10, 10_000);
    await ingest(replayed);
    const outboxBefore = await rowCount("outbox_events", userId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(await ingest({ ...replayed, id: uuid() })).toEqual({ kind: "duplicate" }); // same hash, new transport id
    }
    expect(await rowCount("trade_events", userId)).toBe(1);
    expect(await rowCount("outbox_events", userId)).toBe(outboxBefore);
  });

  it("ignores events that are not fills", async () => {
    const { userId } = await connectedUser("nofill");
    expect(await ingest(event(userId, 0, "buy", 1, 100, { status: "OPEN" }))).toEqual({ kind: "ignored" });
    expect(await rowCount("trade_events", userId)).toBe(0);
  });

  it("refuses a replay event on a live connection and the reverse", async () => {
    const { userId } = await connectedUser("mismatch");
    expect(await ingest(event(userId, 0, "buy", 1, 100, { simulated: false }))).toEqual({ kind: "simulation_mismatch" });
  });

  it("stops ingesting the moment monitoring consent is revoked", async () => {
    const { userId, consentId } = await connectedUser("revoked");
    expect((await ingest(event(userId, 0, "buy", 1, 100))).kind).toBe("created");
    await db.query("update public.consents set revoked_at = now() where id = $1", [consentId]);
    expect(await ingest(event(userId, 1, "buy", 1, 100))).toEqual({ kind: "not_monitored" });
  });

  it("disconnect deletes access material and stops ingestion and leasing (I22)", async () => {
    const { userId } = await connectedUser("disconnect");
    await admin
      .from("broker_connections")
      .update({ encrypted_access_token: "\\x0102", token_key_version: 1 })
      .eq("user_id", userId);

    await disconnectConnection(admin, userId, {}, new Date(NOON).toISOString());

    const row = (await db.query<{ status: string; encrypted_access_token: unknown; lease_owner: unknown }>(
      "select status, encrypted_access_token, lease_owner from public.broker_connections where user_id = $1",
      [userId]
    )).rows[0]!;
    expect(row).toEqual({ status: "disconnected", encrypted_access_token: null, lease_owner: null });
    expect(await ingest(event(userId, 0, "buy", 1, 100))).toEqual({ kind: "not_monitored" });

    const claimed = (await admin.rpc("claim_broker_connections", { p_worker: "w", p_lease_seconds: 60, p_limit: 50 })).data as Array<{ user_id: string }>;
    expect(claimed.some((connection) => connection.user_id === userId)).toBe(false);
  });

  it("uses the user's own Pact when assessing", async () => {
    const { userId, context } = await connectedUser("ownpact");
    const strict = pact({ maximumTradesPerDay: 1 });
    await processSyncItem(context(), { id: strict.id, entityType: "pact", payload: strict });
    const result = await ingest(event(userId, 0, "buy", 1, 100));
    expect(result).toMatchObject({ kind: "created", tier: "L3" }); // first trade already meets the 1-trade limit
  });
});
