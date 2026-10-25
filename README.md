# infraorgit-web

Frontend di InfraOrgIT: SPA Vite + React 19 + TypeScript.

## Stato

Fase 0 — solo documentazione e CI skeleton. Nessun progetto, build o test disponibile.

## Stack

- Vite + React 19 + TypeScript
- React Router 7, TanStack Query/Table, React Hook Form + Zod
- React Flow 12 (`@xyflow/react`) in `features/diagrams`
- Tailwind 4 + Radix + Heroicons
- Biome 2 + `tsc --noEmit`
- Vitest + Testing Library + MSW, Playwright

## Struttura prevista

```
src/
  app/{router.tsx, providers.tsx, layout/}
  features/{providers, environments, servers, applications, projects, diagrams, remote, admin}/
  api/{client.ts, schema.d.ts}
  components/
  lib/
```

`api/schema.d.ts` è generato dall'OpenAPI del backend: non modificarlo a mano.

## Comandi

Non ancora disponibili. Arrivano con lo scaffolding della Fase 2 e verranno documentati qui.

## Riferimenti

- `../PLAN.md` §5.4, §5.8
- `../AllInfraOrgIT/docs/adr/002-frontend-vite.md`
