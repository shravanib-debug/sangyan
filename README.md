# Thehrav

Thehrav is a full-stack, local-first PWA that creates a private pause between trading impulse and a possible follow-up action. It provides no investment advice and has no order-placement authority.

## Prerequisites

- Node.js 24 LTS
- Corepack with pnpm 12.8.1
- Docker Desktop or another Docker-compatible engine

## Local setup

```powershell
corepack enable
pnpm install
Copy-Item .env.example .env.local
pnpm supabase:start
pnpm dev
```

Open `http://localhost:3000`. Supabase Studio is shown in the `supabase start` output.

The values in `.env.example` are placeholders. Copy the local publishable and service-role values printed by the Supabase CLI into `.env.local`; never commit `.env.local`.

## Verification

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm check:secrets
pnpm build
pnpm test:db
```

## Docker

```powershell
pnpm docker:build
pnpm broker:docker:build
```

The broker-worker image exposes `/health` on port 8080. During Phase 0 it runs only a non-monitoring replay-mode health process; real broker connectivity starts in T34-T35.

## Data and credentials

- Commit only synthetic fixtures.
- Raw CSV and audio stay local by default.
- Never commit broker keys, access tokens, Supabase service-role keys, encryption keys, VAPID private keys, or real financial payloads.
- Never ask a user to enter a broker password, PIN, TOTP, API secret, request token, or access token into Thehrav.

See `IMPLEMENTATION_PLAN.md` for phase order and `TRACKER.md` for current status.
