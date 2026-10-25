# infraorgit-web

Frontend di InfraOrgIT: SPA Vite + React 19 + TypeScript.

## Stato

Fase 2 — shell autenticata — 2026-10-25. Implementati login BFF, sessione, menu filtrato dal ruolo, shell e pagine placeholder. Le pagine di inventario arrivano in Fase 3.

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
  lib/{api.ts, menu.ts}
  test/setup.ts
e2e/login.spec.ts
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

- `../PLAN.md` §5.4, §5.5
- `../AllInfraOrgIT/docs/ux/pages.md`
- ADR 002, 003, 005, 007
