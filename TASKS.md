# TASKS.md: Team Work Breakdown (Thehrav Full-Stack PWA)

> Status lives in `TRACKER.md`. Phase order lives in `IMPLEMENTATION_PLAN.md`. Product rules and maths live in `SPEC.md`. Interfaces and infrastructure rules live in `ARCHITECTURE.md`.
> Every completed task updates its `TRACKER.md` row with evidence.

---

## 1. Working rules

| Principle | Rule |
|---|---|
| Contract first | Land domain, sync, and API schemas before parallel implementation |
| Vertical slices | Integrate UI, local engine, API, and database early |
| Always shippable | `main` stays green; preview deployment is automatic |
| Migration discipline | Database changes are committed SQL migrations, never dashboard-only edits |
| Security as code | Grants, RLS, consent, idempotency, and redaction have tests |
| Local-first | Core flow never waits for network and guest mode remains complete |
| Guardrails everywhere | Product copy uses i18n keys and passes `lintCopy` |
| Safe broker data | Commit only synthetic fixtures; never record credentials or real financial payloads in source, tests, logs, screenshots, or demo artifacts |

Small PRs are preferred. Changes to shared contracts, migrations, RLS policies, or guardrail rules require two reviewers.

---

## 2. Four-member team and ownership

The team has four members. Names can replace the Member A-D placeholders in `TRACKER.md` without changing task ownership.

| Member | Mission | Primary ownership | Logical specialties combined |
|---|---|---|---|
| A Platform and Backend Lead | Next.js, API, Supabase, Auth, sync, broker connection lifecycle, Docker, deployment | root config, `app/api/**`, `src/lib/**`, `apps/broker-worker/**`, environment and release files | platform plus backend/broker runtime |
| B Engine and Data Lead | Parser, signals, scoring, triage, Pact, simulation, metrics, provider normalization | `src/engine/**`, broker event mapping, `tools/synth/**`, `fixtures/**` | engine plus canonical broker data |
| C Frontend and PWA Lead | Product screens, local services, service worker, i18n, voice, accessibility | `app/(pwa)/**`, `src/features/**`, `src/services/**`, `src/i18n/**`, `public/sw.js` | frontend plus PWA/UX |
| D Security, QA, and Product Lead | RLS/privacy, guardrails, CI/E2E, pitch, demo, release verification | `supabase/**` policy review, `src/guardrails/**`, `tests/**`, pitch artifacts | security/QA plus product/demo |

A implements backend paths while D independently reviews grants, RLS, consent, secrets, and negative tests. C owns the largest number of UI tasks, so P1 items T16-T19 are the first workload cuts if the P0 path is at risk.

| Member | Primary tasks | P0 / P1 primary load |
|---|---|---|
| A | T1, T2, T23, T29-T34; T35 with B | 10 P0 / 0 P1 |
| B | T3-T9, T15, T22; T35 with A | 8 P0 / 2 P1 |
| C | T11-T14, T16-T19, T21, T24, T26 | 7 P0 / 4 P1 |
| D | T10, T20, T25, T27, T28; security review on T8, T21, T23, T29-T35 | 5 P0 / 0 P1 plus review gates |

---

## 3. Collaboration protocol

### 3.1 Git and review

- Branch names: `feat/T31-sync`, `fix/T8-pact-conflict`, `chore/T33-docker`.
- Conventional Commits with task ID.
- Squash merge into protected `main`.
- Do not commit `.env*`, broker keys/tokens, token-encryption keys, Supabase service-role keys, VAPID private keys, or real user data.
- Database PRs include migration, rollback/forward-fix note, grants, RLS policies, and tests.
- UI PRs include screenshots in English and one regional language.

### 3.2 Contract change process

Contracts include:

- `src/engine/types.ts`
- `src/config/defaults.ts`
- Zod API/sync schemas
- database schema, grants, and RLS policies
- service-worker message protocol
- read-only broker adapter and canonical provider-event schemas
- public engine/service APIs

For a contract change:

1. Open a focused PR with minimal adapters.
2. Tag A, D, and every affected owner.
3. Add or update tests.
4. Record the decision and affected tasks in `TRACKER.md`.
5. Rebase dependent branches immediately after merge.

### 3.3 Per-task definition of done

A task is done only when code is merged, acceptance tests pass, no architecture/privacy/guardrail regression exists, documentation is current, and `TRACKER.md` contains evidence.

---

## 4. Task cards

### Foundation and platform

#### T1: Scaffold the Next.js full-stack application

**Owner:** A | **Priority:** P0 | **Block:** B0

- Create current stable Next.js App Router project with React 19, strict TypeScript, Tailwind CSS 4, pnpm, Vitest, Playwright, ESLint, and Prettier.
- Create route groups, `src` folders, environment schema, and scripts from `ARCHITECTURE.md`.
- Pin Node.js 24 LTS and package-manager versions.
- Acceptance: clean clone passes `pnpm dev`, `build`, `typecheck`, `lint`, and a smoke test.

#### T2: Domain, API, and sync contracts

**Owner:** A | **Priority:** P0 | **Block:** B0 | **Dependency:** T1

- Add canonical engine types, `Clock`, seeded RNG, config, Zod boundary schemas, sync metadata, and typed stubs.
- Worker/HTTP schemas pass primitive timestamps and seeds, not function-bearing objects.
- Acceptance: type tests pass; weights sum to 1; schemas reject unknown privileged fields.

#### T24: PWA shell

**Owner:** C | **Priority:** P0 | **Blocks:** B0-B2 | **Dependency:** T1

- Implement `app/manifest.ts`, icons, install prompt, offline banner, storage guard, custom Workbox service worker, prompted updates, and pause-aware reload deferral.
- Acceptance: production build installs; visited core routes work offline; update waits for an idle flow.

#### T25: CI and repository governance

**Owner:** D + A | **Priority:** P0 | **Block:** B0 | **Dependency:** T1

- Add CI for typecheck, lint, unit, architecture, guardrail, Supabase DB/RLS, API, sync, broker-contract, build, E2E, and Lighthouse.
- Add CODEOWNERS, PR template, broker-aware secret scan, dependency policy, and real-data fixture check.
- Acceptance: planted import, secret, dependency, and RLS-denial failures break CI.

#### T26: Internationalisation foundation

**Owner:** C | **Priority:** P0 | **Blocks:** B0-B2 | **Dependency:** T1

- Add en/hi/mr namespaces, parity tests, self-hosted fonts, INR/date formatting, and core-flow copy.
- Acceptance: runtime switching works, missing keys fail CI, and no external font request occurs.

#### T29: Supabase schema, migrations, grants, and RLS

**Owner:** A + D review | **Priority:** P0 | **Blocks:** B0-B2 | **Dependencies:** T1, T2

- Configure Supabase CLI and create migrations for profiles, devices, consents, broker connections, pacts, pact changes, check-ins, trade events, risk assessments, pauses, journals, push subscriptions, outbox, and audit events.
- Revoke broad defaults, grant only required operations, enable RLS, and add synthetic seed data.
- Acceptance: `supabase db reset` succeeds; anonymous/owner/non-owner/service tests prove intended allow and deny behavior for every exposed table.

#### T30: Optional Auth and guest-to-account flow

**Owner:** A + C, D review | **Priority:** P0 | **Blocks:** B1-B3 | **Dependencies:** T29

- Implement supported Supabase SSR auth client, login/logout, session refresh, guest mode, and explicit “enable sync” consent.
- Define guest-data adoption into an account using idempotent client IDs.
- Acceptance: core journey works signed out; signed-in sync session survives reload; another user cannot access adopted data.

#### T33: Docker and environment workflow

**Owner:** A | **Priority:** P0 | **Blocks:** B0-B2 | **Dependencies:** T1, T29

- Document Docker prerequisite for local Supabase; add `.dockerignore`, a multi-stage non-root Next.js Dockerfile, and `apps/broker-worker/Dockerfile`.
- Do not duplicate the Supabase stack in a hand-written Compose file.
- Acceptance: local `supabase start` works, Next.js connects to it, and both production images build and pass health smoke tests with the replay adapter.

### Deterministic engine

#### T3: CSV parser and FIFO pairing

**Owner:** B | **Priority:** P0 | **Block:** B1 | **Dependency:** T2

- Parse `File`/`Blob` chunks in the analytics worker, map aliases, allowlist canonical fields, normalize IST timestamps, merge fills, and pair FIFO.
- Acceptance: partial fills, shorts, flips, BOM/CRLF, duplicate IDs, and PII-drop tests pass; raw files are never persisted or uploaded.

#### T4: Synthetic personas and fixtures

**Owner:** B | **Priority:** P0 | **Block:** B1 | **Dependency:** T2

- Generate seeded calm, revenge, overtrader, loss-averse, loan-funded, and late-night fixtures.
- Acceptance: regeneration is deterministic and every fixture is visibly labelled synthetic.

#### T5: Signal engine

**Owner:** B | **Priority:** P0 | **Block:** B2 | **Dependencies:** T3, T4

- Implement revenge, overtrade, late-night, loss-hold, breach, and source signals using config thresholds.
- Acceptance: threshold-boundary and persona-dominance tests pass; no direct clock or random calls.

#### T6: Risk score and explanation

**Owner:** B | **Priority:** P0 | **Block:** B3 | **Dependencies:** T5, T7

- Implement weighted score, tier cutoffs, hard-rule override, and contribution explanation.
- Acceptance: monotonicity, borrowed/emergency override, zero-hit, and explanation snapshot tests pass.

#### T7: Money-source triage

**Owner:** B | **Priority:** P0 | **Block:** B1 | **Dependency:** T2

- Implement source multiplier, emergency runway, and user-rate borrowing break-even.
- Acceptance: zero expense, amount above fund, short horizon, and invalid input cases pass without advice wording.

#### T8: Pact engine and conflict policy

**Owner:** B + D review | **Priority:** P0 | **Block:** B2 | **Dependency:** T2

- Implement validation, tighter/looser classification, delayed loosening, adherence, and field-by-field stricter merge.
- Acceptance: fake-clock and multi-device conflict tests prove tightening now and server-authoritative loosening later.

#### T9: Simulator engine

**Owner:** B | **Priority:** P0 | **Block:** B3 | **Dependency:** T2

- Implement recovery, leverage threshold, fee drag, barrier approximation, seeded Monte Carlo, and illustrative cohort.
- Acceptance: hand-calculated and deterministic tests pass; worker performance meets the agreed device budget.

### Guardrails, privacy, and backend behavior

#### T10: Copy guardrails

**Owner:** D | **Priority:** P0 | **Block:** B1 | **Dependency:** T1

- Implement locale denylists, refusal rules, `safeText`, disclaimers, and a planted-violation CI test.
- Acceptance: advice/prediction wording fails; neutral typed data labels pass.

#### T20: Privacy, consent, export, and deletion

**Owner:** D + C | **Priority:** P0 | **Blocks:** B3-B5 | **Dependencies:** T29-T31, T34-T35

- Add data classification, raw-upload denial, log/token redaction, CSP, consent grant/revoke, broker disconnect, combined export, local delete, and cloud account delete.
- Acceptance: CSV/audio do not leave the device by default; revocation stops sync and broker monitoring; disconnect deletes access material; account delete removes cloud rows, subscriptions, local DB, and session.

#### T31: Route Handlers and offline synchronization

**Owner:** A + D review | **Priority:** P0 | **Blocks:** B2-B4 | **Dependencies:** T2, T8, T29, T30

- Implement authenticated Route Handlers, Zod validation, local sync queue, idempotency keys, unique constraints, revisions, retries, and stricter-Pact conflict resolution.
- Re-run or verify risk assessments on the server; never trust a client-supplied final tier.
- Acceptance: offline create/reconnect, duplicate delivery, expired session, non-owner request, and two-device Pact tests pass.

#### T32: Canonical broker-event pipeline, outbox, and Web Push

**Owner:** A + C, D review | **Priority:** P0 | **Blocks:** B4-B5 | **Dependencies:** T6, T29, T31, T35

- Implement authenticated canonical broker-event ingestion, deduplication, server engine execution, transactional event/assessment/pause/outbox write, Edge Function dispatch, Cron retry, VAPID registration, generic push payload, and in-app fallback inbox.
- Acceptance: one broker/replay event produces one assessment and one logical notification despite retries; payload contains no amount, symbol, source, or journal text; replay mode is visibly labelled simulated.

#### T34: Zerodha connection and credential lifecycle

**Owner:** A + C, D review | **Priority:** P0 | **Blocks:** B3-B4 | **Dependencies:** T29, T30, T26

- Implement connect, callback, status, daily reauthentication, and disconnect routes plus the consent/connection-health UI using Zerodha-hosted login, signed single-use state, exact redirects, and server-side request-token exchange.
- Encrypt access material before database persistence; expose only provider/health/expiry to the client; redact secrets and tokens from logs and errors.
- Acceptance: success, denial, expired/replayed state, callback replay, wrong user, expiry, disconnect, key rotation, and log-redaction tests pass. No UI ever asks for a broker password, PIN, TOTP, API secret, or token.

#### T35: Persistent read-only broker worker

**Owner:** A + B, D review | **Priority:** P0 | **Blocks:** B4-B5 | **Dependencies:** T2, T6, T29, T34

- Build a Dockerized Node worker with a narrow `BrokerEventSource` interface and Zerodha adapter. The interface may observe orders/trades and reconcile history but must contain no place, modify, cancel, GTT, basket, or funds-transfer method.
- Add connection leasing, heartbeats, WebSocket reconnect/backoff, REST reconciliation, event normalization, provider-ID/dedupe uniqueness, session-expiry handling, and replay/sandbox adapters.
- Acceptance: architecture tests prove no order-mutation surface; reconnect gaps and duplicates are handled; disconnect/expiry stops ingestion; stale health reaches the PWA; worker failure never claims live protection.

### Product UI

#### T11: Onboarding and Pact UI

**Owner:** C | **Priority:** P0 | **Block:** B2 | **Dependencies:** T2, T26

- Build language, privacy/limitation, guest-first choice, Pact editor, pending-loosen countdown, and sync status. Integrate the optional sign-in action when T30 lands without blocking the local skeleton.
- Acceptance: guest path is immediate; core steps use large targets; tightening and pending loosening are visually distinct.

#### T12: Check-in and pause flow

**Owner:** C | **Priority:** P0 | **Blocks:** B2-B3 | **Dependencies:** typed stubs, then T6-T8

- Implement money source, amount, horizon, reason, local evaluation, explanation, friction ladder, explicit L3 lock expiry, and outcome persistence.
- Acceptance: complete flow works offline; explanation is always present; service-worker updates defer while active.

#### T13: Simulator UI

**Owner:** C | **Priority:** P0 | **Block:** B4 | **Dependency:** T9

- Build INR amount, leverage, assumptions, recovery table, and reduced-motion cohort view.
- Acceptance: worker does not block UI; assumptions and non-prediction copy remain visible.

#### T14: Import and review

**Owner:** C + B | **Priority:** P0 | **Blocks:** B3-B4 | **Dependencies:** T3, T5

- Build local file mapping, dropped-column notice, progress, flagged timeline, and retrospective replay difference.
- Acceptance: works offline, never shows raw rejected cells, and never labels the replay as “loss avoided.”

#### T18: Panic companion

**Owner:** C | **Priority:** P1 | **Block:** B5 | **Dependency:** T2

- One-tap guided pause with factual historical context and no prediction.

#### T19: Post-loss process review

**Owner:** C | **Priority:** P1 | **Block:** B5 | **Dependency:** T6

- Show fired signals and process reflection without grading the trade outcome.

### Metrics, voice, and quality

#### T15: Behavioral metrics

**Owner:** B | **Priority:** P1 | **Block:** B4 | **Dependencies:** T6, T8

- Implement PHR, II, JC, RA, BRS, and retrospective replay difference.
- Acceptance: bounded/empty-state tests pass; BRS ignores P&L, trade count, session time, and engagement.

#### T16: Optional voice journal

**Owner:** C | **Priority:** P1 | **Blocks:** B3-B4 | **Dependency:** T1

- Add 20-second recording, explicit model download consent, on-device transcription if capable, transcript editor, and text fallback.
- Acceptance: raw audio remains local; go/no-go is based on real target-device tests.

#### T17: Read aloud

**Owner:** C | **Priority:** P1 | **Block:** B4 | **Dependency:** T26

- Add locale-aware speech synthesis with silent text fallback.

#### T21: Performance and accessibility

**Owner:** C + D | **Priority:** P0 | **Blocks:** B4-B5 | **Dependencies:** T12, T24

- Enforce bundle/Lighthouse/worker budgets, axe tests, reduced motion, high contrast, text scaling, and target-device checks.

#### T22: Synthetic evaluation

**Owner:** B | **Priority:** P1 | **Block:** B4 | **Dependencies:** T4, T6

- Run the reproducible sensitivity analysis defined in `SPEC.md` and label it as synthetic, not causal evidence.

### Release and story

#### T27: Pitch deck

**Owner:** D | **Priority:** P0 | **Blocks:** B3-B6 | **Dependency:** B

- Cover problem, target user, USP, local-first architecture, read-only Zerodha flow, persistent worker, guardrails, RLS/privacy, metrics, and the after-event/no-blocking limitation.

#### T28: Demo script and video

**Owner:** D | **Priority:** P0 | **Blocks:** B1, B5-B6 | **Dependency:** M5

- Produce a 3-5 minute captioned demo covering broker-hosted connection, live/sandbox event, push-to-pause flow, offline/manual path, disconnect, and a clearly labelled recorded replay fallback.

#### T23: Deployment and submission

**Owner:** A + D | **Priority:** P0 | **Blocks:** B6-B7 | **Dependency:** M5

- Freeze code, apply reviewed Supabase migrations/functions, deploy Next.js to Vercel and the broker worker to a persistent container host, verify secret/environment isolation and session health, smoke-test production, and submit artifacts before the safety buffer.

---

## 5. Milestone membership

| Milestone | Tasks |
|---|---|
| M0 | T1, T2, T24, T25, T26, T29, T33 |
| M1 | T3-T9 |
| M2 | T11, T12 |
| M3 | T30, T31, T34 |
| M4 | T32, T35 |
| M5 | T10, T13-T22 |
| M6 | T23, T27, T28 |

---

## 6. Required verification before a PR

| Member | Minimum verification |
|---|---|
| All | Typecheck, lint, affected tests, no secrets or real data, tracker updated |
| A | Server/client boundary, environment schema, build, API integration, deployability |
| B | Boundary/property tests and deterministic fixtures |
| C | Offline behavior, locale screenshots, loading/error/sync states, service worker, accessibility |
| D | Grants/RLS, authorization, consent, privacy, guardrails, negative tests, and claim accuracy |
