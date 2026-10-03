import { createHash } from "node:crypto";

/**
 * Zerodha Kite Connect session management: login URL, one-time request-token
 * exchange and token invalidation. This module intentionally contains no
 * order operations.
 */
const KITE_LOGIN = "https://kite.zerodha.com/connect/login";
const KITE_API = "https://api.kite.trade";

export function buildLoginUrl(apiKey: string, state: string): string {
  const url = new URL(KITE_LOGIN);
  url.searchParams.set("v", "3");
  url.searchParams.set("api_key", apiKey);
  // Kite echoes redirect_params back on the callback.
  url.searchParams.set("redirect_params", new URLSearchParams({ state }).toString());
  return url.toString();
}

export function sessionChecksum(apiKey: string, requestToken: string, apiSecret: string): string {
  return createHash("sha256").update(`${apiKey}${requestToken}${apiSecret}`).digest("hex");
}

/** Kite access tokens expire at about 06:00 IST the next day. */
export function kiteTokenExpiry(nowMs: number): Date {
  const IST_OFFSET_MS = 330 * 60 * 1000;
  const istNow = new Date(nowMs + IST_OFFSET_MS);
  const expiryIst = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), 6, 0, 0);
  const next = istNow.getTime() >= expiryIst ? expiryIst + 24 * 60 * 60 * 1000 : expiryIst;
  return new Date(next - IST_OFFSET_MS);
}

export interface KiteSession {
  accessToken: string;
  providerUserRef: string;
}

type Fetch = typeof fetch;

export async function exchangeRequestToken(
  input: { apiKey: string; apiSecret: string; requestToken: string },
  fetchImpl: Fetch = fetch
): Promise<KiteSession> {
  const response = await fetchImpl(`${KITE_API}/session/token`, {
    method: "POST",
    headers: { "X-Kite-Version": "3", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      api_key: input.apiKey,
      request_token: input.requestToken,
      checksum: sessionChecksum(input.apiKey, input.requestToken, input.apiSecret)
    })
  });
  if (!response.ok) throw new Error(`kite_token_exchange_failed:${response.status}`);
  const body = (await response.json()) as { data?: { access_token?: string; user_id?: string } };
  const accessToken = body.data?.access_token;
  const userId = body.data?.user_id;
  if (!accessToken || !userId) throw new Error("kite_token_exchange_malformed");
  return { accessToken, providerUserRef: userId };
}

export async function invalidateAccessToken(
  input: { apiKey: string; accessToken: string },
  fetchImpl: Fetch = fetch
): Promise<boolean> {
  const url = new URL(`${KITE_API}/session/token`);
  url.searchParams.set("api_key", input.apiKey);
  url.searchParams.set("access_token", input.accessToken);
  try {
    const response = await fetchImpl(url, { method: "DELETE", headers: { "X-Kite-Version": "3" } });
    return response.ok;
  } catch {
    return false;
  }
}
