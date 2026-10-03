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
| Repository URL | `TBD` |

| Member assignment | Person | Backup/reviewer |
|---|---|---|
| A Platform and Backend Lead | | D security review |
| B Engine and Data Lead | | A integration review |
| C Frontend and PWA Lead | | D accessibility/privacy review |
| D Security, QA, and Product Lead | | A release review |

| Member | Primary task allocation | Workload note |
|---|---|---|
| A | T1, T2, T23, T29-T33 | Backend critical path and deployment |
| B | T3-T9, T15, T22 | Engine critical path; T15/T22 are P1 |
| C | T11-T14, T16-T19, T21, T24, T26 | UI/PWA path; T16-T19 are first workload cuts |
| D | T10, T20, T25, T27, T28 plus security reviews | Owns release gates and independent backend review |

---

## 3. Milestone board

| Milestone | Target | Status | Done / total | Gate reviewer | Date |
|---|---|---|---|---|---|
| M0 Full-stack foundation | B0-B1 | TODO | 0 / 7 | A + D | |
| M1 Deterministic engine | B1-B3 | TODO | 0 / 7 | B + A | |
| M2 Local walking skeleton | End B2 | TODO | 0 / 2 | C + D | |
| M3 Secure cloud path | B3-B4 | TODO | 0 / 2 | A + D | |
| M4 Connected demonstration | B4-B5 | TODO | 0 / 1 | A + C + D | |
| M5 Complete demo and polish | B5-B6 | TODO | 0 / 11 | C + D | |
| M6 Freeze and submission | B6-B7 | TODO | 0 / 3 | A + D | |

Progress: **0 / 33 tasks done**.

---

## 4. Task board

| ID | Task | Assigned member(s) | Pri | Block | Dependencies | Status | Person | PR/branch | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| T1 | Next.js full-stack scaffold | A | P0 | B0 | - | TODO | | | | |
| T2 | Domain, API, and sync contracts | A | P0 | B0 | T1 | TODO | | | | |
| T3 | CSV parser and FIFO pairing | B | P0 | B1 | T2 | TODO | | | | |
| T4 | Synthetic personas and fixtures | B | P0 | B1 | T2 | TODO | | | | |
| T5 | Six-signal engine | B | P0 | B2 | T3,T4 | TODO | | | | |
| T6 | Risk score and explanation | B | P0 | B3 | T5,T7 | TODO | | | | |
| T7 | Money-source triage | B | P0 | B1 | T2 | TODO | | | | |
| T8 | Pact engine and stricter conflict policy | B + D review | P0 | B2 | T2 | TODO | | | | |
| T9 | Simulator engine | B | P0 | B3 | T2 | TODO | | | | |
| T10 | Copy guardrails | D | P0 | B1 | T1 | TODO | | | | |
| T11 | Onboarding, guest-first choice, and Pact UI | C | P0 | B2 | T2,T26 | TODO | | | | Integrate sign-in when T30 lands |
| T12 | Offline check-in and pause flow | C | P0 | B2-B3 | T6-T8 or stubs | TODO | | | | |
| T13 | Simulator UI | C | P0 | B4 | T9 | TODO | | | | |
| T14 | Local import and review | C + B | P0 | B3-B4 | T3,T5 | TODO | | | | |
| T15 | Behavioral metrics | B | P1 | B4 | T6,T8 | TODO | | | | |
| T16 | Optional local voice journal | C | P1 | B3-B4 | T1 | TODO | | | | Go/no-go at end B3 |
| T17 | Read aloud | C | P1 | B4 | T26 | TODO | | | | |
| T18 | Panic companion | C | P1 | B5 | T2 | TODO | | | | |
| T19 | Post-loss process review | C | P1 | B5 | T6 | TODO | | | | First product cut |
| T20 | Privacy, consent, export, deletion | D + C | P0 | B3-B5 | T29-T31 | TODO | | | | |
| T21 | Performance and accessibility | C + D | P0 | B4-B5 | T12,T24 | TODO | | | | |
| T22 | Synthetic evaluation | B | P1 | B4 | T4,T6 | TODO | | | | |
| T23 | Deployment and submission | A + D | P0 | B6-B7 | M5 | TODO | | | | |
| T24 | PWA manifest, SW, install, update, offline | C | P0 | B0-B2 | T1 | TODO | | | | |
| T25 | CI and repository governance | D + A | P0 | B0 | T1 | TODO | | | | |
| T26 | en/hi/mr i18n foundation | C | P0 | B0-B2 | T1 | TODO | | | | |
| T27 | Pitch deck | D | P0 | B3-B6 | M2 | TODO | | | | |
| T28 | Demo script and video | D | P0 | B1,B5-B6 | M5 | TODO | | | | |
| T29 | Supabase schema, migrations, grants, RLS | A + D review | P0 | B0-B2 | T1,T2 | TODO | | | | |
| T30 | Optional Auth and guest-data adoption | A + C, D review | P0 | B1-B3 | T29 | TODO | | | | |
| T31 | Route Handlers and offline sync | A + D review | P0 | B2-B4 | T2,T8,T29,T30 | TODO | | | | |
| T32 | Synthetic event, outbox, Edge Function, Web Push | A + C, D review | P0 | B4-B5 | T6,T29,T31 | TODO | | | | Simulated source only |
| T33 | Docker and environment workflow | A | P0 | B0-B2 | T1,T29 | TODO | | | | |

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

### 5.2 Security and privacy sign-off

| Requirement | Status | Reviewer 1 | Reviewer 2 |
|---|---|---|---|
| No tips, predictions, trade placement, or promotion | TODO | | |
| Raw CSV and audio local by default | TODO | | |
| Consent purpose required for optional sync | TODO | | |
| RLS denies cross-user access | TODO | | |
| Service-role and VAPID private keys server-only | TODO | | |
| Logs redact journal and financial payloads | TODO | | |
| Generic push payload contains no sensitive detail | TODO | | |
| Export, revoke, local delete, and account delete work | TODO | | |

### 5.3 Demo rehearsal

| Scene | Live | Offline/fallback | en | hi | mr | Notes |
|---|---|---|---|---|---|---|
| Problem and persona | TODO | n/a | TODO | TODO | TODO | |
| Guest onboarding/privacy | TODO | TODO | TODO | TODO | TODO | |
| Simulator | TODO | TODO | TODO | TODO | TODO | |
| Pact and delayed loosening | TODO | TODO | TODO | TODO | TODO | |
| Loan-funded check-in | TODO | TODO | TODO | TODO | TODO | |
| Explainable pause | TODO | TODO | TODO | TODO | TODO | |
| Offline queue then sync | TODO | TODO | TODO | TODO | TODO | |
| Synthetic event and outbox | TODO | Recorded/local fallback | TODO | TODO | TODO | |
| Generic push opens protected flow | TODO | In-app fallback | TODO | TODO | TODO | |
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

### 5.5 Release package

| Item | Owner | Status | Link/evidence |
|---|---|---|---|
| Production PWA | A | TODO | |
| Applied production migrations/functions | A + D review | TODO | |
| 3-5 minute video | D | TODO | |
| PPT | D | TODO | |
| Recorded connected-flow fallback | D | TODO | |
| Local Docker fallback verified | A + D | TODO | |
| README run/deploy/privacy instructions | A + D | TODO | |

---

## 6. Blockers

| ID | Date | Task | Blocker | Owner to unblock | Status |
|---|---|---|---|---|---|
| | | | | | |

---

## 7. Decision log

| ID | Date | Decision | Context | Impact |
|---|---|---|---|---|
| D-001 | 2026-10-03 | Build a full-stack local-first PWA, not a static-only frontend | Product requires backend sync and a connected intervention path | All documents and T29-T33 |
| D-002 | 2026-10-03 | Use Next.js App Router instead of NestJS | One TypeScript full-stack surface is sufficient for MVP | T1, T31, deployment |
| D-003 | 2026-10-03 | Use Supabase PostgreSQL/Auth/RLS | Managed relational backend with tested row authorization | T29-T32 |
| D-004 | 2026-10-03 | Use Docker through Supabase CLI; keep a portable Next.js Dockerfile | Reproducible local backend without cloning Supabase Compose | T33 |
| D-005 | 2026-10-03 | Keep raw CSV/audio local by default | Data minimisation and user trust | T3, T16, T20, T31 |
| D-006 | 2026-10-03 | Demonstrate connected detection with a labelled synthetic event | No approved live broker integration in MVP | T32, pitch/demo |
| D-007 | 2026-10-03 | Call counterfactual output “retrospective replay difference” | Avoid unsupported causal “loss avoided” claim | T14, T15, copy |

---

## 8. Risk status

| Risk | Status | Last reviewed | Note |
|---|---|---|---|
| R-01 schedule | AMBER | | |
| R-02 advice/guardrail violation | GREEN | | |
| R-03 RLS cross-user exposure | AMBER | | Awaiting T29 tests |
| R-04 secret exposure | GREEN | | |
| R-05 raw upload | GREEN | | |
| R-06 sync duplicates | AMBER | | Awaiting T31 |
| R-07 Pact bypass | AMBER | | Awaiting T8/T31 |
| R-08 service-worker update | GREEN | | |
| R-09 Web Push reliability | AMBER | | Fallback required |
| R-10 STT quality | AMBER | | Optional feature |
| R-11 demo network failure | AMBER | | Local Docker/recording required |
| R-12 synthetic-event ambiguity | GREEN | | Label mandated |

---

## 9. Standup template

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
| | | | | | |
