import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { LOGIN_STATE_TTL_MS, newNonce, signLoginState, verifyLoginState } from "@/lib/broker/state";
import { HEARTBEAT_STALE_MS, deriveConnectionStatus, isReplayConnection } from "@/lib/broker/status";
import {
  buildLoginUrl,
  exchangeRequestToken,
  invalidateAccessToken,
  kiteTokenExpiry,
  sessionChecksum
} from "@/lib/broker/zerodha";

const key = "s".repeat(40);
const now = 1_800_000_000_000;

describe("login state", () => {
  const payload = { uid: "user-1", nonce: newNonce(), exp: now + LOGIN_STATE_TTL_MS };

  it("round-trips a signed state", () => {
    expect(verifyLoginState(signLoginState(payload, key), key, now)).toEqual(payload);
  });

  it("rejects expired, tampered, foreign-key and malformed state", () => {
    const token = signLoginState(payload, key);
    expect(verifyLoginState(token, key, payload.exp + 1)).toBeNull();
    expect(verifyLoginState(token, "o".repeat(40), now)).toBeNull();
    const [body, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, uid: "attacker" })).toString("base64url");
    expect(verifyLoginState(`${forged}.${signature}`, key, now)).toBeNull();
    expect(verifyLoginState(`${body}`, key, now)).toBeNull();
    expect(verifyLoginState("a.b.c", key, now)).toBeNull();
  });

  it("issues unique nonces", () => {
    expect(newNonce()).not.toBe(newNonce());
  });
});

describe("Zerodha session helpers", () => {
  it("computes the documented checksum", () => {
    // Kite: checksum = sha256(api_key + request_token + api_secret)
    expect(sessionChecksum("key", "token", "secret")).toBe(
      createHash("sha256").update("keytokensecret").digest("hex")
    );
    expect(sessionChecksum("key", "token", "secret")).not.toBe(sessionChecksum("key", "token", "other"));
  });

  it("returns the state through redirect_params", () => {
    const url = new URL(buildLoginUrl("api-key", "abc.def"));
    expect(url.origin + url.pathname).toBe("https://kite.zerodha.com/connect/login");
    expect(url.searchParams.get("api_key")).toBe("api-key");
    expect(new URLSearchParams(url.searchParams.get("redirect_params") ?? "").get("state")).toBe("abc.def");
  });

  it("expires tokens at 06:00 IST", () => {
    // 2026-10-03 10:00 IST -> expires 2026-10-04 06:00 IST (00:30 UTC)
    expect(kiteTokenExpiry(Date.UTC(2026, 9, 3, 4, 30)).toISOString()).toBe("2026-10-04T00:30:00.000Z");
    // 2026-10-03 03:00 IST -> expires the same day at 06:00 IST
    expect(kiteTokenExpiry(Date.UTC(2026, 9, 2, 21, 30)).toISOString()).toBe("2026-10-03T00:30:00.000Z");
  });

  it("exchanges a request token with a signed form POST", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ data: { access_token: "AT", user_id: "AB1234" } }), { status: 200 });
    }) as unknown as typeof fetch;

    const session = await exchangeRequestToken({ apiKey: "k", apiSecret: "s", requestToken: "r" }, fakeFetch);
    expect(session).toEqual({ accessToken: "AT", providerUserRef: "AB1234" });
    expect(seen?.url).toBe("https://api.kite.trade/session/token");
    const form = new URLSearchParams(String(seen?.init.body));
    expect([...form.keys()].sort()).toEqual(["api_key", "checksum", "request_token"]);
    expect(form.get("checksum")).toBe(sessionChecksum("k", "r", "s"));
    expect([...form.values()]).not.toContain("s"); // the API secret itself is never sent
  });

  it("fails closed on a rejected or malformed exchange", async () => {
    const reject = (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch;
    await expect(exchangeRequestToken({ apiKey: "k", apiSecret: "s", requestToken: "r" }, reject)).rejects.toThrow();
    const malformed = (async () => new Response(JSON.stringify({ data: {} }), { status: 200 })) as unknown as typeof fetch;
    await expect(exchangeRequestToken({ apiKey: "k", apiSecret: "s", requestToken: "r" }, malformed)).rejects.toThrow();
  });

  it("invalidates a token and swallows network failure", async () => {
    const ok = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    expect(await invalidateAccessToken({ apiKey: "k", accessToken: "t" }, ok)).toBe(true);
    const down = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await invalidateAccessToken({ apiKey: "k", accessToken: "t" }, down)).toBe(false);
  });
});

describe("connection status", () => {
  const live = (overrides = {}) => ({
    status: "live" as const,
    expires_at: new Date(now + 3_600_000).toISOString(),
    last_heartbeat_at: new Date(now - 10_000).toISOString(),
    ...overrides
  });

  it("is live only with a fresh heartbeat inside the session", () => {
    expect(deriveConnectionStatus(live(), now)).toBe("live");
  });

  it("fails closed to stale when the worker goes quiet", () => {
    const quiet = live({ last_heartbeat_at: new Date(now - HEARTBEAT_STALE_MS - 1).toISOString() });
    expect(deriveConnectionStatus(quiet, now)).toBe("stale");
    expect(deriveConnectionStatus(live({ last_heartbeat_at: null }), now)).toBe("stale");
  });

  it("requires re-login once the session has expired, even if the worker still reports live", () => {
    expect(deriveConnectionStatus(live({ expires_at: new Date(now - 1).toISOString() }), now)).toBe("reauth_required");
  });

  it("keeps terminal states", () => {
    expect(deriveConnectionStatus(live({ status: "disconnected" }), now)).toBe("disconnected");
    expect(deriveConnectionStatus(live({ status: "reauth_required" }), now)).toBe("reauth_required");
  });

  it("recognises replay connections", () => {
    expect(isReplayConnection("replay-simulated")).toBe(true);
    expect(isReplayConnection("AB1234")).toBe(false);
  });
});
