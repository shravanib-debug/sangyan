import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, createUser, supabaseOver } from "./harness";

let db: PGlite;
let alice: string;
let bob: string;

const hash = (n: number) => String(n).padStart(64, "a");

beforeAll(async () => {
  db = await createDatabase();
  alice = await createUser(db, "alice@example.com");
  bob = await createUser(db, "bob@example.com");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("grants (I15: clients only get what they need)", () => {
  const forbidden = "42501"; // insufficient_privilege

  it("keeps server-only tables out of reach of signed-in clients", async () => {
    const client = supabaseOver(db, { role: "authenticated", userId: alice });
    for (const table of ["broker_connections", "broker_login_states", "outbox_events", "audit_events"]) {
      const result = await client.from(table).select("*");
      expect(result.error?.code, table).toBe(forbidden);
    }
  });

  it("makes Pact writes server-authoritative", async () => {
    const client = supabaseOver(db, { role: "authenticated", userId: alice });
    const insert = await client.from("pacts").insert({
      id: crypto.randomUUID(),
      user_id: alice,
      daily_loss_limit_paise: 1,
      maximum_trades_per_day: 1,
      cooldown_after_loss_minutes: 1,
      effective_at: new Date().toISOString()
    });
    expect(insert.error?.code).toBe(forbidden);
    expect((await client.from("pact_changes").insert({ user_id: alice })).error?.code).toBe(forbidden);
  });

  it("stops clients forging assessments", async () => {
    const client = supabaseOver(db, { role: "authenticated", userId: alice });
    const result = await client.from("risk_assessments").insert({ id: crypto.randomUUID(), user_id: alice });
    expect(result.error?.code).toBe(forbidden);
  });

  it("gives anonymous users nothing private", async () => {
    const anon = supabaseOver(db, { role: "anon" });
    expect((await anon.from("profiles").select("*")).error?.code).toBe(forbidden);
    expect((await anon.from("checkins").select("*")).error?.code).toBe(forbidden);
    expect((await anon.from("synthetic_fixtures").select("*")).error).toBeNull();
  });

  it("does not let clients call the privileged functions", async () => {
    const client = supabaseOver(db, { role: "authenticated", userId: alice });
    expect((await client.rpc("claim_broker_connections", { p_worker: "w", p_lease_seconds: 1, p_limit: 1 })).error?.code).toBe(forbidden);
    expect((await client.rpc("ingest_broker_event", { p_event: {}, p_assessment: {}, p_pause: null })).error?.code).toBe(forbidden);
  });
});

describe("row level security", () => {
  it("lets an owner write and read, and hides the row from everyone else", async () => {
    const owner = supabaseOver(db, { role: "authenticated", userId: alice });
    const other = supabaseOver(db, { role: "authenticated", userId: bob });
    const id = crypto.randomUUID();

    const created = await owner.from("checkins").insert({
      id,
      user_id: alice,
      occurred_at: new Date().toISOString(),
      amount_paise: 100,
      fund_source: "surplus",
      borrow_kind: "none",
      horizon: "intraday",
      reason: "r",
      exit_condition: "e",
      idempotency_key: "k1"
    });
    expect(created.error).toBeNull();

    expect(((await owner.from("checkins").select("id")).data as unknown[]).length).toBe(1);
    expect(((await other.from("checkins").select("id")).data as unknown[]).length).toBe(0);
  });

  it("refuses a write on behalf of another user", async () => {
    const other = supabaseOver(db, { role: "authenticated", userId: bob });
    const result = await other.from("checkins").insert({
      id: crypto.randomUUID(),
      user_id: alice,
      occurred_at: new Date().toISOString(),
      amount_paise: 100,
      fund_source: "surplus",
      borrow_kind: "none",
      horizon: "intraday",
      reason: "r",
      exit_condition: "e",
      idempotency_key: "k2"
    });
    expect(result.error).not.toBeNull();
  });
});

describe("transactional ingest and outbox (I18)", () => {
  const admin = () => supabaseOver(db, { role: "service_role" });
  const args = (n: number, user: string, withPause: boolean) => ({
    p_event: {
      id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      user_id: user,
      provider: "zerodha",
      provider_event_id: `p-${n}`,
      event_type: "trade_update",
      observed_at: "2026-10-05T06:30:00.000Z",
      received_at: "2026-10-05T06:30:01.000Z",
      status: "COMPLETE",
      symbol: "SIMULATED",
      side: "buy",
      quantity: 10,
      average_price_paise: 10000,
      source: "synthetic",
      dedupe_hash: hash(n)
    },
    p_assessment: {
      id: `00000000-0000-4000-8000-${String(n + 100).padStart(12, "0")}`,
      score: 0.5,
      tier: "L2",
      signal_hits: [{ signal: "money_source" }],
      hard_rule_overrides: [],
      engine_version: "v",
      config_version: "v",
      evaluated_at: "2026-10-05T06:30:00.000Z"
    },
    p_pause: withPause
      ? {
          id: `00000000-0000-4000-8000-${String(n + 200).padStart(12, "0")}`,
          tier: "L2",
          started_at: "2026-10-05T06:30:00.000Z",
          expires_at: null
        }
      : null
  });

  const count = async (table: string, user: string) =>
    Number(((await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where user_id = $1`, [user])).rows[0]!.n));

  it("writes event, assessment, pause and one generic outbox row together", async () => {
    const result = await admin().rpc("ingest_broker_event", args(1, alice, true));
    expect(result.error).toBeNull();
    expect(result.data).toBe("created");
    expect(await count("trade_events", alice)).toBe(1);
    expect(await count("risk_assessments", alice)).toBe(1);
    expect(await count("pause_events", alice)).toBe(1);
    expect(await count("outbox_events", alice)).toBe(1);

    const payload = (await db.query<{ payload: Record<string, unknown> }>(
      "select payload from public.outbox_events where user_id = $1",
      [alice]
    )).rows[0]!.payload;
    expect(Object.keys(payload).sort()).toEqual(["kind", "pauseId", "simulated"]);
    expect(payload.simulated).toBe(true);
  });

  it("treats redelivery as a duplicate and writes nothing more", async () => {
    const result = await admin().rpc("ingest_broker_event", args(1, alice, true));
    expect(result.data).toBe("duplicate");
    expect(await count("trade_events", alice)).toBe(1);
    expect(await count("outbox_events", alice)).toBe(1);
  });

  it("dedupes on the provider event id as well as the hash", async () => {
    const sameProviderEvent = args(2, bob, false);
    sameProviderEvent.p_event.provider_event_id = "dup-id";
    expect((await admin().rpc("ingest_broker_event", sameProviderEvent)).data).toBe("created");
    const again = args(3, bob, false);
    again.p_event.provider_event_id = "dup-id";
    expect((await admin().rpc("ingest_broker_event", again)).data).toBe("duplicate");
  });

  it("queues nothing when no pause was raised", async () => {
    const quiet = await admin().rpc("ingest_broker_event", args(4, bob, false));
    expect(quiet.data).toBe("created");
    expect(await count("outbox_events", bob)).toBe(0);
  });

  it("rolls everything back if any part fails", async () => {
    const broken = args(5, bob, true);
    broken.p_assessment.tier = "L9";
    const result = await admin().rpc("ingest_broker_event", broken);
    expect(result.error).not.toBeNull();
    const rows = await db.query("select 1 from public.trade_events where dedupe_hash = $1", [hash(5)]);
    expect(rows.rows).toHaveLength(0);
  });
});

describe("worker leases", () => {
  async function connect(user: string, overrides: Record<string, unknown> = {}) {
    const consent = (await db.query<{ id: string }>(
      "insert into public.consents (user_id, purpose, policy_version) values ($1, 'broker_monitoring', 'v') returning id",
      [user]
    )).rows[0]!.id;
    await db.query(
      `insert into public.broker_connections (user_id, consent_id, provider, provider_user_ref, status, expires_at,
         encrypted_access_token, token_key_version)
       values ($1, $2, 'zerodha', $3, $4, $5, $6, $7)`,
      [
        user,
        consent,
        "replay-simulated",
        overrides.status ?? "live",
        overrides.expires_at ?? new Date(Date.now() + 3_600_000).toISOString(),
        overrides.token ? new Uint8Array([0]) : null,
        overrides.token ? 1 : null
      ]
    );
    return consent;
  }

  const claim = async (worker: string) =>
    (await supabaseOver(db, { role: "service_role" }).rpc("claim_broker_connections", {
      p_worker: worker,
      p_lease_seconds: 60,
      p_limit: 10
    })).data as Array<{ user_id: string }>;

  it("leases a live connection to one worker at a time", async () => {
    const user = await createUser(db, "lease@example.com");
    await connect(user);
    expect((await claim("w1")).some((row) => row.user_id === user)).toBe(true);
    expect((await claim("w2")).some((row) => row.user_id === user)).toBe(false);
    expect((await claim("w1")).some((row) => row.user_id === user)).toBe(true); // renewal
  });

  it("expires a session past its token lifetime and wipes the token", async () => {
    const user = await createUser(db, "expired@example.com");
    await connect(user, { expires_at: new Date(Date.now() - 1000).toISOString(), token: true });
    expect((await claim("w1")).some((row) => row.user_id === user)).toBe(false);
    const row = (await db.query<{ status: string; encrypted_access_token: unknown }>(
      "select status, encrypted_access_token from public.broker_connections where user_id = $1",
      [user]
    )).rows[0]!;
    expect(row.status).toBe("reauth_required");
    expect(row.encrypted_access_token).toBeNull();
  });

  it("stops leasing once monitoring consent is revoked", async () => {
    const user = await createUser(db, "revoked@example.com");
    const consent = await connect(user);
    await db.query("update public.consents set revoked_at = now() where id = $1", [consent]);
    expect((await claim("w3")).some((row) => row.user_id === user)).toBe(false);
  });

  it("never leases disconnected connections", async () => {
    const user = await createUser(db, "off@example.com");
    await connect(user, { status: "disconnected" });
    expect((await claim("w4")).some((row) => row.user_id === user)).toBe(false);
  });
});
