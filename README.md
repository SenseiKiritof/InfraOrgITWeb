# InfraOrgITWeb

Frontend di InfraOrgIT: SPA Vite + React 19 + TypeScript.

## Stato

Fase 6 — admin e RBAC — 2026-10-26. Implementati login BFF, sessione, menu filtrato, inventario, diagrammi, gestione remota e pagine admin: utenti con gruppi/ruoli, gruppi, ruoli, menu e ruoli per ambiente. React Flow e la console sono in chunk separati; 5 E2E Playwright.

## Stack

- Vite 8 + React 19 + TypeScript
- React Router 7, TanStack Query
- Tailwind 4
- Biome 2 + `tsc --noEmit`
- Vitest + Testing Library, Playwright

## Struttura

```
src/
  app/{App.tsx, AuthProvider.tsx}
  components/{EntitySection.tsx, page.tsx}
  features/{inventory, catalog, diagrams, remote, admin}/*.tsx
  lib/{api.ts, inventory.ts, diagrams.ts, buildGraph.ts, remote.ts, admin.ts, useServerAccess.ts}
  test/setup.ts
e2e/{login,inventory,diagrams,remote,admin}.spec.ts
```

## Comandi

```bash
yarn dev              # Vite :3000, proxy /api e /auth → API :5298
yarn build            # tsc --noEmit + vite build
yarn biome ci .
yarn tsc --noEmit
yarn vitest run
yarn playwright test  # richiede lo stack avviato con make dev
```

Con il meta repo:

```bash
cd ../AllInfraOrgIT
make dev
make e2e
```

## Auth

- La SPA chiama `/api/session`; se 401 va a `/auth/login`.
- Il backend gestisce callback e cookie HttpOnly; nessun token in JavaScript.
- Logout: `POST /auth/logout` con `X-CSRF-Token` dalla sessione.
- Menu: `/api/menus` filtrato per ruolo; voci admin solo `SystemAdmin`.

## Riferimenti

- `../AllInfraOrgIT/docs/ux/pages.md`
- ADR 002, 003, 005, 007

## Immagine Docker

`Dockerfile` multi-stage (Node 24 → Caddy 2) e `Caddyfile` con fallback SPA.

- workflow `.github/workflows/docker.yml` sui tag `v*`
- immagine `ghcr.io/senseikiritof/infraorgit-web`, tag `X.Y.Z`, `X.Y`, `sha-<commit>`, `latest`
- build locale: `docker build --build-arg APP_VERSION=v0.8.0 -t infraorgit-web:0.8.0 .`
- la SPA è servita su porta 80; la versione è baked in `VITE_APP_VERSION` e mostrata nella sidebar
