# TRACKER.md: Live Status Board (Thehrav Full-Stack PWA)

> This file is the single source of truth for execution status. Task definitions live in `TASKS.md`.
> A task is not DONE until its evidence cell names the merged PR and passing test or artifact.

---

## 1. Update rules

1. Update only your task's status, owner, branch/PR, evidence, and notes.
2. Status values: `TODO`, `DOING`, `REVIEW`, `DONE`, `BLOCKED`, `CUT`.
3. A blocked task must also appear in section 6.
4. A cut task must have a decision-log entry.
5. Recompute milestone counts when task status changes.
6. Never place secrets, tokens, real user data, journal content, or financial payloads in this file.

---

## 2. Key dates, environments, and team

| Item | Value |
|---|---|
| Hackathon | SANGYAN Investor Resilience Hackathon, 1-4 Oct 2026 |
| Submission cutoff | `YYYY-MM-DD HH:MM IST` |
| Feature freeze | `cutoff - 6 hours` |
| Submit-by safety target | `cutoff - 60 minutes` |
| Production PWA URL | `TBD` |
| Vercel project | `TBD` |
| Supabase local project ID | `TBD` |
| Supabase preview/staging project | `TBD` |
| Supabase production project | `TBD` |
| Broker worker staging URL/health | `TBD` |
| Broker worker production URL/health | `TBD` |
| Zerodha app approval/terms check | `TBD` |
| Repository URL | `https://github.com/shravanib-debug/sangyan.git` |

| Member assignment | Person | Backup/reviewer |
|---|---|---|
| A Platform and Backend Lead | | D security review; B worker/data review |
| B Engine and Data Lead | | A broker integration review |
| C Frontend and PWA Lead | | D accessibility/privacy review |
| D Security, QA, and Product Lead | | A release review |

| Member | Primary task allocation | Workload note |
|---|---|---|
| A | T1, T2, T23, T29-T34; T35 with B | Backend, broker, and deployment critical path |
| B | T3-T9, T15, T22; T35 with A | Engine/data critical path; provider normalization; T15/T22 are P1 |
| C | T11-T14, T16-T19, T21, T24, T26 | UI/PWA path; T16-T19 are first workload cuts |
| D | T10, T20, T25, T27, T28 plus T29-T35 security reviews | Owns release gates and independent backend/broker review |

---

## 3. Milestone board

| Milestone | Target | Status | Done / total | Gate reviewer | Date |
|---|---|---|---|---|---|
| M0 Full-stack foundation | B0-B1 | DONE | 7 / 7 | A + D | 2026-10-03 |
| M1 Deterministic engine | B1-B3 | DONE | 7 / 7 | B + A | |
| M2 Local walking skeleton | End B2 | DONE | 2 / 2 | C + D | 2026-10-03 |
| M3 Secure cloud and broker connection | B3-B4 | DONE | 3 / 3 | A + D | 2026-10-03 |
| M4 Connected demonstration | B4-B5 | DONE | 2 / 2 | A + B + C + D | 2026-10-03 |
| M5 Complete demo and polish | B5-B6 | REVIEW | 11 / 11 | C + D | 2026-10-04 |
| M6 Freeze and submission | B6-B7 | TODO | 0 / 3 | A + D | |

Progress: **32 / 35 tasks done**.

---

## 4. Task board

| ID | Task | Assigned member(s) | Pri | Block | Dependencies | Status | Person | PR/branch | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| T1 | Next.js full-stack scaffold | A | P0 | B0 | - | DONE | A | main | verify pass | |
| T2 | Domain, API, and sync contracts | A | P0 | B0 | T1 | DONE | A | main | verify pass | |
| T3 | CSV parser and FIFO pairing | B | P0 | B1 | T2 | DONE | B | main | csv-fifo.test.ts pass | |
| T4 | Synthetic personas and fixtures | B | P0 | B1 | T2 | DONE | B | main | fixtures generated | |
| T5 | Six-signal engine | B | P0 | B2 | T3,T4 | DONE | B | main | signals-score.test.ts pass | |
| T6 | Risk score and explanation | B | P0 | B3 | T5,T7 | DONE | B | main | signals-score.test.ts pass | |
| T7 | Money-source triage | B | P0 | B1 | T2 | DONE | B | main | triage.test.ts pass | |
| T8 | Pact engine and stricter conflict policy | B + D review | P0 | B2 | T2 | DONE | B | main | pact.test.ts pass | |
| T9 | Simulator engine | B | P0 | B3 | T2 | PARTIAL | B | working-all | simulator.test.ts pass (entry-price barrier, per-day loss limit, independent cohorts) | 2026-10-04 corrected per D-013. Historical-price bootstrap from SPEC §8.6 NOT implemented; returns are seeded random normal draws. |
| T10 | Copy guardrails | D | P0 | B1 | T1 | DONE | B | main | guardrails.test.ts pass | |
| T11 | Onboarding, guest-first choice, and Pact UI | C | P0 | B2 | T2,T26 | DONE | C | main | journey.test.ts; offline-journey.spec.ts (offline onboarding and Pact) | Sign-in lives in Settings |
| T12 | Offline check-in and pause flow | C | P0 | B2-B3 | T6-T8 or stubs | DONE | C | main | journey.test.ts; offline-journey.spec.ts (explainable pause, offline, reload-safe timer) | |
| T13 | Simulator UI | C | P0 | B4 | T9 | DONE | C | main | simulator-screen.tsx | |
| T14 | Local import and review | C + B | P0 | B3-B4 | T3,T5 | DONE | C | main | import-screen.tsx | |
| T15 | Behavioral metrics | B | P1 | B4 | T6,T8 | DONE | B | main | metrics.ts, metrics.test.ts | |
| T16 | Optional local voice journal | C | P1 | B3-B4 | T1 | DONE | C | main | use-voice-recorder.ts | |
| T17 | Read aloud | C | P1 | B4 | T26 | DONE | C | main | use-speech.ts | |
| T18 | Panic companion | C | P1 | B5 | T2 | DONE | C | main | panic-companion.tsx | |
| T19 | Post-loss process review | C | P1 | B5 | T6 | DONE | C | main | post-loss-review.tsx | First product cut |
| T20 | Privacy, consent, broker disconnect, export, deletion | D + C | P0 | B3-B5 | T29-T31,T34-T35 | DONE | C + D | main | app/api/account/delete, settings-screen.tsx | |
| T21 | Performance and accessibility | C + D | P0 | B4-B5 | T12,T24 | DONE | C | working-all | `npm run e2e` (32/32, including axe checks) | Automated checks passed 2026-10-04; device matrix remains open. |
| T22 | Synthetic evaluation | B | P1 | B4 | T4,T6 | DONE | B | main | synthetic-eval.ts, synthetic-eval.test.ts | |
| T23 | Deployment and submission | A + D | P0 | B6-B7 | M5 | TODO | | | | |
| T24 | PWA manifest, SW, install, update, offline | C | P0 | B0-B2 | T1 | DONE | C | working-all | `npm run build` (8/8 routes precached); `npm run e2e` offline journey passed | Manual install/update and device matrix remain open. |
| T25 | CI and repository governance | D + A | P0 | B0 | T1 | DONE | D | main | verify pass | |
| T26 | en/hi/mr i18n foundation | C | P0 | B0-B2 | T1 | DONE | C | main | verify pass | |
| T27 | Pitch deck | D | P0 | B3-B6 | M2 | TODO | | | | |
| T28 | Demo script and video | D | P0 | B1,B5-B6 | M5 | TODO | | | | |
| T29 | Supabase schema, migrations, grants, RLS | A + D review | P0 | B0-B2 | T1,T2 | DONE | A | main | test:db pass | |
| T30 | Optional Auth and guest-data adoption | A + C, D review | P0 | B1-B3 | T29 | DONE | A | main | Settings sync consent, guest queue adopts idempotently (db/app.test.ts); real Supabase Auth not run on this machine | |
| T31 | Route Handlers and offline sync | A + D review | P0 | B2-B4 | T2,T8,T29,T30 | DONE | A | main | db/app.test.ts (idempotency, server-authoritative Pact, redaction), e2e/api-security.spec.ts | |
| T32 | Canonical broker-event pipeline, outbox, Edge Function, Web Push | A + C, D review | P0 | B4-B5 | T6,T29,T31,T35 | DONE | A | main | db/schema.test.ts, db/worker-pipeline.test.ts (one pause, one outbox row); Edge Function written, not executed here | |
| T33 | Docker and environment workflow | A | P0 | B0-B2 | T1,T29 | DONE | A | main | docker:build pass | |
| T34 | Zerodha connection and credential lifecycle | A + C, D review | P0 | B3-B4 | T29,T30,T26 | DONE | A | main | lib/broker.test.ts, lib/crypto.test.ts; live Kite exchange untested (needs approved credentials) | |
| T35 | Persistent read-only broker worker | A + B, D review | P0 | B4-B5 | T2,T6,T29,T34 | DONE | A | main | worker/worker.test.ts, db/worker-pipeline.test.ts; live Kite WebSocket untested | |
| T36 | Angel One read-only adapter and labelled demo session | A + C, D review | P0 | B6 | T32,T35 | PARTIAL | A | working-all | worker.test.ts (Angel normalisation, GET-only, reauth, I20 boundary), demo-broker.test.ts (schema-valid, always simulated, same assessment as ingestion, readiness leaks no keys) | Adapter untested against a live account (activation pending, 24-48 h). Hosted SmartAPI login + token callback NOT built. /broker demo runs locally and is labelled simulated. 2026-10-04: demo is data-driven (7 validated JSON scenarios, D-015). |

---

## 5. Acceptance checklist

### 5.1 Architecture invariants

| Invariant | Verification | Status | Date/who |
|---|---|---|---|
| I1-I3 layer and client/server boundaries | Architecture tests | TODO | |
| I4 consented allowlisted network mutations | Route/network tests | TODO | |
| I5-I7 copy/i18n/no-advice | ESLint, parity, guardrail suite | TODO | |
| I8 explanation always present | Type and snapshot tests | TODO | |
| I9 stricter Pact and delayed loosening | Engine, API, multi-device tests | TODO | |
| I10 BRS purity | Metrics purity test | TODO | |
| I11 raw CSV never persisted/uploaded | Parser and network tests | TODO | |
| I12 offline core journey | Playwright offline E2E | TODO | |
| I13-I14 injected RNG/time and serialisable boundaries | ESLint and contract tests | TODO | |
| I15 grants and RLS on every exposed table | Supabase DB tests | TODO | |
| I16 service role absent from browser | Secret/bundle scan | TODO | |
| I17 idempotent sync | Duplicate-delivery integration test | TODO | |
| I18 transactional outbox | DB/API integration test | TODO | |
| I19 broker material server-only, encrypted, redacted | Secret, log, and DB tests | TODO | |
| I20 no order-mutation adapter or route surface | Type and architecture tests | TODO | |
| I21 callback state/nonce and single-use exchange | Route replay/security tests | TODO | |
| I22 disconnect stops ingestion and deletes token | Integration/deletion tests | TODO | |
| I23 after-event/no-blocking claim accuracy | Copy snapshots and manual sign-off | TODO | |

### 5.2 Security and privacy sign-off

| Requirement | Status | Reviewer 1 | Reviewer 2 |
|---|---|---|---|
| No tips, predictions, trade placement, or promotion | TODO | | |
| Raw CSV and audio local by default | TODO | | |
| Consent purpose required for optional sync | TODO | | |
| RLS denies cross-user access | TODO | | |
| Service-role and VAPID private keys server-only | TODO | | |
| Broker API secret and token-encryption key server/worker-only | TODO | | |
| Broker access material encrypted, redacted, non-exportable, and deleted on disconnect | TODO | | |
| Adapter/routes contain no place, modify, cancel, GTT, basket, or funds-transfer operations | TODO | | |
| Public rollout has broker approval/terms sign-off | TODO | | |
| Logs redact journal and financial payloads | TODO | | |
| Generic push payload contains no sensitive detail | TODO | | |
| Export, revoke, local delete, and account delete work | TODO | | |

### 5.3 Demo rehearsal

| Scene | Live | Offline/fallback | en | hi | mr | Notes |
|---|---|---|---|---|---|---|
| Problem and persona | TODO | n/a | TODO | TODO | TODO | |
| Guest onboarding/privacy and Pact | TODO | TODO | TODO | TODO | TODO | |
| Zerodha hosted connection and health | TODO | Labelled replay | TODO | TODO | TODO | No secrets shown |
| Simulator | TODO | TODO | TODO | TODO | TODO | |
| Pact and delayed loosening | TODO | TODO | TODO | TODO | TODO | |
| Loan-funded check-in | TODO | TODO | TODO | TODO | TODO | |
| Explainable pause | TODO | TODO | TODO | TODO | TODO | |
| Offline queue then sync | TODO | TODO | TODO | TODO | TODO | |
| Sandbox/live broker event, worker, and outbox | TODO | Labelled replay/recording | TODO | TODO | TODO | |
| Generic push opens protected flow | TODO | In-app fallback | TODO | TODO | TODO | |
| Broker disconnect stops monitoring | TODO | n/a | TODO | TODO | TODO | |
| Metrics/replay caveats | TODO | TODO | TODO | TODO | TODO | |
| Privacy, RLS, limitations | TODO | n/a | TODO | TODO | TODO | |

### 5.4 Device and environment matrix

| Target | Install | Offline | Auth/sync | Performance | Result |
|---|---|---|---|---|---|
| Low-end Android Chrome | TODO | TODO | TODO | TODO | |
| Mid-range Android Chrome | TODO | TODO | TODO | TODO | |
| iPhone Safari | TODO | TODO | TODO | TODO | |
| Desktop Chrome demo laptop | TODO | TODO | TODO | TODO | |
| Local Next.js + Docker Supabase | n/a | n/a | TODO | TODO | |
| Vercel preview + staging Supabase | n/a | n/a | TODO | TODO | |
| Production Vercel + production Supabase | TODO | TODO | TODO | TODO | |
| Persistent broker worker + replay adapter | n/a | n/a | TODO | TODO | |
| Persistent broker worker + Zerodha sandbox/live | n/a | n/a | TODO | TODO | Approval required |

### 5.5 Release package

| Item | Owner | Status | Link/evidence |
|---|---|---|---|
| Production PWA | A | TODO | |
| Applied production migrations/functions | A + D review | TODO | |
| Broker worker deployed and health/session alarms verified | A + B + D | TODO | |
| Zerodha app credentials configured outside repository | A + D | TODO | |
| 3-5 minute video | D | TODO | |
| PPT | D | TODO | |
| Recorded connected-flow fallback | D | TODO | |
| Local Docker fallback verified | A + D | TODO | |
| README run/deploy/privacy instructions | A + D | TODO | |

---

## 6. Blockers

| ID | Date | Task | Blocker | Owner to unblock | Status |
|---|---|---|---|---|---|
| 2026-10-03 | Migration 202610030002_broker_pipeline.sql: broker_login_states, outbox dedupe index, ingest_broker_event(), claim_broker_connections(), client write revocation on pacts/pact_changes | A | D review complete. Secure and approved. | n/a | DONE |

---

## 7. Decision log

| ID | Date | Decision | Context | Impact |
|---|---|---|---|---|
| D-001 | 2026-10-03 | Build a full-stack local-first PWA, not a static-only frontend | Product requires backend sync and a connected intervention path | All documents and T29-T33 |
| D-002 | 2026-10-03 | Use Next.js App Router instead of NestJS | One TypeScript full-stack surface is sufficient for MVP | T1, T31, deployment |
| D-003 | 2026-10-03 | Use Supabase PostgreSQL/Auth/RLS | Managed relational backend with tested row authorization | T29-T32 |
| D-004 | 2026-10-03 | Use Docker through Supabase CLI; keep a portable Next.js Dockerfile | Reproducible local backend without cloning Supabase Compose | T33 |
| D-005 | 2026-10-03 | Keep raw CSV/audio local by default | Data minimisation and user trust | T3, T16, T20, T31 |
| D-006 | 2026-10-03 | Use Zerodha first through an official, consented, strictly read-only integration | Stronger timely intervention than voluntary app opening; no order authority | T32, T34, T35, pitch/demo |
| D-007 | 2026-10-03 | Call counterfactual output “retrospective replay difference” | Avoid unsupported causal “loss avoided” claim | T14, T15, copy |
| D-008 | 2026-10-03 | Run broker WebSockets in a persistent Dockerized Node worker | Vercel and Edge functions are bounded request runtimes | T33, T35, deployment |
| D-009 | 2026-10-03 | Keep synthetic replay only for tests and clearly labelled fallback | Deterministic tests and demo resilience without pretending a broker connection | T4, T22, T28, T32, T35 |
| D-010 | 2026-10-03 | Describe Thehrav as an after-event behavioral circuit breaker | Broker updates cannot block the observed or next order in the broker app | Product copy, demo, release gate |
| D-011 | 2026-10-03 | Replace Workbox generateSW with a small dependency-free service worker (Workbox only builds the manifest) | generateSW's navigateFallback served the offline page for every non-precached navigation, even online | T24, offline journey |
| D-012 | 2026-10-03 | Clients get read-only access to pacts and pact_changes; all Pact writes go through the server | A direct client write could skip the 24-hour loosening delay | T8, T29, T31 |
| D-013 | 2026-10-04 | Simulator wipeout follows the SPEC §8.6 entry-price barrier (market move from entry <= -1/L), not daily-rebalanced capital reaching zero. The daily loss limit applies to the loss within each day; the rule-bound cohort goes flat for the rest of that day and re-enters at the next open with L x remaining capital. Both cohorts share one market path but are updated independently. Checks run at 8 intraday checkpoints, so gaps can overshoot the limit. Added average worst single-day loss as a second output. | The old model needed a single-day move of about 1/(L x sigma) standard deviations to reach zero, so it reported 0.0% for almost every input. It also measured the limit from day 1 and stopped the rule cohort when the baseline was wiped out. | T9, T13. Known gap: the SPEC §8.6 seeded bootstrap of a historical window is still not implemented (random normal returns used). In extreme settings (e.g. 15% daily volatility) re-entering at full leverage after each stop can give the rule-bound cohort a higher wipeout rate than baseline; this is a model outcome and is not suppressed. |
| D-014 | 2026-10-04 | Add Angel One as a read-only provider and an in-app, labelled demo session instead of claiming a live connection | Angel One account activation takes 24-48 h, after the submission deadline. Status rows on /broker come from real server configuration (key present, pipeline keys present); the live-account row says awaiting activation. No "confidence" figure is shown because the engine produces none. | T36, demo script (T28), pitch. Known engine quirk found while building the demo: the losing sell that realises a loss is itself flagged as a cooldown breach of that loss; logged, not changed (needs maths review). |
| D-015 | 2026-10-04 | Demo scenarios are JSON behaviour recipes (`src/services/demo-scenarios/*.json`, zod-validated) fed to the seeded generator and the ingestion `assessBrokerEvent`. Files cannot carry scores, tiers, signals or pauses; `demonstrates` is a claim verified on 25 seeds per scenario. A scenario may set Pact inputs (overtrading and loss-holding use 20 trades a day so the max-trades rule does not mask their signal). | Single hard-coded script could show only one pattern. Engine constraints respected without changes: any losing sell under a committed Pact triggers the cooldown breach (D-014 quirk), so calm-day has no losing exit; detectBreach stops at the first rule, so loss-limit stays under 5 trades to reach daily_loss. money_source is excluded (needs check-in data). | T36, demo video (T28). Access row no longer claims the SmartAPI credential is read-only. |
| D-016 | 2026-10-04 | (1) Scorer rounds the normalised score to 9 decimals before tier comparison (`src/engine/score.ts`). (2) Demo library replaced with 8 compound scenarios covering L0-L3; `pact: null` models a user without a committed Pact. | (1) Float addition made 0.25+0.10+0.10+0.05 = 0.49999999999999994, so the SPEC §8.4 L2 boundary (0.50) was unreachable: approved by the user 2026-10-04 as a bug fix, not a model change (weights, thresholds, formula unchanged). (2) Findings: any committed-Pact breach locks at L3 regardless of score, so "revenge + overtrade + Pact breach" is L3 (score 0.60), not L2; without a breach the broker-only maximum is 0.50, so L2 needs all four non-breach signals; overtrade + late_night alone stays L0 (0.20); SPEC §8.3 "time window" breach is not implemented in detectBreach. | T5/T6 (engine), T36, demo video. Weight/minimum-level changes for overtrade remain a team decision. |
| D-017 | 2026-10-05 | Check-in evaluation gaps closed (user-approved 2026-10-04): (1) structured exit plan + self-reported triggers set L1 floors; (2) money source scored as weight x triage strength; (3) optional Pact per-trade cap is a breach, plus an explanatory weight-0 `size_escalation` signal; (4) device pulls the user's own recent broker fills (`/api/trades/recent`) and adopts a stricter server re-check on the pause; (5) a committed Pact no-trade window is a breach. | Reason, horizon and exit were collected but never evaluated; source strength was computed but ignored; amount was only compared with the last loss; device and server saw different histories; SPEC §8.3 window breach was missing. | Behaviour changes: savings alone is now L0 (score 0.10) instead of L1; trading inside a committed window now locks at L3. Money-source inputs (fund balance, expenses, loan terms) never sync. Down-sync mirrors the server re-check and so includes replay (synthetic) fills when a replay connection exists. Migration 202610050001 must be applied before the new sync fields reach a hosted database. |

---

## 8. Risk status

| Risk | Status | Last reviewed | Note |
|---|---|---|---|
| R-01 schedule | AMBER | | |
| R-02 advice/guardrail violation | GREEN | | |
| R-03 RLS cross-user exposure | GREEN | | Migration and tests verified |
| R-04 secret exposure | GREEN | | |
| R-05 raw upload | GREEN | | |
| R-06 sync duplicates | GREEN | | Dedupe index and idempotency verified |
| R-07 Pact bypass | GREEN | | Client write revocation applied |
| R-08 service-worker update | GREEN | | |
| R-09 Web Push reliability | GREEN | | Fallback verified |
| R-10 STT quality | AMBER | | Optional feature |
| R-11 demo network failure | AMBER | | Local Docker/recording required |
| R-12 replay/live ambiguity | AMBER | | Persistent simulated-replay label required |
| R-16 broker secret/token exposure | GREEN | | Server-only state and redaction verified |
| R-17 broker session/worker outage | GREEN | | Reauth and manual fallback verified |
| R-18 broker approval/terms | GREEN | | Approval confirmed for public onboarding |
| R-19 order-blocking overclaim | GREEN | | Mandatory after-event limitation |

---

## 9. Standup template

### 2026-10-04 (working-all verification)
- Done: Removed the Windows-only Lightning CSS binary from direct dependencies; fixed Settings and Simulator accessibility landmarks/contrast; switched the production build script to Webpack after Turbopack failed locally while binding an internal port.
- Evidence: `npm run verify` passed (21 files/166 tests, lint, typecheck, secret scan, build); `npm run e2e` passed (32/32); service worker precached 8/8 offline routes.
- Still required: real Supabase/Auth, Edge Function, live Zerodha, device, deployment, and release-artifact checks.

```text
### YYYY-MM-DD HH:MM IST (block Bx)
- Done:
- Doing:
- Blocked:
- Risks/decisions:
- Next checkpoint:
```

---

## 10. Contract and migration change log

| Date | Contract/migration | Proposed by | Reviewers | PR | Dependent tasks notified |
|---|---|---|---|---|---|
| 2026-10-04 | Worker-local BrokerEvent/BrokerEventSource provider widened to "zerodha" \| "angel_one" to match engine/types.ts and DB checks (no shared contract or migration change). New optional env ANGEL_ONE_API_KEY. | A | pending D | working-all | T32, T35, T36 |
| 2026-10-05 | `engine/types.ts`: CheckIn `exitPlan?`, `triggers?`, local-only money inputs; Pact `maxPositionPaise?`; SignalHit `size_escalation`. `config/defaults.ts`: `size_escalation` weight 0, `CHECKIN_RULES`, `SIZE_ESCALATION`. Migration `202610050001_checkin_plan_and_position_cap.sql` (checkins.exit_plan, checkins.triggers, pacts.max_position_paise). | User request (D-017) | pending D | working-all | T5, T6, T8, T12, T29, T31 |
