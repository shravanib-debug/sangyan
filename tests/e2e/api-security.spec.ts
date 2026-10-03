import { createHmac } from "node:crypto";

import { expect, test } from "@playwright/test";

// Runs against the production server with no reachable backend: every boundary here must
// reject or degrade before it needs the database.
const SIGNING_KEY = process.env.BROKER_INTERNAL_SIGNING_KEY ?? "e2e-signing-key-e2e-signing-key-0123456789";
const BASE = "http://127.0.0.1:3100";
const sameOrigin = { Origin: BASE };

function sign(body: string, timestamp = Date.now()) {
  return {
    "x-thehrav-timestamp": String(timestamp),
    "x-thehrav-signature": createHmac("sha256", SIGNING_KEY).update(`${timestamp}.${body}`).digest("hex")
  };
}

test.describe("cookie-authenticated mutations", () => {
  for (const path of ["/api/sync", "/api/consents", "/api/brokers/zerodha/disconnect", "/api/push/subscriptions"]) {
    test(`POST ${path} rejects a cross-origin request`, async ({ request }) => {
      const response = await request.post(path, { data: {}, headers: { Origin: "https://evil.example" } });
      expect(response.status()).toBe(403);
    });
    test(`POST ${path} rejects a request with no Origin`, async ({ request }) => {
      expect((await request.post(path, { data: {} })).status()).toBe(403);
    });
  }

  test("sync requires a signed-in user", async ({ request }) => {
    const response = await request.post("/api/sync", { data: { items: [] }, headers: sameOrigin });
    expect(response.status()).toBe(401);
  });

  test("sync rejects a malformed request before any work", async ({ request }) => {
    const response = await request.post("/api/sync", { data: { items: "nope" }, headers: sameOrigin });
    expect(response.status()).toBe(400);
  });

  test("consent changes require a signed-in user", async ({ request }) => {
    const response = await request.post("/api/consents", { data: { purpose: "sync", granted: true }, headers: sameOrigin });
    expect(response.status()).toBe(401);
  });

  test("disconnect and push registration require a signed-in user", async ({ request }) => {
    expect((await request.post("/api/brokers/zerodha/disconnect", { headers: sameOrigin })).status()).toBe(401);
    expect(
      (
        await request.post("/api/push/subscriptions", {
          data: { endpoint: "https://push.example/abc", keys: { p256dh: "a", auth: "b" } },
          headers: sameOrigin
        })
      ).status()
    ).toBe(401);
  });
});

test.describe("protected reads", () => {
  test("broker status, inbox and pause details need a session", async ({ request }) => {
    expect((await request.get("/api/brokers/zerodha/status")).status()).toBe(401);
    expect((await request.get("/api/pauses")).status()).toBe(401);
    expect((await request.get("/api/pauses/00000000-0000-4000-8000-000000000001")).status()).toBe(401);
  });

  test("pause ids must be UUIDs", async ({ request }) => {
    expect((await request.get("/api/pauses/not-a-uuid")).status()).toBe(400);
  });

  test("connecting a broker sends signed-out users to sign in, never to the broker", async ({ request }) => {
    const response = await request.get("/api/brokers/zerodha/connect", { maxRedirects: 0 });
    expect([302, 307]).toContain(response.status());
    expect(response.headers().location).toContain("/login");
  });

  test("a denied broker login returns to Settings with a reason", async ({ request }) => {
    const response = await request.get("/api/brokers/zerodha/callback?status=failure", { maxRedirects: 0 });
    expect(response.headers().location).toContain("/settings?broker=denied");
  });

  test("account state degrades to guest mode when the backend is unreachable", async ({ request }) => {
    const response = await request.get("/api/account/state");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.user).toBeNull();
    expect(body.broker.status).toBe("disconnected");
    expect(JSON.stringify(body)).not.toMatch(/access_?token|secret|service_?role|signing|encrypt/i);
  });
});

test.describe("worker to app boundary", () => {
  const event = JSON.stringify({ event: { id: "not-valid" } });

  test("rejects an unsigned event", async ({ request }) => {
    const response = await request.post("/api/internal/broker-events", { data: event, headers: { "Content-Type": "application/json" } });
    expect(response.status()).toBe(401);
  });

  test("rejects a bad signature, a tampered body and a stale timestamp", async ({ request }) => {
    const headers = { "Content-Type": "application/json" };
    expect(
      (await request.post("/api/internal/broker-events", { data: event, headers: { ...headers, ...sign("other body") } })).status()
    ).toBe(401);
    expect(
      (await request.post("/api/internal/broker-events", { data: event, headers: { ...headers, ...sign(event, Date.now() - 10 * 60_000) } })).status()
    ).toBe(401);
  });

  test("rejects a correctly signed but non-canonical event", async ({ request }) => {
    const response = await request.post("/api/internal/broker-events", {
      data: event,
      headers: { "Content-Type": "application/json", ...sign(event) }
    });
    expect(response.status()).toBe(400);
  });

  test("rejects events carrying privileged extra fields", async ({ request }) => {
    const body = JSON.stringify({
      event: {
        id: "00000000-0000-4000-8000-000000000001",
        userId: "00000000-0000-4000-8000-000000000002",
        provider: "zerodha",
        providerEventId: "p",
        observedAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        eventType: "trade_update",
        status: "COMPLETE",
        dedupeHash: "a".repeat(64),
        accessToken: "must-not-be-accepted"
      }
    });
    const response = await request.post("/api/internal/broker-events", {
      data: body,
      headers: { "Content-Type": "application/json", ...sign(body) }
    });
    expect(response.status()).toBe(400);
  });
});

test.describe("no order surface (I20)", () => {
  for (const path of ["/api/orders", "/api/brokers/zerodha/orders", "/api/brokers/zerodha/place", "/api/brokers/zerodha/cancel"]) {
    test(`${path} does not exist`, async ({ request }) => {
      expect((await request.post(path, { data: {}, headers: sameOrigin })).status()).toBe(404);
      expect((await request.get(path)).status()).toBe(404);
    });
  }
});
