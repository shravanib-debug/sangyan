# Frontend

The Thehrav frontend is built with the Next.js App Router. The route entrypoints
live in [`../app`](../app), while reusable UI, feature screens, and client state
live in [`../src`](../src). Keeping those two directories at the project root
allows Next.js, TypeScript path aliases, service-worker generation, and the
existing test suite to share one source of truth.

The shared workspace navigation is in
[`../src/features/app/workspace-shell.tsx`](../src/features/app/workspace-shell.tsx),
and the global design system is in [`../app/globals.css`](../app/globals.css).
