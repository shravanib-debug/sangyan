import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { assertNoAdvice } from "@/engine/guardrails";
import { PUSH_COPY, buildPushPayload } from "@/lib/push/copy";

describe("push notification copy", () => {
  it("passes the no-advice guardrail in every locale", () => {
    for (const copy of Object.values(PUSH_COPY)) {
      for (const text of Object.values(copy)) expect(() => assertNoAdvice(text)).not.toThrow();
    }
  });

  it("is generic: no amounts, symbols, sources or tiers, whatever the event", () => {
    const payload = buildPushPayload({ pauseId: "00000000-0000-4000-8000-000000000001", simulated: false, locale: "en" });
    const visible = `${payload.title} ${payload.body}`;
    expect(visible).not.toMatch(/\d/);
    expect(visible).not.toMatch(/₹|INR|L[0-3]|loan|emergency|borrow|loss/i);
    expect(Object.keys(payload).sort()).toEqual(["body", "tag", "title", "url"]);
  });

  it("deep-links to the protected pause, which loads details only after sign-in", () => {
    const payload = buildPushPayload({ pauseId: "abc", simulated: false, locale: "mr" });
    expect(payload.url).toBe("/pause?pauseId=abc");
  });

  it("labels simulated replay and falls back to English for unknown locales", () => {
    const simulated = buildPushPayload({ pauseId: "abc", simulated: true, locale: "xx" });
    expect(simulated.body).toBe(PUSH_COPY.en.simulatedBody);
    expect(simulated.body.toLowerCase()).toContain("simulated");
  });

  it("stays identical to the copy the Edge Function ships", () => {
    expect(readFileSync("supabase/functions/_shared/push-copy.ts", "utf8")).toBe(
      readFileSync("src/lib/push/copy.ts", "utf8")
    );
  });
});
