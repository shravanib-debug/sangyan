import { createHmac } from "node:crypto";

import type { BrokerEvent } from "./types.js";

export type IngestOutcome = "ok" | "not_monitored" | "rejected" | "unavailable";

const RETRY_DELAYS_MS = [500, 1500, 4000];

export function signBody(key: string, timestampMs: number, rawBody: string): string {
  return createHmac("sha256", key).update(`${timestampMs}.${rawBody}`).digest("hex");
}

/** Posts a signed canonical event. Retries are safe: the server dedupes by hash. */
export async function postEvent(
  input: { appUrl: string; signingKey: string; event: BrokerEvent },
  fetchImpl: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<IngestOutcome> {
  const rawBody = JSON.stringify({ event: input.event });
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const timestamp = Date.now();
    try {
      const response = await fetchImpl(`${input.appUrl}/api/internal/broker-events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-thehrav-timestamp": String(timestamp),
          "x-thehrav-signature": signBody(input.signingKey, timestamp, rawBody)
        },
        body: rawBody
      });
      if (response.ok) return "ok";
      if (response.status === 409) return "not_monitored";
      if (response.status < 500) return "rejected";
    } catch {
      // Network failure: retry below.
    }
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) break;
    await sleep(delay);
  }
  return "unavailable";
}
