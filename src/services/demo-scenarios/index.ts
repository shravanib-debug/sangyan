import calmDay from "./calm-day.json";
import churnRevengePact from "./churn-revenge-pact.json";
import churnThenRevenge from "./churn-then-revenge.json";
import holdLosersThenRevenge from "./hold-losers-then-revenge.json";
import lateNightChurn from "./late-night-churn.json";
import lateNightSpiral from "./late-night-spiral.json";
import lateNightSpiralPact from "./late-night-spiral-pact.json";
import lossThenBiggerEntry from "./loss-then-bigger-entry.json";
import { demoScenarioSchema, type DemoScenario } from "./schema";

export type { DemoScenario } from "./schema";

/** Every scenario is validated at load; an invalid file fails loudly instead of rendering. */
export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  calmDay,
  lossThenBiggerEntry,
  churnThenRevenge,
  churnRevengePact,
  lateNightChurn,
  holdLosersThenRevenge,
  lateNightSpiral,
  lateNightSpiralPact
].map((raw) => demoScenarioSchema.parse(raw));

export const DEFAULT_SCENARIO_ID = "churn-revenge-pact";

export function getDemoScenario(id: string): DemoScenario {
  const scenario = DEMO_SCENARIOS.find((candidate) => candidate.id === id);
  if (!scenario) throw new Error(`unknown_demo_scenario:${id}`);
  return scenario;
}
