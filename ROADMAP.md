# ROADMAP.md: Thehrav Full-Stack PWA

> Companion to `SPEC.md`, `ARCHITECTURE.md`, `TASKS.md`, and `TRACKER.md`.
> Task IDs T1-T35 are identical across the planning documents.

---

## 1. Timeline and delivery rule

| Fact | Value |
|---|---|
| Hackathon sprint | 1-4 Oct 2026 |
| Roadmap baseline | 3 Oct 2026 |
| Planning unit | B0-B7 time blocks relative to the confirmed cutoff |
| Required submission | Live PWA, 3-5 minute video, PPT, one complete journey |
| Architecture | Next.js PWA + Supabase + local-first engine + persistent read-only broker worker |

Confirm the exact submission cutoff and record it in `TRACKER.md` before assigning clock times.

The walking skeleton must exist by the end of B2. After B2, work improves a functioning vertical slice; it does not postpone integration until the end.

---

## 2. Milestones

| ID | Milestone | Exit criteria | Target |
|---|---|---|---|
| M0 | Full-stack foundation | Next.js scaffold, local Supabase through Docker, migrations, RLS skeleton, CI, contracts, i18n, installable shell | B0-B1 |
| M1 | Deterministic engine | Parser, fixtures, signals, score, triage, Pact, and simulator tests pass | B1-B3 |
| M2 | Local walking skeleton | Onboarding -> Pact -> check-in -> explanation -> pause -> result persists and works offline | End B2 |
| M3 | Secure cloud and broker connection | Auth, RLS, sync, Zerodha hosted login, encrypted token lifecycle, and disconnect pass tests | B3-B4 |
| M4 | Connected demonstration | Read-only sandbox/live broker event -> persistent worker -> verification -> outbox -> generic Web Push -> protected PWA pause | B4-B5 |
| M5 | Complete demo and polish | Simulator, import/review, two languages, accessibility, privacy, export/delete, online/offline demo | B5-B6 |
| M6 | Freeze and submission | Production/staging verified, migrations applied, backup recorded, deck/video complete | B6-B7 |

---

## 3. Time blocks and parallel workstreams

Each block is approximately 3-4 working hours. B7 ends at least 60 minutes before the submission cutoff.

| Block | Lead/platform | Engine | Product UI | PWA/i18n | Backend/data | QA/privacy | Story |
|---|---|---|---|---|---|---|---|
| B0 | T1 Next.js scaffold, T2 contracts | Read SPEC sections 7-9 | Route shell and primitives | T24 manifest/SW shell, T26 locales | T29 local Supabase/migration/RLS skeleton, T33 Docker | T25 CI scaffolds | Confirm cutoff, deck skeleton |
| B1 | Integrate contracts | T3 parse, T4 fixtures, T7 triage | Home/onboarding shells | Locale extraction | T30 Auth guest/account flow | T10 guardrail linter, DB deny-test scaffolds | Demo script v1 |
| B2 | M2 integration | T5 signals, T8 Pact | T11 Pact UI, T12 check-in/pause | Offline/update flow | T31 sync stubs; T34 login contract | Architecture/offline/privacy tests | Review local journey |
| B3 | Resolve contracts | T6 score, T9 simulator; T35 normalization | Finish T12, start T14 | T16 voice go/no-go | T31 routes; T34 token lifecycle; T35 worker skeleton | T20 privacy, broker-secret, and RLS tests | Deck v1 |
| B4 | M3 gate | T15 metrics, T22 evaluation; T35 reconnect/dedupe | T13 simulator, finish T14 | T17 TTS, translations | T32 event/outbox/push; deploy worker staging | API/sync/broker/full-stack E2E | Screenshots and video script |
| B5 | M4/M5 gate | Bug fixes | T18/T19 only if safe | Native review, performance | Hardening and push fallback | Accessibility, online/offline regression | Rehearse full demo |
| B6 | Feature freeze | Bug fixes only | Bug fixes only | Bug fixes only | Apply staging/production migrations | Final regression and security checklist | Record video, finalize deck |
| B7 | Release | On call | On call | On call | Verify worker/session/outbox | Smoke tests | Submit with safety buffer |

Contract-first parallelism remains mandatory. UI uses typed stubs until engine and API implementations land.

---

## 4. Critical path and cut lines

Critical path:

```text
T1 -> T2 -> T29 -> T30 -> T31
T2 -> T3/T7/T8 -> T5 -> T6 -> T12
T29 + T30 -> T34 -> T35
T31 + T6 + T35 -> T32 -> full-stack demo -> freeze -> submission
```

| Cut | Trigger | Cut in order | Never cut |
|---|---|---|---|
| Cut 1 | Local skeleton late after B2 | T19 post-loss, T18 panic, T17 TTS | Core check-in, Pact, pause |
| Cut 2 | Secure cloud path incomplete by mid-B4 | Voice STT, weekly dashboard, Marathi polish beyond core | Auth/RLS tests, idempotent sync |
| Cut 3 | Live broker demo incomplete by B5 | Use official sandbox or deterministic replay plus recorded fallback; never fake a replay as live | Read-only boundary, token safety, honest connection/timing labels |
| Cut 4 | Freeze at risk | CSV upload UI and advanced counterfactual chart; use bundled fixture | Guardrails, privacy, offline, server security |

Docker portability is not cut, but running Next.js inside Docker during routine development is optional. Local Supabase integration tests still require Docker.

---

## 5. Risk register

| ID | Risk | Likelihood | Impact | Mitigation | Trigger/fallback |
|---|---|---|---|---|---|
| R-01 | Very short schedule | High | High | Vertical slice by B2, contract stubs, cut lines | Apply cuts immediately at missed gate |
| R-02 | Advice/prediction language | Medium | Critical | Copy lint, fixed templates, two-person review | Block release |
| R-03 | RLS or grant exposes another user's data | Medium | Critical | Migration-based grants, owner/non-owner tests, no untested exposed table | Block release and disable sync |
| R-04 | Service-role key enters client bundle | Low | Critical | Server-only module, secret scan, build inspection | Rotate key and block release |
| R-05 | Raw CSV/audio uploaded accidentally | Low | Critical | Route deny rules, network test, consent classification | Disable affected endpoint |
| R-06 | Offline duplicates or overwrites records | Medium | High | UUID, idempotency key, unique constraint, revision tests | Keep records pending and disable auto-sync |
| R-07 | Multi-device Pact bypass | Medium | High | Server activation time and stricter field merge | Cloud Pact becomes read-only until fixed |
| R-08 | Service worker stale/update bug | Medium | High | Prompted updates and pause-aware deferral | Disable update activation; recorded backup |
| R-09 | Web Push unreliable or permission denied | High | Medium | Generic in-app event inbox and deterministic push stub | Demo inbox/outbox and recorded notification |
| R-10 | Whisper too slow or inaccurate | High | Medium | Text-first journal, capability gate, go/no-go in B3 | Cut STT |
| R-11 | Full-stack needs network during demo | Medium | High | Core journey offline, local Supabase fallback, recorded connected flow | Run local Docker backend or video |
| R-12 | Replayed event mistaken for live broker activity | Medium | High | Persistent "simulated replay" label and limitation slide | Remove ambiguous copy |
| R-13 | Next.js client bundle exceeds target | Medium | Medium | Client boundaries, lazy charts/workers, bundle analysis | Replace chart library and reduce client components |
| R-14 | Docker/Supabase CLI fails on a teammate's machine | Medium | Medium | One documented owner, prebuilt seed/migrations, staging fallback | Use shared staging Supabase |
| R-15 | Translation quality | Medium | Medium | Native review of core flow; English fallback | Mark non-reviewed locale beta |
| R-16 | Broker API secret/token exposure | Low | Critical | Hosted login, server-only secrets, encryption, redaction, rotation, no token export | Disconnect, rotate, incident review, block release |
| R-17 | Broker session expires or worker disconnects | High | High | Health/expiry states, daily reauth, reconnect/backoff, reconciliation, alerts | Mark stale; fall back to manual flow |
| R-18 | Broker terms/approval do not permit public multi-user launch | Medium | Critical | Confirm terms and app approval before production onboarding | Restrict to sandbox/team demo; do not collect public connections |
| R-19 | Product overclaims that it blocks trades | Medium | Critical | Mandatory after-event limitation in UI, demo, and copy tests | Block release until corrected |

---

## 6. Post-hackathon phases

| Phase | Scope | Success signal |
|---|---|---|
| P1: Harden | Security review, retention jobs, accessibility research, native translation review, load tests | Five target users complete the journey unaided; no critical security findings |
| P2: Pilot | Consent-based pilot with investor-awareness partners; measure PHR and qualitative outcomes | Reliable opt-in usage and interpretable feedback |
| P3: Second provider | Add Angel One behind the reviewed read-only adapter contract | Equivalent consent, deletion, health, and event-quality behavior |
| P4: Evidence | Controlled behavioral evaluation with ethical oversight | Measured change reported with limitations |

Guardrails persist across every phase. A connected source never changes the product into an advice or order-placement system.

---

## 7. Definition of done

- [ ] Next.js PWA installs and completes the core journey offline after first load.
- [ ] Guest mode works without creating an account.
- [ ] Optional Auth and sync work with idempotent retry and visible sync status.
- [ ] Supabase migrations, grants, constraints, and RLS tests pass.
- [ ] Pact tightening and server-authoritative delayed loosening pass multi-device tests.
- [ ] Raw CSV and audio remain local by default.
- [ ] Zerodha hosted login, encrypted token lifecycle, daily reauthentication, health state, and disconnect pass tests.
- [ ] Persistent worker receives a sandbox/live or labelled replay event, handles reconnect/dedupe, and creates one assessment/outbox event.
- [ ] Push payload is generic and the PWA fetches protected details after open.
- [ ] Export, consent revocation, local deletion, and cloud account deletion work.
- [ ] Guardrail, privacy, architecture, unit, API, DB, sync, offline E2E, and full-stack E2E gates pass.
- [ ] No order placement/modify/cancel surface exists and the after-event/no-blocking limitation is visible.
- [ ] Production URL, worker health, video, PPT, local Docker/replay fallback, and recorded fallback are ready.
