"use client";

import { liveQuery } from "dexie";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { useAccountState } from "@/features/account/use-account-state";
import { formatDateTime } from "@/i18n/format";
import { loadDashboard, relativeTime, type DashboardData, type DecisionTone } from "@/services/dashboard-service";
import { localDatabase } from "@/storage/local/database";

import { LanguageSwitcher } from "./language-switcher";

interface WaitingPause {
  id: string;
  started_at: string;
}

const formatRupees = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;
const rupeesFromPaise = (paise: number) => formatRupees(Math.round(paise / 100));

const HORIZON_LABEL: Record<string, string> = {
  intraday: "Intraday",
  days: "Days",
  weeks: "Weeks",
  months: "Months",
  years: "Years"
};
const TONE_ICON: Record<DecisionTone, { className: string; glyph: string }> = {
  success: { className: "green", glyph: "▥" },
  warning: { className: "amber", glyph: "Ⅱ" },
  danger: { className: "red", glyph: "!" },
  neutral: { className: "green", glyph: "▥" }
};

function greeting(nowMs: number): string {
  const hour = new Date(nowMs).getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function percentOf(value: number, limit: number): number {
  return limit > 0 ? Math.min(100, Math.round((value / limit) * 100)) : 0;
}

/** Re-reads the dashboard whenever check-ins, pauses, trades or the Pact change on this device. */
function useDashboard(nowMs: number | null): DashboardData | null {
  const [data, setData] = useState<DashboardData | null>(null);
  useEffect(() => {
    if (nowMs === null) return;
    const subscription = liveQuery(() => loadDashboard(localDatabase, nowMs)).subscribe({
      next: setData,
      error: () => undefined
    });
    return () => subscription.unsubscribe();
  }, [nowMs]);
  return data;
}

/** Current time, ticking each minute so cooldowns and "2h ago" stay correct. Null until mounted, so the server never renders a clock that disagrees with the browser's. */
// Rounded to the minute so every read between ticks returns the same snapshot.
const currentMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
function subscribeToClock(onTick: () => void) {
  const timer = window.setInterval(onTick, 15_000);
  return () => window.clearInterval(timer);
}

function useNow(): number | null {
  return useSyncExternalStore(subscribeToClock, currentMinute, () => null);
}

export function HomeScreen() {
  const { t, i18n } = useTranslation();
  const { state } = useAccountState();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [waiting, setWaiting] = useState<WaitingPause[]>([]);
  const [amount, setAmount] = useState(5000);
  const now = useNow();
  const dashboard = useDashboard(now);
  const name = state?.user?.displayName;
  const pact = dashboard?.pact ?? null;
  const tradesLeft = pact ? pact.maximumTradesPerDay - (dashboard?.tradesToday ?? 0) : null;
  const withinLimit = pact ? (dashboard?.lossTodayPaise ?? 0) < pact.dailyLossLimitPaise && (tradesLeft ?? 0) > 0 : null;
  const cooling = (dashboard?.cooldownMinutes ?? 0) > 0;
  const adherence = dashboard?.adherencePercent ?? null;
  const streakDays = dashboard?.streakDays ?? 0;
  const lossPercent = pact ? percentOf(dashboard?.lossTodayPaise ?? 0, pact.dailyLossLimitPaise) : 0;
  const tradesPercent = pact ? percentOf(dashboard?.tradesToday ?? 0, pact.maximumTradesPerDay) : 0;

  useEffect(() => {
    let cancelled = false;
    void localDatabase.settings.get("onboardingCompleted").then((setting) => {
      if (!cancelled) setOnboarded(setting?.value === true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!state?.user) return;
    let cancelled = false;
    void fetch("/api/pauses", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ pauses: WaitingPause[] }> : null)
      .then((body) => { if (!cancelled && body) setWaiting(body.pauses); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [state?.user]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">{now !== null && new Date(now).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <h1>{now !== null ? greeting(now) : "Welcome"}{name ? `, ${name}` : ""}<span className="wave">✦</span></h1>
          <p className="page-subtitle">Stay consistent. Make calmer decisions.</p>
        </div>
        <div className="dashboard-header-actions">
          <LanguageSwitcher />
          {state?.user && <span className="signed-in-note">{state.user.email}</span>}
        </div>
      </header>

      <section className="dashboard-grid">
        <div className="dashboard-main-column">
          <section className="hero-card">
            <div>
              <p className="eyebrow light">Your next step</p>
              <h2>Think before you trade.</h2>
              <p>Run your latest decision through the plan you set.</p>
              <Link className="button hero-button" href="/checkin">Start Decision Check-in <span aria-hidden="true">→</span></Link>
            </div>
            <div className="hero-bars" aria-hidden="true">
              <i /><i /><i /><i /><i /><b>↗</b>
            </div>
          </section>

          <section className="section-block">
            <div className="section-heading"><div><p className="eyebrow">Today</p><h2>Keep your plan close</h2></div><Link href="/journal" className="text-link">View all →</Link></div>
            <div className="stat-grid">
              <div className="stat-card"><span className="stat-icon green">▥</span><strong>{dashboard?.decisionsToday ?? 0}</strong><span>Decisions today</span><small className="neutral">{dashboard?.decisionsThisWeek ?? 0} in the last 7 days</small></div>
              <div className="stat-card"><span className="stat-icon sage">◉</span><strong>{adherence === null ? "—" : `${adherence}%`}</strong><span>Pact adherence</span><small className={adherence === null ? "neutral" : "positive"}>{adherence === null ? "No decisions yet" : "Last 30 days"}</small></div>
              <div className="stat-card"><span className="stat-icon amber">Ⅱ</span><strong>{cooling ? `${dashboard?.cooldownMinutes} min` : "None"}</strong><span>Active cooldown</span><small className="neutral">{cooling ? "Take a breath first" : "You’re clear to reflect"}</small></div>
              <div className="stat-card"><span className="stat-icon peach">♨</span><strong>{streakDays} {streakDays === 1 ? "day" : "days"}</strong><span>Current streak</span><small className={streakDays ? "positive" : "neutral"}>{streakDays ? "Keep it up!" : "Check in to start one"}</small></div>
            </div>
          </section>

          <section className="decision-card">
            <div className="section-heading"><div><p className="eyebrow">Your next decision</p><h2>Should you make this investment?</h2></div><span className="status-dot">● Ready</span></div>
            <div className="decision-body">
              <div className="decision-amount">
                <label htmlFor="quick-amount">Amount you’re considering</label>
                <div className="amount-control"><button aria-label="Decrease amount" onClick={() => setAmount((value) => Math.max(500, value - 500))}>−</button><output id="quick-amount">{formatRupees(amount)}</output><button aria-label="Increase amount" onClick={() => setAmount((value) => value + 500)}>+</button></div>
                <div className="amount-presets">{[1000, 5000, 10000, 25000].map((preset) => <button key={preset} className={preset === amount ? "selected" : ""} onClick={() => setAmount(preset)}>{formatRupees(preset)}</button>)}</div>
              </div>
              <div className="decision-checks"><p>Before you continue</p><span>{withinLimit === null ? "○ No daily limit set yet" : withinLimit ? "✓ Within your daily limit" : "! Daily limit reached"}</span><span>{cooling ? `! Cooldown: ${dashboard?.cooldownMinutes} min left` : "✓ No active cooldown"}</span><span>{pact ? (pact.maxPositionPaise && amount * 100 > pact.maxPositionPaise ? "! Above your per-trade cap" : "✓ Matches your pact") : "○ Set a pact to compare"}</span></div>
              <Link className="button" href="/checkin">Continue to check-in <span aria-hidden="true">→</span></Link>
            </div>
          </section>

          <section className="recent-section">
            <div className="section-heading"><h2>Recent decisions</h2><Link href="/journal" className="text-link">View journal →</Link></div>
            <div className="recent-list">
              {dashboard && dashboard.recent.length === 0 && (
                <p className="muted">No decisions yet. Your check-ins will appear here. <Link href="/checkin" className="text-link">Start one →</Link></p>
              )}
              {dashboard?.recent.map((decision) => (
                <div key={decision.id} className="recent-item">
                  <span className={`recent-icon ${TONE_ICON[decision.tone].className}`}>{TONE_ICON[decision.tone].glyph}</span>
                  <div><strong>{rupeesFromPaise(decision.amountPaise)} · {HORIZON_LABEL[decision.horizon] ?? decision.horizon}</strong><p>{decision.reason || "No reason written."}</p></div>
                  <span className={`pill ${decision.tone}`}>{decision.label}</span>
                  <time dateTime={decision.at}>{now !== null && relativeTime(decision.at, now)}</time>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="dashboard-side-column">
          <section className="side-card pact-summary"><div className="section-heading"><h2>My pact</h2><Link href="/pact" className="text-link">{pact ? "Edit" : "Set up"}</Link></div><div className="pact-score"><div className="score-ring"><strong>{adherence === null ? "—" : `${adherence}%`}</strong><span>followed</span></div><div><strong>{!pact ? "No pact yet" : adherence === null || adherence >= 80 ? "On track" : "Needs attention"}</strong><p>{!pact ? "Set a few rules while you’re calm." : adherence === null ? "Check in before your next trade." : adherence >= 80 ? "Your rules are working." : "Some recent decisions broke your rules."}</p></div></div>{pact && <div className="mini-progress"><span><b>Loss today of {rupeesFromPaise(pact.dailyLossLimitPaise)}</b><i><em style={{ width: `${lossPercent}%` }} /></i><small>{lossPercent}%</small></span><span><b>Trades today ({dashboard?.tradesToday ?? 0}/{pact.maximumTradesPerDay})</b><i><em style={{ width: `${tradesPercent}%` }} /></i><small>{tradesPercent}%</small></span><span><b>Cooldown after a loss</b><small>{pact.cooldownAfterLossMinutes} min</small></span></div>}</section>
          <section className="side-card insight-card"><p className="eyebrow">Today’s insight</p><h3>Small pauses compound.</h3><p>{streakDays ? `You’ve checked in ${streakDays} ${streakDays === 1 ? "day" : "days"} in a row. That’s a real habit forming.` : "One check-in before a trade is the first step to a calmer habit."}</p><Link href="/journal" className="text-link">See your progress →</Link></section>
          {waiting.length > 0 && <section className="side-card"><p className="eyebrow">Needs your attention</p>{waiting.map((pause) => <Link key={pause.id} href={`/pause?pauseId=${pause.id}`} className="waiting-link">Review pause <span>{formatDateTime(pause.started_at, i18n.language)} →</span></Link>)}</section>}
          {onboarded === false && <section className="side-card onboarding-card"><p className="eyebrow">New here?</p><h3>Set your first pact</h3><p>A few simple rules make the rest of Thehrav more useful.</p><Link className="button" href="/onboarding">Get started</Link></section>}
          {!state?.user && <p className="muted dashboard-footnote">{t("home.guestNote")}</p>}
        </aside>
      </section>
    </div>
  );
}
