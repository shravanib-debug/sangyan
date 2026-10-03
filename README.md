# Thehrav

Thehrav is a full-stack, local-first PWA that creates a private pause between trading impulse and a possible follow-up action. It provides no investment advice and has no order-placement authority.

## Prerequisites

- Node.js 24 LTS and npm 10
- Docker Desktop or another Docker-compatible engine (only for `supabase start` and the image builds)

## Local setup

```powershell
npm install
Copy-Item .env.example .env.local
npm run supabase:start
npm run dev
```

Open `http://localhost:3000`. Supabase Studio is shown in the `supabase start` output.

The values in `.env.example` are placeholders. Copy the local publishable and service-role values printed by the Supabase CLI into `.env.local`; never commit `.env.local`. Generate the 32-byte keys with `openssl rand -base64 32`.

## What works without a backend

The manual journey (onboarding, Pact, check-in, explainable pause, decision) runs entirely on the device, including offline after the first load. Nothing leaves the device until you sign in **and** turn on sync in Settings.

## Verification

```powershell
npm run typecheck
npm run lint
npm test            # unit, service, worker and database tests (database tests run on an in-process Postgres)
npm run check:secrets
npm run build
npx playwright test # offline journey and API boundary tests against the production build (port 3100)
npm run test:db     # pgTAP grants/RLS tests; needs `supabase start`
```

## Cloud sync and the Zerodha connection

1. Sign in, then enable **Cloud sync** in Settings. Check-ins, Pact edits and pause outcomes upload idempotently; the server re-runs the risk engine and is authoritative for the Pact (loosening waits 24 hours on the server clock). Free text stays on the device unless you also tick the journal-sync option.
2. **Connect Zerodha** opens Zerodha's own login. Thehrav never sees your password; the one-time request token is exchanged on the server and the access token is stored encrypted (AES-256-GCM) and deleted on disconnect. Set `ZERODHA_API_KEY`, `ZERODHA_API_SECRET`, `BROKER_TOKEN_ENCRYPTION_KEY` and `BROKER_INTERNAL_SIGNING_KEY`, and register `<APP_ORIGIN>/api/brokers/zerodha/callback` as the redirect URL in the Kite developer console. Public use needs Zerodha's app approval and terms review.
3. **Without Zerodha credentials** the same button creates a clearly labelled *simulated replay* connection, which exercises the whole pipeline with synthetic events.

### Broker worker

```powershell
$env:APP_URL = "http://127.0.0.1:3000"
npm run broker:dev          # leases live connections, observes order updates, posts signed canonical events
npm run broker:docker:build # production image; exposes /health on 8080
```

The worker is observation-only: its adapter interface has no method to place, modify or cancel an order, and tests enforce this. Replay events are always flagged simulated and stored as synthetic.

### Push notifications

1. Generate VAPID keys (`npx web-push generate-vapid-keys`); set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `PUSH_SUBSCRIPTION_ENCRYPTION_KEY`.
2. Deploy the Edge Function: `supabase functions deploy dispatch-outbox` (set the same secrets with `supabase secrets set`).
3. Schedule the durable retry once per environment using `supabase/cron-dispatch-outbox.sql`.

Push payloads are generic (no amounts, symbols, sources or tiers). Opening one loads the protected explanation after sign-in; the in-app inbox on Home lists waiting pauses if a push never arrives.

## Honest limitation

Thehrav sees broker activity only after it happens. It cannot block an order, including one placed in your broker's own app. If the worker, session or push channel is down, the app shows the connection as stale and the manual check-in still works.

## Docker

```powershell
npm run docker:build
npm run broker:docker:build
```

## Data and credentials

- Commit only synthetic fixtures.
- Raw CSV and audio stay local by default.
- Never commit broker keys, access tokens, Supabase service-role keys, encryption keys, VAPID private keys, or real financial payloads.
- Never ask a user to enter a broker password, PIN, TOTP, API secret, request token, or access token into Thehrav.

See `IMPLEMENTATION_PLAN.md` for phase order and `TRACKER.md` for current status.
