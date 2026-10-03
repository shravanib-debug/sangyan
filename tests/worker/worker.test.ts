import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReplayAdapter } from "../../apps/broker-worker/src/adapters/replay";
import { ZerodhaAdapter } from "../../apps/broker-worker/src/adapters/zerodha";
import { postEvent, signBody } from "../../apps/broker-worker/src/ingest-client";
import { normalizeKiteOrder, sanitizeSymbol, uuidFromHash } from "../../apps/broker-worker/src/normalize";
import type { BrokerEvent } from "../../apps/broker-worker/src/types";
import { brokerEventSchema } from "@/lib/validation/schemas";
import { verifyBodySignature } from "@/lib/crypto/signing";

const USER = "00000000-0000-4000-8000-0000000000aa";
const context = { userId: USER, nowIso: "2026-10-05T06:30:05.000Z", eventType: "order_update" as const };

const kiteOrder = {
  order_id: "2610050001",
  status: "COMPLETE",
  tradingsymbol: "M&M",
  transaction_type: "BUY",
  filled_quantity: 10,
  average_price: 1234.55,
  exchange_update_timestamp: "2026-10-05 11:58:01"
};

describe("Kite order normalisation", () => {
  it("produces a schema-valid canonical event", () => {
    const event = normalizeKiteOrder(kiteOrder, context);
    expect(event).not.toBeNull();
    expect(brokerEventSchema.safeParse(event).success).toBe(true);
    expect(event?.symbol).toBe("M_M");
    expect(event?.side).toBe("buy");
    expect(event?.averagePricePaise).toBe(123_455);
    // IST wall clock converted to UTC
    expect(event?.observedAt).toBe("2026-10-05T06:28:01.000Z");
  });

  it("dedupes a WebSocket update and a later REST reconciliation to the same event", () => {
    const live = normalizeKiteOrder(kiteOrder, context);
    const reconciled = normalizeKiteOrder(kiteOrder, { ...context, eventType: "reconciliation" });
    expect(reconciled?.dedupeHash).toBe(live?.dedupeHash);
    expect(reconciled?.id).toBe(live?.id);
  });

  it("changes identity when the fill changes", () => {
    const first = normalizeKiteOrder(kiteOrder, context);
    const second = normalizeKiteOrder({ ...kiteOrder, filled_quantity: 11 }, context);
    expect(second?.dedupeHash).not.toBe(first?.dedupeHash);
  });

  it("ignores everything except completed, well-formed fills", () => {
    expect(normalizeKiteOrder({ ...kiteOrder, status: "OPEN" }, context)).toBeNull();
    expect(normalizeKiteOrder({ ...kiteOrder, status: "REJECTED" }, context)).toBeNull();
    expect(normalizeKiteOrder({ ...kiteOrder, filled_quantity: 0 }, context)).toBeNull();
    expect(normalizeKiteOrder({ ...kiteOrder, transaction_type: "HOLD" }, context)).toBeNull();
    expect(normalizeKiteOrder({ ...kiteOrder, order_id: undefined }, context)).toBeNull();
  });

  it("keeps no personal or account fields", () => {
    const event = normalizeKiteOrder({ ...kiteOrder, ...{ placed_by: "AB1234", email: "x@y.z" } }, context);
    expect(Object.keys(event ?? {})).not.toContain("placed_by");
    expect(JSON.stringify(event)).not.toContain("AB1234");
  });

  it("sanitises symbols to the allowed alphabet", () => {
    expect(sanitizeSymbol("nifty 24oct")).toBe("NIFTY_24OCT");
    expect(sanitizeSymbol("A".repeat(40))?.length).toBe(32);
    expect(uuidFromHash("a".repeat(64))).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("replay adapter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("emits a deterministic, clearly simulated scenario and then goes quiet", async () => {
    const events: BrokerEvent[] = [];
    const adapter = new ReplayAdapter({ connectionId: "c1", userId: USER, stepIntervalMs: 1000, now: () => Date.now() });
    adapter.start({ onEvent: async (event) => void events.push(event), onState: () => undefined });
    await vi.advanceTimersByTimeAsync(10_000);
    adapter.stop();

    expect(events).toHaveLength(3);
    expect(events.every((event) => event.simulated === true)).toBe(true);
    expect(events.map((event) => event.side)).toEqual(["buy", "sell", "buy"]);
    for (const event of events) expect(brokerEventSchema.safeParse(event).success).toBe(true);
  });

  it("gives identical identities after a restart so nothing duplicates", async () => {
    const run = async () => {
      const events: BrokerEvent[] = [];
      const adapter = new ReplayAdapter({ connectionId: "c1", userId: USER, stepIntervalMs: 1000, now: () => Date.now() });
      adapter.start({ onEvent: async (event) => void events.push(event), onState: () => undefined });
      await vi.advanceTimersByTimeAsync(4000);
      adapter.stop();
      return events.map((event) => event.dedupeHash);
    };
    expect(await run()).toEqual(await run());
  });

  it("stops emitting once stopped (disconnect)", async () => {
    const events: BrokerEvent[] = [];
    const adapter = new ReplayAdapter({ connectionId: "c1", userId: USER, stepIntervalMs: 1000, now: () => Date.now() });
    adapter.start({ onEvent: async (event) => void events.push(event), onState: () => undefined });
    await vi.advanceTimersByTimeAsync(1500);
    adapter.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(events).toHaveLength(1);
  });
});

describe("Zerodha adapter (read-only)", () => {
  it("reconciles through GET /orders only and returns only completed fills", async () => {
    const calls: Array<{ url: string; method?: string; authorization?: string }> = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method, authorization: (init.headers as Record<string, string>).Authorization });
      return new Response(
        JSON.stringify({ data: [kiteOrder, { ...kiteOrder, order_id: "x", status: "CANCELLED" }] }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const adapter = new ZerodhaAdapter({ apiKey: "k", accessToken: "t", userId: USER, fetchImpl: fakeFetch, now: () => 0 });
    const events = await adapter.reconcile();

    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("reconciliation");
    expect(calls).toEqual([{ url: "https://api.kite.trade/orders", method: "GET", authorization: "token k:t" }]);
  });

  it("surfaces a failed reconciliation instead of pretending nothing happened", async () => {
    const down = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const adapter = new ZerodhaAdapter({ apiKey: "k", accessToken: "t", userId: USER, fetchImpl: down });
    await expect(adapter.reconcile()).rejects.toThrow();
  });
});

describe("worker to app delivery", () => {
  const event = normalizeKiteOrder(kiteOrder, context)!;
  const sleep = async () => undefined;

  it("signs the exact body so the app can verify it", async () => {
    let headers: Record<string, string> = {};
    let body = "";
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      headers = init.headers as Record<string, string>;
      body = String(init.body);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const signingKey = "k".repeat(40);
    expect(await postEvent({ appUrl: "http://app", signingKey, event }, fakeFetch, sleep)).toBe("ok");
    expect(
      verifyBodySignature({
        key: signingKey,
        rawBody: body,
        timestampMs: headers["x-thehrav-timestamp"] ?? null,
        signature: headers["x-thehrav-signature"] ?? null,
        nowMs: Date.now()
      })
    ).toBe(true);
    expect(signBody(signingKey, 1, "x")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("retries transient failures with the same payload", async () => {
    let attempts = 0;
    const flaky = (async () => {
      attempts += 1;
      return attempts < 3 ? new Response("{}", { status: 503 }) : new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    expect(await postEvent({ appUrl: "http://app", signingKey: "k".repeat(40), event }, flaky, sleep)).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("stops the session on 409 and does not retry client errors", async () => {
    let attempts = 0;
    const respond = (status: number) =>
      (async () => {
        attempts += 1;
        return new Response("{}", { status });
      }) as unknown as typeof fetch;
    expect(await postEvent({ appUrl: "http://app", signingKey: "k".repeat(40), event }, respond(409), sleep)).toBe("not_monitored");
    expect(await postEvent({ appUrl: "http://app", signingKey: "k".repeat(40), event }, respond(422), sleep)).toBe("rejected");
    expect(attempts).toBe(2);
  });

  it("gives up after bounded retries when the app is down", async () => {
    let attempts = 0;
    const down = (async () => {
      attempts += 1;
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await postEvent({ appUrl: "http://app", signingKey: "k".repeat(40), event }, down, sleep)).toBe("unavailable");
    expect(attempts).toBe(4);
  });
});

describe("read-only boundary (I20)", () => {
  const FORBIDDEN_NAME = /(place|modify|cancel|gtt|basket|transfer|withdraw|payout|fund)/i;

  it("exposes no trading method on any adapter", () => {
    for (const adapter of [ReplayAdapter, ZerodhaAdapter]) {
      const names = Object.getOwnPropertyNames(adapter.prototype).filter((name) => name !== "constructor");
      expect(names.filter((name) => FORBIDDEN_NAME.test(name))).toEqual([]);
    }
  });

  it("only ever issues GET requests to Kite from the worker", () => {
    const root = "apps/broker-worker/src";
    const files = readdirSync(root, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".ts"))
      .map((file) => readFileSync(join(root, file), "utf8"));
    for (const source of files) {
      expect(source).not.toMatch(/method:\s*["'](PUT|PATCH|DELETE)["']/);
      expect(source).not.toMatch(/\/orders\/regular|\/orders\/amo|\/gtt|\/portfolio\/|\/margins/);
    }
    // The single non-GET the worker makes is the signed delivery to Thehrav itself.
    const posts = files.filter((source) => /method:\s*["']POST["']/.test(source));
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain("/api/internal/broker-events");
  });

  it("limits the app's Kite calls to session management", () => {
    const source = readFileSync("src/lib/broker/zerodha.ts", "utf8");
    expect(source).not.toMatch(/\/orders|\/gtt|\/portfolio|\/margins|\/transfer/);
  });
});
