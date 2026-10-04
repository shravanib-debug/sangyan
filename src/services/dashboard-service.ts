import { getEffectivePact } from "@/engine/pact";
import type { CheckIn, Pact } from "@/engine/types";
import type { ThehravDatabase } from "@/storage/local/database";

import { loadReview, type DecisionRecord } from "./review-service";

export type DecisionTone = "success" | "warning" | "danger" | "neutral";

export interface RecentDecision {
  id: string;
  pauseId?: string;
  amountPaise: number;
  horizon: CheckIn["horizon"];
  reason: string;
  at: string;
  label: string;
  tone: DecisionTone;
}

export interface DashboardData {
  decisionsToday: number;
  decisionsThisWeek: number;
  /** Share (0-100) of recent decisions that stayed within the Pact; null with no decisions yet. */
  adherencePercent: number | null;
  /** Minutes left on the longest running pause, or 0 when nothing is cooling down. */
  cooldownMinutes: number;
  /** Days in a row, ending today or yesterday, with at least one check-in. */
  streakDays: number;
  recent: RecentDecision[];
  pact: Pact | null;
  tradesToday: number;
  lossTodayPaise: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ADHERENCE_WINDOW_MS = 30 * DAY_MS;
const RECENT_LIMIT = 3;

function dayKey(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function startOfToday(nowMs: number): number {
  const date = new Date(nowMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function brokePact(record: DecisionRecord): boolean {
  if (record.outcome === "skipped_pause") return true;
  const assessment = record.assessment;
  if (!assessment) return record.tier === "L3";
  return assessment.hardRuleOverrides.length > 0 || assessment.signalHits.some((hit) => hit.signal === "pact_breach");
}

/** How a decision ended, in the words the dashboard shows. */
export function describeDecision(record: Pick<DecisionRecord, "tier" | "outcome">): { label: string; tone: DecisionTone } {
  switch (record.outcome) {
    case "abandoned":
      return { label: "Stepped back", tone: "success" };
    case "skipped_pause":
      return { label: "Skipped pause", tone: "danger" };
    case "waiting":
      return record.tier === "L0" ? { label: "Aligned", tone: "success" } : { label: "Pausing", tone: "warning" };
    case "expired":
      return { label: "Paused", tone: "warning" };
    case "continued":
      if (record.tier === "L0") return { label: "Aligned", tone: "success" };
      return record.tier === "L1" ? { label: "Proceeded", tone: "warning" } : { label: "Warning", tone: "danger" };
    default:
      return record.tier === "L0" || record.tier === undefined
        ? { label: "Aligned", tone: "success" }
        : { label: "Paused", tone: "warning" };
  }
}

function streak(checkIns: Pick<CheckIn, "timestamp">[], nowMs: number): number {
  const days = new Set(checkIns.map((checkIn) => dayKey(new Date(checkIn.timestamp).getTime())));
  let cursor = startOfToday(nowMs);
  if (!days.has(dayKey(cursor))) cursor -= DAY_MS;
  let count = 0;
  while (days.has(dayKey(cursor))) {
    count += 1;
    cursor -= DAY_MS;
  }
  return count;
}

/** Everything on the Home dashboard, read from this device. With no data every figure is empty. */
export async function loadDashboard(db: ThehravDatabase, nowMs: number): Promise<DashboardData> {
  const todayStart = startOfToday(nowMs);
  const checkIns = (await db.checkins.toArray()) as CheckIn[];
  const at = (checkIn: CheckIn) => new Date(checkIn.timestamp).getTime();

  const inWindow = checkIns.filter((checkIn) => at(checkIn) >= nowMs - ADHERENCE_WINDOW_MS).length;
  // Newest first, so the first few are also the "Recent decisions" list.
  const decisions = (await loadReview(db, nowMs, Math.max(inWindow, RECENT_LIMIT))).decisions;
  const recentWindow = decisions.slice(0, inWindow);
  const adherencePercent = recentWindow.length
    ? Math.round((recentWindow.filter((record) => !brokePact(record)).length / recentWindow.length) * 100)
    : null;

  const recent = decisions.slice(0, RECENT_LIMIT).map((record): RecentDecision => ({
    id: record.checkIn.id,
    pauseId: record.pause?.id,
    amountPaise: record.checkIn.amountPaise,
    horizon: record.checkIn.horizon,
    reason: record.checkIn.reason,
    at: record.checkIn.timestamp,
    ...describeDecision(record)
  }));

  const pauses = await db.pauses.where("outcome").equals("waiting").toArray();
  const cooldownMs = pauses.reduce((longest, pause) => {
    const left = pause.expiresAt ? new Date(pause.expiresAt).getTime() - nowMs : 0;
    return Math.max(longest, left);
  }, 0);

  const trades = await db.trades.where("timestamp").aboveOrEqual(new Date(todayStart).toISOString()).toArray();
  const netToday = trades.reduce((sum, trade) => sum + (trade.pnlPaise ?? 0), 0);

  return {
    decisionsToday: checkIns.filter((checkIn) => at(checkIn) >= todayStart).length,
    decisionsThisWeek: checkIns.filter((checkIn) => at(checkIn) >= nowMs - 7 * DAY_MS).length,
    adherencePercent,
    cooldownMinutes: Math.ceil(cooldownMs / 60_000),
    streakDays: streak(checkIns, nowMs),
    recent,
    pact: getEffectivePact(await db.pacts.toArray(), nowMs),
    tradesToday: trades.length,
    lossTodayPaise: Math.max(0, -netToday)
  };
}

/** "2h ago", "Yesterday", or a short date. */
export function relativeTime(iso: string, nowMs: number): string {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24 && dayKey(nowMs) === dayKey(new Date(iso).getTime())) return `${hours}h ago`;
  if (dayKey(nowMs - DAY_MS) === dayKey(new Date(iso).getTime())) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
