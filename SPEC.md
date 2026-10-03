# SANGYAN Hackathon: Track D Product Specification (Thehrav)

> This file defines **what the product does and why**. `ARCHITECTURE.md` defines how it is built. `TASKS.md` and `TRACKER.md` define execution.
> Guardrails in section 3 and formulas in section 8 are normative.

---

## 0. Quick summary

| Item | Decision |
|---|---|
| Track | D: Financial Habits and Behavioral Resilience |
| Product | A full-stack, local-first PWA that helps an investor pause, reflect, and follow rules made while calm |
| Core intervention | Money-source check-in + explainable behavioral signals + proportional cooling-off pause + decision journal |
| Target user | First-time or vulnerable retail investor in a Tier-2/3 Indian city, comfortable in Hindi or Marathi |
| Product form | Installable Next.js PWA with offline capability, optional account/sync, and a Supabase backend |
| Privacy position | Raw CSV and audio stay local by default; cloud sync is optional, purpose-specific, and consented |
| Advice boundary | Never recommends, ranks, predicts, or places a trade |
| MVP connected flow | Clearly labelled synthetic trade event demonstrates backend detection, outbox, and Web Push |
| Deliverables | Live PWA, 3-5 minute video, PPT, and one complete user journey |

**Positioning:** investor-protection infrastructure, not a trading-productivity tool. Success means more considered decisions and better adherence to self-authored rules, not engagement or P&L.

---

## 1. Problem and target user

### 1.1 Problem statement

Fear, greed, FOMO, herd behavior, and revenge trading can push investors, including people using emergency savings or instant loans, toward decisions they would not make with a clear head.

The product addresses two directions:

1. **Cooling-Off Circuit Breaker:** detect erratic patterns such as rapid loss chasing and late-night impulsive activity, then introduce a deliberate pause before the next action.
2. **Decision Journal:** ask the user to state their reasoning, time horizon, and exit condition before committing funds.

### 1.2 Primary persona

**Ramesh, 27, Nashik:** works at a small business, began derivatives trading after short-video tips, uses a low-end Android phone, prefers Marathi/Hindi, recently lost money, and has considered funding a trade with an instant-loan app.

### 1.3 Design principle

Build a speed bump, not a guru. The system mirrors the user's own rules and stated intent. It does not decide what instrument they should buy, sell, or hold.

### 1.4 Evaluation alignment

| Criterion | Response |
|---|---|
| Resilience and safety impact | Pact, pauses, money-source triage, process metrics, and transparent evaluation |
| Tier-2/3 usability | Hindi/Marathi/English, large controls, offline flow, low-end performance, text fallback |
| Guardrail compliance and trust | Deterministic explanations, RLS, consent, data minimisation, no advice |
| Technical execution | Full-stack PWA, shared engine, worker computation, sync, synthetic events, Web Push |
| Feasibility and scalability | PostgreSQL data model, event ingestion boundary, outbox, optional account and future adapters |

---

## 2. Product definition

### 2.1 Core loop

```text
Learn risk without money
        -> set rules while calm
        -> check in before acting
        -> declare whose money it is
        -> state reason and horizon
        -> receive an explainable pause
        -> proceed, pause, or abandon
        -> review whether the process matched the Pact
```

### 2.2 MVP scope

1. Installable, offline-capable PWA.
2. Guest mode with all core local features.
3. Optional Supabase account for cross-device sync and recovery.
4. Pre-Commitment Pact with immediate tightening and delayed loosening.
5. Money-Source Triage for surplus, savings, emergency funds, and borrowing.
6. Explainable pattern detector over canonical local or consented events.
7. Proportional friction ladder and explicit lock expiry.
8. Text Decision Journal; optional capability-gated on-device voice transcription.
9. Consequence Simulator using the user's amount and stated assumptions.
10. Local CSV import that drops non-allowlisted columns and never uploads the raw file.
11. Offline mutation queue with idempotent synchronization.
12. Synthetic connected-event endpoint that demonstrates server verification, outbox processing, and generic Web Push.
13. Export, consent revocation, local deletion, and cloud account deletion.

### 2.3 Stretch scope

- Panic-moment companion.
- Post-loss process review.
- Weekly behavioral review.
- Guardian share message initiated by the user.
- Additional Indian languages.
- A reviewed pilot adapter for an official, consented event source.

### 2.4 Explicitly out of scope

- Stock tips, buy/sell/hold recommendations, targets, predictions, or algorithms.
- Trade placement, order routing, or claims that the MVP blocks an unrelated broker app.
- Broker credential scraping, SMS/OTP reading, contact uploads, or screen overlays.
- Margin, loan, broker, or instrument promotion.
- Payments, referrals, advertisements, subscriptions, or lead generation.
- Social leaderboards or streaks that reward trading or engagement.
- Uploading raw CSV or raw audio by default.
- Free-form market chat or an LLM making risk decisions.

### 2.5 Honest limitation

The MVP can pause a user who voluntarily checks in and can react to a synthetic connected event. It cannot observe or block a real order in a third-party broker app without a future official integration. This limitation must appear in the product and pitch.

---

## 3. Guardrails as engineering requirements

| Guardrail | Product requirement | Enforcement |
|---|---|---|
| No advice or prediction | No output recommends, ranks, predicts, or promotes an instrument | Copy linter, refusal rules, snapshots |
| No order placement | Event ingestion is read-only behavior context; no trading endpoint exists | Route allowlist and architecture tests |
| Privacy by design | Raw files/audio local; synced fields minimised and consented | Network, schema, consent, and log-redaction tests |
| Account optional | Guest users complete the core journey offline | Offline E2E |
| Secure cloud data | Grants and RLS on every exposed user table | Supabase DB allow/deny tests |
| Explainability | Every pause identifies signals, values, thresholds, contribution, and overrides | Required result type and UI snapshots |
| Public-good ethos | No engagement or trading-frequency optimization | Metric purity and manual review |
| Honest uncertainty | Simulations show assumptions; retrospective results are not forecasts | Required copy and guardrail tests |
| Autonomy | L1/L2 pauses remain skippable; L3 only enforces a prior explicit Pact | State-machine tests |

---

## 4. Features

| ID | Feature | Behavior | Priority |
|---|---|---|---|
| F1 | Money-Source Triage | Captures amount, source, horizon, runway, and borrowing break-even | P0 |
| F2 | Pre-Commitment Pact | Self-authored limits; tighten now, loosen later | P0 |
| F3 | Decision Journal | Reason, horizon, exit condition; text first, voice optional | P0 text / P1 voice |
| F4 | Explainable Pattern Detector | Revenge, overtrade, late-night, loss-hold, breach, source | P0 |
| F5 | Friction Ladder | L0 information, L1 breath, L2 reflection, L3 prior-Pact lock | P0 |
| F6 | Consequence Simulator | Recovery asymmetry, leverage, fee drag, illustrative cohort | P0 |
| F7 | Optional account and sync | Cross-device recovery, server-authoritative Pact, consent controls | P0 |
| F8 | Synthetic connected event | Demonstrates server verification, outbox, and generic push | P0 |
| F9 | Behavioral review | PHR, II, JC, RA, BRS, retrospective replay difference | P1 |
| F10 | Panic companion | One-tap guided pause and factual context | P1 |

---

## 5. User workflows

### 5.1 Onboarding

| Step | User | System |
|---|---|---|
| 1 | Chooses language | Stores locale locally |
| 2 | Reads privacy and limitations | Explains local data, optional sync, no advice, no order blocking |
| 3 | Chooses guest or sign-in | Guest continues immediately; sign-in uses Supabase Auth |
| 4 | Tries simulator | Runs locally with visible assumptions |
| 5 | Creates Pact | Persists locally and syncs if enabled |

### 5.2 Pre-decision check-in

| Step | User | System |
|---|---|---|
| 1 | Opens check-in | Loads effective local Pact and recent canonical history |
| 2 | Enters INR amount, source, and horizon | Computes triage locally |
| 3 | States reason and exit condition | Stores text locally; voice is optional |
| 4 | Submits | Detects signals and scores locally without waiting for network |
| 5 | Receives pause | Shows tier and explanation |
| 6 | Completes or skips reflection | Stores outcome and queues consented sync |
| 7 | Reconnects | Server validates, verifies, writes revision, and returns sync status |

### 5.3 Local CSV history

1. User selects a CSV or sample fixture.
2. A worker maps columns and rejects unknown sensitive fields.
3. Canonical trades are paired FIFO and stored locally.
4. Signals and the flagged timeline run locally.
5. The raw file is discarded and never uploaded by default.

### 5.4 Synthetic connected event

1. The demo sends a signed synthetic event to `POST /api/trade-events`.
2. The server validates and deduplicates it.
3. The server loads the authoritative Pact and recent consented history.
4. The shared engine produces a risk assessment.
5. Assessment, pause, and outbox event commit atomically.
6. The server wakes an Edge Function after commit; Supabase Cron retries any undispatched row.
7. The Edge Function sends a generic Web Push.
8. Opening the notification loads protected details and starts the PWA pause flow.

---

## 6. System requirements

The normative implementation is in `ARCHITECTURE.md`. Required characteristics are:

- Next.js App Router full-stack PWA.
- Supabase PostgreSQL, Auth, grants, and RLS.
- Dexie/IndexedDB local database and offline sync queue.
- Shared deterministic TypeScript engine on client and server.
- Next.js Route Handlers for API boundaries.
- Supabase Cron and Edge Functions for outbox delivery.
- Docker-backed local Supabase through the Supabase CLI.
- Vercel deployment for Next.js and managed Supabase in production.

---

## 7. Domain model

```ts
type Locale = 'en' | 'hi' | 'mr';
type FundSource = 'surplus' | 'savings' | 'emergency' | 'borrowed';
type Tier = 0 | 1 | 2 | 3;
type SignalKey =
  | 'revenge'
  | 'overtrade'
  | 'late_night'
  | 'loss_hold'
  | 'breach'
  | 'source';

interface Trade {
  id: string;
  ts: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: number;
  price: number;
  pnl?: number;
  holdSec?: number;
  source: 'csv' | 'synthetic' | 'connected';
}

interface Pact {
  id: string;
  dailyLossLimit: number;
  maxTradesPerDay: number;
  cooldownAfterLossMin: number;
  riskCapital: number;
  noTradeWindows: Array<{ start: string; end: string }>;
  lockOnBreach: boolean;
  loosenDelayHrs: number;
  pendingLoosen?: { patch: Partial<Pact>; effectiveAt: string };
  revision: number;
}

interface CheckIn {
  id: string;
  ts: string;
  amount: number;
  fundSource: FundSource;
  borrowKind?: 'instant_loan' | 'credit_card' | 'emi';
  horizonDays: number;
  reasonText?: string;
  exitCondition?: string;
  outcome?: 'proceeded' | 'paused_honoured' | 'abandoned' | 'skipped_pause';
}

interface SignalHit {
  key: SignalKey;
  weight: number;
  value: number;
  threshold: number;
  reasonKey: string;
}

interface RiskResult {
  raw: number;
  normalised: number;
  tier: Tier;
  tierFromScore: Tier;
  tierFromRules: Tier;
  hits: SignalHit[];
  explanation: {
    lines: Array<{
      key: SignalKey;
      contribution: number;
      i18nKey: string;
      params: Record<string, string | number>;
    }>;
    ruleOverrides: Array<{ rule: string; applied: boolean }>;
  };
}

interface PauseEvent {
  id: string;
  checkInId?: string;
  ts: string;
  tier: Tier;
  durationSec: number;
  honoured: boolean;
  lockStartedAt?: string;
  lockExpiresAt?: string;
  reason?: string;
}
```

Sync metadata is an infrastructure concern and is defined in `ARCHITECTURE.md` section 6.

---

## 8. Mathematical formulations

### 8.1 Loss-recovery asymmetry

For fractional loss `x` in `[0,1)`:

```text
g(x) = x / (1 - x)
```

Example: a 50% loss requires a 100% gain to return to the starting value.

### 8.2 Money-source triage

Source multiplier:

| Source | Multiplier |
|---|---:|
| Surplus | 0.0 |
| Regular savings | 0.4 |
| Emergency fund | 0.8 |
| Borrowed | 1.0 |

Emergency runway, with emergency fund `E`, monthly expenses `M`, and proposed amount `P`:

```text
runwayBefore = E / M
runwayWorst = (E - P) / M
```

Borrowing break-even over `T` years at user-entered annual rate `i`:

```text
rStar = (1 + i)^T - 1
```

Hard rules: borrowed implies at least L2; emergency funds imply at least L1.

### 8.3 Pattern signals

| Key | Default definition |
|---|---|
| `revenge` | New position within 15 minutes of a loss, size at least 1.5x, prior loss above configured minimum |
| `overtrade` | At least 8 trades in 30 minutes, or above personal baseline after enough history |
| `late_night` | Inside a Pact no-trade window or default 23:00-05:00 IST window |
| `loss_hold` | Median losing hold time divided by winning hold time at least 2, after enough closed trades |
| `breach` | Violates daily loss, trade count, cooldown, time window, or risk-capital rule |
| `source` | Derived from the current check-in's money source |

All thresholds are configurable in `src/config/defaults.ts`.

### 8.4 Risk score

```text
R = sum(weight[k] * signal[k])
Rhat = R / sum(weight[k])
```

Default weights:

| Signal | Weight |
|---|---:|
| revenge | 0.25 |
| breach | 0.25 |
| source | 0.25 |
| overtrade | 0.10 |
| late_night | 0.10 |
| loss_hold | 0.05 |

| Normalised score | Tier |
|---|---|
| below 0.25 | L0 |
| 0.25 to below 0.50 | L1 |
| 0.50 to below 0.75 | L2 |
| at least 0.75 | L3 |

Final tier is the maximum of the score tier and hard-rule tier.

### 8.5 Friction ladder

| Tier | Intervention | Skippable |
|---|---|---|
| L0 | Factual note and Pact reminder | Yes |
| L1 | 10-second breath and acknowledgement | Yes |
| L2 | 2-minute reflection with two answers | Yes; skip is logged |
| L3 | Explicit timed lock only if pre-committed | No until `lockExpiresAt` |

### 8.6 Consequence simulator

- Leverage wipe-out threshold: `-1 / L`.
- Fee drag after `n` round trips: `A[n] = P * (1 + r - f)^n`.
- Barrier approximation: `2 * Phi(-(1/L) / (sigma * sqrt(T)))`.
- Monte Carlo uses a seeded bootstrap of the selected historical window.
- The cohort view is an illustrative sensitivity simulation, never a personal forecast.

### 8.7 Pact compliance

A day adheres only if daily loss, trade count, blocked windows, cooldown, and risk-capital rules are all satisfied.

### 8.8 Retrospective replay difference

Replay history while omitting events that would have triggered tier L2 or above:

```text
replayDifference = replayPnL - actualPnL
```

The UI MUST call this a **retrospective replay difference**, not “loss avoided.” It may be positive or negative and does not establish causality.

### 8.9 Behavioral metrics

```text
PHR = honouredPauses / shownPauses
II  = tier2OrHigherEvents / evaluatedEvents
JC  = checkInsWithJournal / checkIns
RA  = adheredDays / evaluatedDays
BRS = 100 * (0.35*PHR + 0.25*RA + 0.20*(1-II) + 0.20*JC)
```

BRS excludes P&L, total trades, session time, and engagement frequency. Empty denominators return an explicitly defined neutral or unavailable state, never NaN.

---

## 9. Data, ingestion, and evaluation

### 9.1 CSV policy

Canonical fields are `timestamp`, `symbol`, `side`, `qty`, `price`, optional `pnl`, and optional `orderId`. Unknown columns are discarded before persistence. Warnings contain row numbers and codes, never raw cell content.

The parser accepts `File`/`Blob` chunks in a dedicated worker. It must not read the entire file into a server action or upload it.

### 9.2 Synthetic personas

Fixtures cover calm, revenge, overtrading, loss aversion, loan funded, and late-night behavior. They are seeded, committed, clearly labelled synthetic, and used in unit, demo, and evaluation flows.

### 9.3 Connected events

The MVP connected endpoint accepts synthetic events only. A real adapter requires a separate architecture/security review, explicit consent, documented retention, official API terms, and an updated limitation statement.

### 9.4 Evaluation

Run 500 synthetic traders per persona with assumed pause-compliance probabilities of 0.3, 0.5, and 0.7. Report changes in total loss and maximum drawdown as a sensitivity table. Label it synthetic and not evidence of real-world effect.

---

## 10. Privacy and security requirements

| Threat | Required mitigation |
|---|---|
| Cross-user access | Grants, RLS, owner/non-owner tests |
| Service credential exposure | Server-only modules and bundle secret scan |
| Data exfiltration | Endpoint allowlist, consent-purpose check, raw upload denial |
| Duplicate offline mutations | Client UUID, idempotency key, server unique constraint |
| Multi-device Pact bypass | Server-authoritative revision and stricter merge |
| Push information leak | Generic payload; fetch details after authenticated open |
| Sensitive logs | Structured IDs/codes only; payload redaction tests |
| CSV injection/PII | Allowlist, text rendering, no formula evaluation |
| Prompt injection | No LLM in MVP; user text is data only |
| Account loss/deletion | Export, revoke consent, delete cloud data, clear local data |

---

## 11. UX requirements

- Mobile-first at a 360x640 baseline.
- Tap targets at least 48x48 px.
- One primary action per screen.
- Check-in amount/source/horizon in at most three short steps.
- Base type 18 px with text-size options.
- Never use color alone.
- Respect reduced motion.
- Explain local mode, optional sync, and connection status calmly.
- Provide text fallback for every voice interaction.
- Show no raw risk detail in a push notification.
- Use calm, plain, non-judgmental copy: “your rule says” and “you told us,” not “you should.”

---

## 12. Demo journey

| Scene | Demonstrates |
|---|---|
| 1 | Ramesh and the behavioral problem |
| 2 | Marathi/ Hindi onboarding and privacy choice |
| 3 | Simulator with INR 10,000 and visible assumptions |
| 4 | Pact creation and delayed loosening |
| 5 | Local check-in funded by an instant loan |
| 6 | Explainable revenge/source/breach signals and L2 reflection |
| 7 | Offline outcome stored, then synced after reconnection |
| 8 | Signed synthetic event enters the Next.js API and produces an outbox event |
| 9 | Generic Web Push opens the protected pause flow |
| 10 | Review shows process metrics and retrospective replay caveats |
| 11 | Close with no-advice boundary, RLS, data controls, and integration limitation |

The demo must work without the network for the core journey. The connected-event segment may use the local Docker-backed Supabase environment or staging and must have a recorded fallback.

---

## 13. Task map

Detailed cards live in `TASKS.md`.

| Range | Workstream |
|---|---|
| T1-T2 | Next.js scaffold and shared contracts |
| T3-T9 | Parser, signals, score, triage, Pact, simulator |
| T10-T14 | Guardrails and core UI |
| T15-T22 | Metrics, voice, privacy, evaluation, quality |
| T23-T28 | PWA, CI, i18n, pitch, video, deployment |
| T29 | Supabase schema, migrations, grants, RLS, seed |
| T30 | Supabase Auth and guest-to-account flow |
| T31 | Route Handlers, offline sync, idempotency, conflict resolution |
| T32 | Synthetic event ingestion, outbox, Edge Function, Web Push |
| T33 | Dockerfile and local/CI environment verification |

---

## 14. Test strategy

- Engine unit and property tests.
- Component and accessibility tests in all locales.
- Architecture import-boundary tests.
- Route authentication, Zod, idempotency, and ownership tests.
- Supabase migrations, grants, constraints, and RLS allow/deny tests.
- Offline queue, reconnection, duplicate delivery, and conflict tests.
- Privacy tests for PII drop, raw-upload denial, consent gating, and log redaction.
- Playwright PWA tests for online, offline, update deferral, account sync, and synthetic event flow.
- Lighthouse, bundle, worker, and API performance checks.

---

## 15. Deployment

- Vercel deploys the Next.js PWA and Route Handlers.
- Managed Supabase provides PostgreSQL, Auth, RLS, Cron, and Edge Functions.
- Supabase migrations are reviewed and applied as a release step.
- Local backend development uses `supabase start`, which requires Docker.
- A multi-stage Dockerfile produces a standalone Next.js image for CI and portable deployment, but Vercel does not require that image.
- Production and preview environments use different Supabase projects and keys.

---

## 16. Definition of done

- [ ] Full core journey works offline after first successful load.
- [ ] Optional account sign-in and synchronization work without blocking guest mode.
- [ ] Every exposed user table has tested grants and RLS.
- [ ] Tightening and multi-device delayed loosening behave correctly.
- [ ] Raw CSV and audio do not leave the device by default.
- [ ] Synthetic connected event produces a verified assessment, outbox row, and generic push.
- [ ] No tips, predictions, order placement, broker promotion, or monetisation.
- [ ] Export, consent revocation, local delete, and cloud account delete work.
- [ ] CI, offline E2E, full-stack E2E, accessibility, and guardrail gates pass.
- [ ] Live URL, video, PPT, and recorded fallback are ready.
- [ ] The broker-blocking limitation and synthetic-data limitations are stated plainly.
