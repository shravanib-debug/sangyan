import type { SignalHit } from "@/engine/types";

export interface HitDescription {
  /** i18n key, e.g. "signal.revenge.triggered". */
  key: string;
  params: { observed: string; threshold: string; contribution: string };
  /** When set, the matching param is itself an i18n key (money source names). */
  observedKey?: string;
  thresholdKey?: string;
}

function formatMinuteOfDay(minute: number): string {
  const hours = Math.floor(minute / 60) % 24;
  return `${String(hours).padStart(2, "0")}:${String(Math.round(minute % 60)).padStart(2, "0")}`;
}

function formatValue(code: string, value: SignalHit["observedValue"] | SignalHit["threshold"]): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") return value;
  if (code === "signal.breach.daily_loss") return `₹${Math.abs(Math.round(value / 100)).toLocaleString("en-IN")}`;
  if (code === "signal.late_night.triggered") return formatMinuteOfDay(value);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Every pause explains what fired, the value against its threshold, and its share of the score. */
export function describeHit(hit: SignalHit): HitDescription {
  const description: HitDescription = {
    key: hit.explanationCode,
    params: {
      observed: formatValue(hit.explanationCode, hit.observedValue),
      threshold: formatValue(hit.explanationCode, hit.threshold),
      contribution: `${Math.round(hit.contribution * 100)}%`
    }
  };
  if (hit.explanationCode === "signal.source.triggered") {
    description.observedKey = `signal.sourceName.${String(hit.observedValue)}`;
    description.thresholdKey = `signal.sourceName.${String(hit.threshold)}`;
  }
  return description;
}
