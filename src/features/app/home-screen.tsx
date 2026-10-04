"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAccountState } from "@/features/account/use-account-state";
import { formatDateTime } from "@/i18n/format";
import { localDatabase } from "@/storage/local/database";

import { LanguageSwitcher } from "./language-switcher";

interface WaitingPause {
  id: string;
  started_at: string;
}

const formatRupees = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

export function HomeScreen() {
  const { t, i18n } = useTranslation();
  const { state } = useAccountState();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [waiting, setWaiting] = useState<WaitingPause[]>([]);
  const [amount, setAmount] = useState(5000);

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
          <p className="eyebrow">Tuesday, October 4, 2026</p>
          <h1>Good morning, Aditya<span className="wave">✦</span></h1>
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
              <div className="stat-card"><span className="stat-icon green">▥</span><strong>3</strong><span>Decisions today</span><small className="positive">↑ 20% this week</small></div>
              <div className="stat-card"><span className="stat-icon sage">◉</span><strong>92%</strong><span>Pact adherence</span><small className="positive">↑ 8% this week</small></div>
              <div className="stat-card"><span className="stat-icon amber">Ⅱ</span><strong>None</strong><span>Active cooldown</span><small className="neutral">You’re clear to reflect</small></div>
              <div className="stat-card"><span className="stat-icon peach">♨</span><strong>6 days</strong><span>Current streak</span><small className="positive">Keep it up!</small></div>
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
              <div className="decision-checks"><p>Before you continue</p><span>✓ Within your daily limit</span><span>✓ No active cooldown</span><span>✓ Matches your pact</span></div>
              <Link className="button" href="/checkin">Continue to check-in <span aria-hidden="true">→</span></Link>
            </div>
          </section>

          <section className="recent-section">
            <div className="section-heading"><h2>Recent decisions</h2><Link href="/journal" className="text-link">View journal →</Link></div>
            <div className="recent-list">
              <div className="recent-item"><span className="recent-icon green">▥</span><div><strong>₹5,000 · Intraday</strong><p>Followed the plan. Waited for confirmation.</p></div><span className="pill success">Aligned</span><time>2h ago</time></div>
              <div className="recent-item"><span className="recent-icon amber">Ⅱ</span><div><strong>₹3,000 · Swing</strong><p>Market felt uncertain, decided to pause.</p></div><span className="pill warning">Paused</span><time>5h ago</time></div>
              <div className="recent-item"><span className="recent-icon red">!</span><div><strong>₹10,000 · Options</strong><p>Went outside the daily limit.</p></div><span className="pill danger">Warning</span><time>Yesterday</time></div>
            </div>
          </section>
        </div>

        <aside className="dashboard-side-column">
          <section className="side-card pact-summary"><div className="section-heading"><h2>My pact</h2><Link href="/pact" className="text-link">Edit</Link></div><div className="pact-score"><div className="score-ring"><strong>92%</strong><span>followed</span></div><div><strong>On track</strong><p>Your rules are working.</p></div></div><div className="mini-progress"><span><b>Daily loss limit</b><i><em style={{ width: "95%" }} /></i><small>95%</small></span><span><b>Trades per day</b><i><em style={{ width: "90%" }} /></i><small>90%</small></span><span><b>Cooldown usage</b><i><em style={{ width: "88%" }} /></i><small>88%</small></span></div></section>
          <section className="side-card insight-card"><p className="eyebrow">Today’s insight</p><h3>Small pauses compound.</h3><p>You’ve stayed within your daily limit for 6 consecutive days. That’s a real habit.</p><Link href="/journal" className="text-link">See your progress →</Link></section>
          {waiting.length > 0 && <section className="side-card"><p className="eyebrow">Needs your attention</p>{waiting.map((pause) => <Link key={pause.id} href={`/pause?pauseId=${pause.id}`} className="waiting-link">Review pause <span>{formatDateTime(pause.started_at, i18n.language)} →</span></Link>)}</section>}
          {onboarded === false && <section className="side-card onboarding-card"><p className="eyebrow">New here?</p><h3>Set your first pact</h3><p>A few simple rules make the rest of Thehrav more useful.</p><Link className="button" href="/onboarding">Get started</Link></section>}
          {!state?.user && <p className="muted dashboard-footnote">{t("home.guestNote")}</p>}
        </aside>
      </section>
    </div>
  );
}
