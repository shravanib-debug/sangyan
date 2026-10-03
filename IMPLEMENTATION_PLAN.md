# IMPLEMENTATION_PLAN.md: Thehrav Delivery Plan

> This plan translates `SPEC.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `TASKS.md`, and `TRACKER.md` into an executable phase order.
> Product and security requirements remain normative in `SPEC.md` and `ARCHITECTURE.md`. Task status and evidence remain authoritative in `TRACKER.md`.

---

## 1. Team responsibilities

| Member | Role | Primary responsibility |
|---|---|---|
| Member A | Platform and Backend Lead | Next.js, Supabase, Auth, APIs, broker connection, Docker, deployment |
| Member B | Engine and Data Lead | Trade-data normalization, signals, scoring, Pact logic, simulation, metrics |
| Member C | Frontend and PWA Lead | Screens, offline support, PWA, service worker, i18n, accessibility |
| Member D | Security, QA, and Product Lead | Security review, RLS verification, privacy, CI, testing, pitch, and demo |

Member D independently reviews security-sensitive backend and broker work. Replace Member A-D with team names in `TRACKER.md` without changing ownership.

---

## 2. Phase overview and execution order

| Order | Phase | Lead | Supporting members | Tasks | Required outcome |
|---|---|---|---|---|---|
| 0 | Full-stack foundation | A | B, C, D | T1, T2, T24-T26, T29, T33 | Runnable, testable, installable, secure project foundation |
| 1 | Deterministic behavioral engine | B | A, D | T3-T10 | Tested, explainable domain engine with guardrails |
| 2 | Local offline user journey | C | B, D | T11, T12 | Complete guest journey that works offline |
| 3 | Secure cloud and Zerodha connection | A | C, D | T30, T31, T34 | Secure account, sync, broker login, token lifecycle, and disconnect |
| 4 | Live broker detection and intervention | A + B | C, D | T35, T32 | Broker event produces one explainable intervention and generic notification |
| 5 | Privacy, supporting features, and quality | C + D | A, B | T13-T22 | Safe, accessible, polished product with data controls |
| 6 | Deployment, demo, and submission | D; A for deployment | B, C | T23, T27, T28 | Verified production system and complete submission package |

Primary execution sequence:

```text
Phase 0: Foundation
    -> Phase 1: Deterministic engine
    -> Phase 2: Local offline journey
    -> Phase 3: Secure cloud and Zerodha connection
    -> Phase 4: Live broker intervention
    -> Phase 5: Privacy, supporting features, and polish
    -> Phase 6: Deployment, demo, and submission
```

Phase 1 and early Phase 2 may overlap through typed stubs. Phase 5 may begin after the local and cloud contracts stabilize while Phase 4 is being hardened. Phase 6 cannot pass its release gate until Phases 0-4 and every P0 security requirement are complete.

---

## 3. Phase 0: Full-stack foundation

**Phase lead:** Member A  
**Supporting members:** C and D; B reviews domain contracts  
**Tasks:** T1, T2, T24, T25, T26, T29, T33

### Internal order

1. **T1 - Next.js scaffold:** Member A.
2. **T2 - Domain, API, sync, and broker-event contracts:** Member A with Member B review.
3. After the T1/T2 interfaces stabilize, execute in parallel:
   - **T29 - Supabase schema, migrations, grants, and RLS:** A with D review.
   - **T33 - Docker and environment workflow:** A.
   - **T24 - PWA shell:** C.
   - **T26 - Internationalization foundation:** C.
   - **T25 - CI and repository governance:** D with A.

### Deliverables

- Next.js App Router, React 19, strict TypeScript, Tailwind CSS, pnpm, Vitest, and Playwright.
- Shared domain, API, sync, and canonical broker-event schemas.
- Local Supabase through Docker with initial migrations and RLS skeleton.
- Standalone Next.js and broker-worker Dockerfiles.
- Installable PWA shell with offline and update foundations.
- English, Hindi, and Marathi locale structure.
- CI, architecture checks, secret scanning, and repository governance.

### Exit gate

```powershell
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
supabase start
```

The PWA must install, local Supabase must start, migrations must apply, and no broker or platform secrets may exist in source control or the browser bundle.

Do not connect a live broker or add real broker credentials during Phase 0.

---

## 4. Phase 1: Deterministic behavioral engine

**Phase lead:** Member B  
**Supporting members:** A for contracts; D for guardrails  
**Tasks:** T3-T10

### Internal order

1. Execute in parallel:
   - **T3 - CSV parser and FIFO pairing:** B.
   - **T4 - Synthetic personas and fixtures:** B.
   - **T7 - Money-source triage:** B.
   - **T8 - Pact engine and stricter conflict policy:** B with D review.
   - **T9 - Simulator engine:** B.
   - **T10 - Copy guardrails:** D.
2. **T5 - Signal engine:** after T3 and T4.
3. **T6 - Risk score and explanation:** after T5 and T7.

### Deliverables

- Canonical trade model and deterministic fixtures.
- Revenge-trading, overtrading, late-night, loss-hold, breach, and money-source signals.
- Self-authored Pact limits with immediate tightening and delayed loosening.
- Explainable risk score, hard-rule overrides, and proportional friction tier.
- Consequence simulator and behavioral formulas.
- Automated no-advice, no-prediction, and safe-copy enforcement.

### Exit gate

- Engine unit, boundary, and property tests pass.
- Identical input, injected time, and seed produce identical output.
- Every assessment explains fired signals, values, thresholds, contributions, and overrides.
- The engine imports no React, Next.js, browser, database, network, or Supabase code.
- Synthetic fixtures are deterministic and visibly labelled.

---

## 5. Phase 2: Local offline user journey

**Phase lead:** Member C  
**Supporting members:** B for engine integration; D for UX and guardrail review  
**Tasks:** T11, T12

### Internal order

1. **T11 - Onboarding and Pact UI.**
2. **T12 - Check-in, journal, explanation, and cooling-off flow.**
3. Replace typed stubs with the completed engine from Phase 1.
4. Run the entire journey offline.

### Required journey

```text
Install PWA
-> choose language
-> understand privacy and limitations
-> create a personal Pact
-> declare money source
-> write reason and time horizon
-> receive an explainable assessment
-> complete the cooling-off pause
-> continue or abandon the decision
-> save the outcome locally
```

### Deliverables

- Guest-first onboarding and privacy explanation.
- Pact creation, tightening, and delayed-loosening states.
- Money-source check and short Decision Journal.
- Explainable pause screen and explicit outcome capture.
- Local persistence, service-worker update deferral, and offline behavior.

### Exit gate

The complete manual journey must work in airplane mode after the first successful application load. The user must never wait for the network to receive the local explanation or begin a pause.

---

## 6. Phase 3: Secure cloud and Zerodha connection

**Phase lead:** Member A  
**Supporting members:** C for connection UI; D for independent security review  
**Tasks:** T30, T31, T34

### Internal order

1. **T30 - Supabase Auth and guest-data adoption.**
2. After T30, execute in parallel:
   - **T31 - Route Handlers and offline synchronization.**
   - **T34 - Zerodha connection and credential lifecycle.**

### T34 scope

- Connect Zerodha action and purpose-specific consent.
- Redirect to Zerodha-hosted authentication.
- Signed, single-use callback state and exact redirect validation.
- Server-side request-token exchange.
- Authenticated encryption of short-lived access material.
- `live`, `reconnecting`, `stale`, `reauth_required`, and `disconnected` states.
- Daily reauthentication and explicit disconnect.
- Token deletion and monitoring shutdown after disconnect.

### Deliverables

- Optional Supabase account and authenticated session refresh.
- Idempotent guest-to-account adoption and offline synchronization.
- Server-authoritative Pact revision and stricter conflict resolution.
- Secure Zerodha connection, callback, status, reauthentication, and disconnect routes.
- Connection-consent and health UI with no credential fields.

### Exit gate

- Cross-user data access is denied by routes, grants, and RLS.
- Broker secrets and tokens never appear in the browser, logs, exports, fixtures, or API responses.
- Expired, reused, mismatched, and replayed callback state is rejected.
- Disconnect deletes access material and prevents further ingestion.
- No UI asks for a broker password, PIN, TOTP, API secret, request token, or access token.

---

## 7. Phase 4: Live broker detection and intervention

**Phase leads:** Members A and B  
**Supporting members:** C for notification flow; D for security verification  
**Tasks:** T35 followed by T32

### Internal order

1. **T35 - Persistent read-only broker worker.**
2. **T32 - Canonical broker-event pipeline, outbox, and Web Push.**

### T35 scope

- Persistent Dockerized Node.js process.
- Official Zerodha SDK behind a narrow `BrokerEventSource` adapter.
- Observation and reconciliation only; no trading authority.
- Connection leases and heartbeats.
- WebSocket reconnect with exponential backoff.
- REST reconciliation after disconnection.
- Canonical normalization and provider-ID/dedupe uniqueness.
- Session-expiry handling plus replay and sandbox adapters.

### T32 scope

- Accept authenticated canonical broker events.
- Load the authoritative Pact and recent consented history.
- Run the shared deterministic engine.
- Atomically store the event, assessment, pause, and outbox record.
- Dispatch a generic Web Push with an in-app fallback.
- Open protected explanation, journal, money-source, and cooling-off screens.

### Required connected flow

```text
Zerodha update
-> persistent read-only worker
-> normalized and deduplicated event
-> deterministic risk assessment
-> event + assessment + pause + outbox transaction
-> generic Web Push
-> authenticated explanation and journal
-> cooling-off decision
```

### Exit gate

A sandbox, approved live, or clearly labelled replay event must produce exactly one assessment, one pause, one outbox event, and one logical notification despite reconnects or retries.

The adapter, application routes, and UI must contain no place, modify, cancel, GTT, basket, or funds-transfer functionality. The product must state that broker updates arrive after activity and that Thehrav cannot block orders inside Zerodha.

---

## 8. Phase 5: Privacy, supporting features, and quality

**Phase leads:** Members C and D  
**Supporting members:** A for backend lifecycle; B for metrics and evaluation  
**Tasks:** T13-T22

### Priority order

1. **T20 - Privacy, consent, broker disconnect, export, and deletion:** D + C.
2. **T21 - Performance and accessibility:** C + D.
3. **T14 - Local import and review:** C + B.
4. **T13 - Simulator UI:** C.
5. **T15 - Behavioral metrics:** B.
6. **T22 - Synthetic evaluation:** B.
7. Optional P1 work, only if the P0 path is safe:
   - **T16 - Optional voice journal:** C.
   - **T17 - Read aloud:** C.
   - **T18 - Panic companion:** C.
   - **T19 - Post-loss process review:** C.

### Deliverables

- Consent management, broker disconnect, local/cloud export, and deletion.
- Accessible mobile UI, reduced motion, contrast, text scaling, and performance budgets.
- Local CSV import and retrospective review without raw-file upload.
- Consequence simulator UI and behavioral process metrics.
- Reproducible synthetic evaluation with explicit limitations.

### Cut order

If the schedule is at risk, cut work in this order:

1. T19 - Post-loss process review.
2. T18 - Panic companion.
3. T17 - Read aloud.
4. T16 - Voice transcription.
5. Advanced charts and dashboard polish.

Never cut privacy/deletion, RLS tests, broker-token security, the cooling-off flow, explanations, the no-order boundary, or honest limitation copy.

### Exit gate

- Consent revocation and broker disconnect stop new data collection.
- Local and cloud deletion work independently and together.
- Raw CSV and audio remain local by default.
- Accessibility, performance, privacy, guardrail, and target-device tests pass.
- P1 features do not weaken the P0 user journey or release safety.

---

## 9. Phase 6: Deployment, demo, and submission

**Phase lead:** Member D  
**Deployment lead:** Member A  
**Supporting members:** B and C  
**Tasks:** T23, T27, T28

### Internal order

1. **T27 - Pitch deck:** D begins early and finalizes after the connected flow stabilizes.
2. Run the complete regression, privacy, security, and claim-accuracy suites.
3. Freeze features; accept bug and release fixes only.
4. **T23 - Deployment and submission:** A + D.
5. Verify the production PWA, Supabase project, broker worker, session health, and outbox.
6. **T28 - Demo script and video:** D, with the whole team rehearsing.
7. Submit before the documented safety cutoff.

### Deployment structure

```text
Next.js PWA and Route Handlers -> Vercel
PostgreSQL, Auth, RLS, Cron, and Edge Functions -> Supabase
Persistent read-only Zerodha listener -> Container host
```

### Demo journey

```text
Install Thehrav
-> create a personal Pact
-> connect Zerodha through hosted login
-> receive a consented sandbox/live broker event
-> detect risky follow-up behavior
-> send a generic notification
-> open the protected explanation
-> declare emergency-fund or instant-loan use
-> record reasoning and time horizon
-> complete the cooling-off period
-> abandon the revenge trade
-> review the disciplined process
-> disconnect the broker and delete access material
```

### Final release gate

- Production PWA installs and the manual journey works offline.
- Zerodha connection health and session expiry are visible.
- The persistent broker worker is deployed and monitored.
- Duplicate events and retries produce one logical intervention.
- Push payloads contain no financial details.
- Disconnect removes broker access material and stops monitoring.
- No order-placement, modification, or cancellation surface exists.
- The after-event and no-blocking limitation is visible.
- Sandbox and replay activity is labelled accurately.
- Production URL, video, presentation, and recorded fallback are ready.

---

## 10. Cross-phase dependency map

```text
T1 -> T2 -> T29 -> T30 -> T34 -> T35 -> T32
             \-> T31 --------------------/

T2 -> T3 + T4 -> T5 -> T6 -> T12
 \-> T7 --------------/
 \-> T8 ---------------------> T31
 \-> T9 -> T13

T1 -> T24 + T26 -> T11 -> T12 -> T21
T29 + T31 + T34 + T35 -> T20
T6 + T8 -> T15
T4 + T6 -> T22

Completed P0 path -> T23 + T27 + T28 -> submission
```

---

## 11. Working and release rules

- UI work may begin with typed stubs, but a phase cannot pass its gate using unverified placeholder behavior.
- Use synthetic fixtures for source control and automated tests. Never commit or record real credentials or financial payloads.
- Use the official sandbox or an approved consenting test account for connected testing.
- A replay is always labelled simulated and never presented as live broker activity.
- Member D must independently approve RLS, broker-token, consent, deletion, and no-order-boundary changes.
- Update `TRACKER.md` whenever a task enters `DOING`, `REVIEW`, `DONE`, `BLOCKED`, or `CUT`.
- A task is `DONE` only when its code is merged and the tracker includes passing evidence.
- Do not proceed to public broker onboarding until the applicable broker approval and terms review are complete.

