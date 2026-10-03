import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacHex(key: string, message: string): string {
  return createHmac("sha256", key).update(message).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export const SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;

/** Verifies the worker-to-app signature: HMAC-SHA256 over `${timestampMs}.${rawBody}`. */
export function verifyBodySignature(input: {
  key: string;
  rawBody: string;
  timestampMs: string | null;
  signature: string | null;
  nowMs: number;
}): boolean {
  if (!input.timestampMs || !input.signature) return false;
  const timestamp = Number(input.timestampMs);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(input.nowMs - timestamp) > SIGNATURE_MAX_SKEW_MS) return false;
  return safeEqualHex(hmacHex(input.key, `${input.timestampMs}.${input.rawBody}`), input.signature);
}
