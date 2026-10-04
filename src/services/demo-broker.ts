import { createRng } from "@/engine/rng";
import type { BrokerEvent, BrokerProvider, Pact, RiskResult } from "@/engine/types";
import { assessBrokerEvent, eventToRow, type PauseDraft } from "@/lib/pipeline/assess";
import type { TradeEventRow } from "@/lib/pipeline/history";

import type { DemoScenario } from "./demo-scenarios";

/**
 * Demo broker adapter. Produces canonical BrokerEvents (the same shape the read-only
 * Angel One and Zerodha adapters emit) and runs them through the same server-side
 * assessment the ingestion pipeline uses. Every event is flagged `simulated`.
 * Runs entirely on the device; nothing is sent over the network.
 */

export interface DemoStep {
  event: BrokerEvent;
  result: RiskResult;
  pause: PauseDraft | null;
}

export interface DemoSessionInput {
  /** Behavioural recipe from a validated scenario file. */
  scenario: DemoScenario;
  seed: number;
  /** Any instant on the session day; the scenario runs at its IST start time on that day. */
  dayEpochMs: number;
  provider?: BrokerProvider;
  /** The user's committed Pact before scenario overrides; null means no committed Pact. */
  pact?: Pact | null;
}

const IST_OFFSET_MS = 330 * 60_000;
export const DEMO_USER_ID = "00000000-0000-4000-8000-00000000d3e0";

/** The Pact a scenario runs under: the given Pact with the scenario's own rule inputs applied. */
export function scenarioPact(scenario: DemoScenario, pact: Pact | null | undefined): Pact | null {
  if (!pact || scenario.pact === null) return null;
  return { ...pact, ...scenario.pact };
}

function hex(rng: () => number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += Math.floor(rng() * 16).toString(16);
  return out;
}

function sessionStartMs(dayEpochMs: number, startMinuteIst: number): number {
  const istMidnight = Math.floor((dayEpochMs + IST_OFFSET_MS) / 86_400_000) * 86_400_000 - IST_OFFSET_MS;
  return istMidnight + startMinuteIst * 60_000;
}

export function buildDemoEvents(input: DemoSessionInput): BrokerEvent[] {
  const rng = createRng(input.seed);
  const next = () => rng.next();
  const { scenario } = input;
  const start = sessionStartMs(input.dayEpochMs, scenario.startMinuteIst);
  const { min, max } = scenario.basePriceRupees;
  const basePrice = min + Math.round(next() * (max - min) * 100) / 100;
  const provider = input.provider ?? "angel_one";

  return scenario.steps.map((step, index) => {
    const jitterSeconds = Math.floor(next() * 50);
    const observedMs = start + step.minute * 60_000 + jitterSeconds * 1000;
    const price = basePrice * (1 + step.move + (next() - 0.5) * 0.002);
    const dedupeHash = hex(next, 64);
    const idHex = dedupeHash.slice(0, 32);
    const id = `${idHex.slice(0, 8)}-${idHex.slice(8, 12)}-4${idHex.slice(13, 16)}-8${idHex.slice(17, 20)}-${idHex.slice(20, 32)}`;
    const orderId = `DEMO${String(input.seed % 1_000_000).padStart(6, "0")}${index}`;
    const observedAt = new Date(observedMs).toISOString();
    return {
      id,
      userId: DEMO_USER_ID,
      provider,
      providerEventId: `${orderId}:COMPLETE:${step.quantity}`,
      providerOrderId: orderId,
      observedAt,
      receivedAt: new Date(observedMs + 400 + Math.floor(next() * 900)).toISOString(),
      eventType: "order_update",
      status: "COMPLETE",
      symbol: scenario.symbol,
      side: step.side,
      quantity: step.quantity,
      averagePricePaise: Math.round(price * 100),
      dedupeHash,
      simulated: true
    };
  });
}

/** Assesses each event against the history before it, exactly as ingestion does for a live fill. */
export function runDemoSession(input: DemoSessionInput): DemoStep[] {
  const events = buildDemoEvents(input);
  const history: TradeEventRow[] = [];
  let counter = 0;
  const newId = () => {
    counter += 1;
    return `00000000-0000-4000-8000-${String(input.seed % 1e6).padStart(6, "0")}${String(counter).padStart(6, "0")}`;
  };
  const pact = scenarioPact(input.scenario, input.pact);
  return events.map((event) => {
    const { result, pause } = assessBrokerEvent({ event, history, pact, newId });
    history.push(eventToRow(event));
    return { event, result, pause };
  });
}
