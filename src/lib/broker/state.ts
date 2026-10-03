import { randomBytes } from "node:crypto";

import { hmacHex, safeEqualHex } from "@/lib/crypto/signing";

export interface LoginStatePayload {
  uid: string;
  nonce: string;
  exp: number;
}

export const LOGIN_STATE_TTL_MS = 10 * 60 * 1000;

export function newNonce(): string {
  return randomBytes(24).toString("base64url");
}

/** Signed, expiring state token: base64url(payload).hmac. The nonce is also stored server-side for single use. */
export function signLoginState(payload: LoginStatePayload, key: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${hmacHex(key, body)}`;
}

export function verifyLoginState(token: string, key: string, nowMs: number): LoginStatePayload | null {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  if (!safeEqualHex(hmacHex(key, body), signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LoginStatePayload;
    if (typeof payload.uid !== "string" || typeof payload.nonce !== "string" || typeof payload.exp !== "number") {
      return null;
    }
    return payload.exp > nowMs ? payload : null;
  } catch {
    return null;
  }
}
