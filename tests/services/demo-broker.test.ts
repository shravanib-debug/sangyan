import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { resources } from "@/i18n/resources";
import { assessBrokerEvent, DEFAULT_PACT, eventToRow } from "@/lib/pipeline/assess";
import { brokerEventSchema } from "@/lib/validation/schemas";
import { buildDemoEvents, runDemoSession, scenarioPact } from "@/services/demo-broker";
import { DEMO_SCENARIOS, getDemoScenario } from "@/services/demo-scenarios";
import { demoScenarioSchema } from "@/services/demo-scenarios/schema";

vi.mock("server-only", () => ({}));

const DAY = Date.parse("2026-10-04T06:00:00Z");
const SEEDS = Array.from({ length: 25 }, (_, index) => (index + 1) * 7919);
const SCENARIO_DIR = "src/services/demo-scenarios";

/**
 * Expected final level per scenario, under SPEC §8.4 (score tiers) and the committed-Pact
 * L3 lock. Lives only in this test, never in the scenario files or the UI.
 */
const EXPECTED_FINAL_TIER: Record<string, "L0" | "L1" | "L2" | "L3"> = {
  "calm-day": "L0",
  "loss-then-bigger-entry": "L1",
  "churn-then-revenge": "L1",
  "churn-revenge-pact": "L3",
  "late-night-churn": "L0",
  "hold-losers-then-revenge": "L1",
  "late-night-spiral": "L2",
  "late-night-spiral-pact": "L3"
};

const COOLING_BY_TIER = { L0: "none", L1: "open", L2: "open", L3: "timed" } as const;

describe("demo scenario files", () => {
  it("registers every JSON file in the directory", () => {
    const files = readdirSync(SCENARIO_DIR).filter((file) => file.endsWith(".json"));
    expect(files).toHaveLength(8);
    expect(Object.keys(EXPECTED_FINAL_TIER).sort()).toEqual(DEMO_SCENARIOS.map((scenario) => scenario.id).sort());
    expect(DEMO_SCENARIOS.map((scenario) => `${scenario.id}.json`).sort()).toEqual(files.sort());
  });

  it("rejects result fields: scores, tiers, signals and pauses cannot be supplied by a scenario", () => {
    const raw = JSON.parse(readFileSync(join(SCENARIO_DIR, "loss-then-bigger-entry.json"), "utf8")) as Record<string, unknown>;
    for (const field of ["tier", "score", "riskScore", "signalHits", "pause", "confidence"]) {
      expect(demoScenarioSchema.safeParse({ ...raw, [field]: "L3" }).success).toBe(false);
    }
    expect(demoScenarioSchema.safeParse({ ...raw, steps: [{ minute: 0, side: "buy", quantity: 1, move: 0, tier: "L3" }] }).success).toBe(false);
  });

  it("never claims money-source behaviour, which needs check-in data", () => {
    expect(
      demoScenarioSchema.safeParse({
        ...getDemoScenario("calm-day"),
        demonstrates: { signals: ["money_source"] }
      }).success
    ).toBe(false);
  });

  it("has a title and description in every locale", () => {
    for (const locale of ["en", "hi", "mr"] as const) {
      const scenarios = (resources[locale].translation as { broker: { scenarios: Record<string, unknown> } }).broker
        .scenarios;
      for (const scenario of DEMO_SCENARIOS) {
        expect(scenarios[scenario.id]).toMatchObject({ title: expect.any(String), description: expect.any(String) });
      }
    }
  });
});

describe("demo generator", () => {
  it("emits schema-valid canonical events that are always flagged simulated", () => {
    for (const scenario of DEMO_SCENARIOS) {
      const events = buildDemoEvents({ scenario, seed: 11, dayEpochMs: DAY });
      expect(events).toHaveLength(scenario.steps.length);
      for (const event of events) {
        expect(brokerEventSchema.safeParse(event).success).toBe(true);
        expect(event.simulated).toBe(true);
        expect(event.provider).toBe("angel_one");
      }
    }
  });

  it("is reproducible for a seed and varies prices across seeds while keeping the pattern", () => {
    const scenario = getDemoScenario("loss-then-bigger-entry");
    expect(runDemoSession({ scenario, seed: 5, dayEpochMs: DAY })).toEqual(runDemoSession({ scenario, seed: 5, dayEpochMs: DAY }));
    const a = buildDemoEvents({ scenario, seed: 5, dayEpochMs: DAY });
    const b = buildDemoEvents({ scenario, seed: 6, dayEpochMs: DAY });
    expect(a.map((event) => event.averagePricePaise)).not.toEqual(b.map((event) => event.averagePricePaise));
    expect(a.map((event) => [event.side, event.quantity])).toEqual(b.map((event) => [event.side, event.quantity]));
  });

  it("places each session at the scenario's IST start time on the given day, in time order", () => {
    for (const scenario of DEMO_SCENARIOS) {
      const events = buildDemoEvents({ scenario, seed: 3, dayEpochMs: DAY });
      const first = new Date(Date.parse(events[0]!.observedAt) + 330 * 60_000);
      expect(first.getUTCHours() * 60 + first.getUTCMinutes()).toBe(scenario.startMinuteIst);
      const times = events.map((event) => Date.parse(event.observedAt));
      expect([...times].sort((x, y) => x - y)).toEqual(times);
    }
  });
});

describe("demo sessions use the ingestion assessment", () => {
  it("matches assessBrokerEvent called directly with the same events, history and Pact", () => {
    for (const scenario of DEMO_SCENARIOS) {
      const steps = runDemoSession({ scenario, seed: 9, dayEpochMs: DAY, pact: DEFAULT_PACT });
      const pact = scenarioPact(scenario, DEFAULT_PACT);
      const history = steps.map(({ event }) => eventToRow(event));
      steps.forEach((step, index) => {
        const direct = assessBrokerEvent({
          event: step.event,
          history: history.slice(0, index),
          pact,
          newId: () => step.result.assessmentId
        });
        expect(direct.result.score).toBe(step.result.score);
        expect(direct.result.tier).toBe(step.result.tier);
        expect(direct.result.signalHits).toEqual(step.result.signalHits);
        expect(direct.result.hardRuleOverrides).toEqual(step.result.hardRuleOverrides);
      });
    }
  });
});

describe("scenario verification", () => {
  const summary: string[] = [];

  for (const scenario of DEMO_SCENARIOS) {
    it(`${scenario.id} produces exactly the behaviour it claims, on every seed`, () => {
      const expectedTier = EXPECTED_FINAL_TIER[scenario.id]!;
      const claimed = [...scenario.demonstrates.signals].sort();
      let last = runDemoSession({ scenario, seed: SEEDS[0]!, dayEpochMs: DAY, pact: DEFAULT_PACT }).at(-1)!;
      for (const seed of SEEDS) {
        const steps = runDemoSession({ scenario, seed, dayEpochMs: DAY, pact: DEFAULT_PACT });
        expect(steps).toHaveLength(scenario.steps.length);
        expect(steps.every((step) => step.event.simulated === true)).toBe(true);

        for (const step of steps) {
          // Score is the engine's normalised weight sum; every non-L0 tier is explained and paused.
          const weightSum = step.result.signalHits.reduce((sum, hit) => sum + hit.contribution, 0);
          expect(step.result.score).toBeCloseTo(weightSum, 10);
          if (step.result.tier === "L0") expect(step.pause).toBeNull();
          else {
            expect(step.result.signalHits.length + step.result.hardRuleOverrides.length).toBeGreaterThan(0);
            expect(step.pause?.tier).toBe(step.result.tier);
          }
        }

        last = steps.at(-1)!;
        const where = `${scenario.id} seed ${seed}`;
        // Exactly the claimed signals on the final fill: none missing, none unclaimed.
        expect(last.result.signalHits.map((hit) => hit.signal).sort(), where).toEqual(claimed);
        const codes = last.result.signalHits.map((hit) => hit.explanationCode);
        for (const code of scenario.demonstrates.explanationCodes ?? []) expect(codes, where).toContain(code);
        expect(last.result.tier, `${where}: engine score ${last.result.score}`).toBe(expectedTier);
        const cooling = !last.pause ? "none" : last.pause.expiresAt ? "timed" : "open";
        expect(cooling, where).toBe(COOLING_BY_TIER[expectedTier]);
      }

      const names = claimed.length === 0 ? "no signals" : `${claimed.join(" + ")} detected`;
      summary.push(
        [
          scenario.id.toUpperCase().replaceAll("-", " "),
          `✓ generated ${scenario.steps.length} simulated events x ${SEEDS.length} seeds`,
          "✓ engine evaluated (assessBrokerEvent)",
          `✓ ${names}`,
          `✓ ${last.result.tier}, score ${Math.round(last.result.score * 100)}/100, cooling-off ${last.pause ? (last.pause.expiresAt ? "timed lock" : `${last.pause.tier} pause`) : "none"} (from engine)`
        ].join("\n")
      );
      if (summary.length === DEMO_SCENARIOS.length) console.log(`\n${summary.join("\n\n")}\n`);
    });
  }

  it("lands exactly on the SPEC §8.4 boundaries (float sums are rounded in the scorer)", () => {
    const spiral = runDemoSession({ scenario: getDemoScenario("late-night-spiral"), seed: 1, dayEpochMs: DAY, pact: DEFAULT_PACT });
    expect(spiral.at(-1)!.result.score).toBe(0.5);
    expect(spiral.at(-1)!.result.tier).toBe("L2");
    const withPact = runDemoSession({ scenario: getDemoScenario("late-night-spiral-pact"), seed: 1, dayEpochMs: DAY, pact: DEFAULT_PACT });
    expect(withPact.at(-1)!.result.score).toBe(0.75);
  });

  it("covers L0, L1, L2 and L3 through the engine", () => {
    const reached = new Map<string, string[]>();
    for (const scenario of DEMO_SCENARIOS) {
      const final = runDemoSession({ scenario, seed: SEEDS[0]!, dayEpochMs: DAY, pact: DEFAULT_PACT }).at(-1)!.result;
      reached.set(final.tier, [...(reached.get(final.tier) ?? []), `${scenario.id} (${final.score})`]);
    }
    for (const tier of ["L0", "L1", "L2", "L3"]) {
      expect(
        reached.has(tier),
        `${tier} not reached by any scenario. Engine results: ${JSON.stringify(Object.fromEntries(reached))}. ` +
          "From broker events without a Pact breach the maximum is revenge+overtrade+late_night+loss_hold = 0.50, " +
          "which floating-point addition evaluates to 0.49999999999999994 (< tiers.l2); any committed Pact breach locks at L3."
      ).toBe(true);
    }
  });
});

describe("broker readiness route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reports booleans only and never echoes a key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pk");
    vi.stubEnv("ANGEL_ONE_API_KEY", "angel-secret-value");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-secret-value");
    const { GET } = await import("../../app/api/brokers/readiness/route");
    const response = await GET();
    const text = await response.text();
    expect(text).not.toContain("angel-secret-value");
    expect(text).not.toContain("service-secret-value");
    expect(JSON.parse(text)).toMatchObject({ angelOne: { appKeyConfigured: true }, pipelineReady: false });
  });
});
