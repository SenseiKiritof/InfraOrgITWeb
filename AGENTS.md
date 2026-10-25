# infraorgit-web — guida per agenti

Leggi `../AGENTS.md` e `../PLAN.md`.

## Regole repo

- TypeScript strict; niente JavaScript.
- Gate: Biome + `tsc --noEmit`. `next lint` non esiste più e non si usa.
- Chiamate solo a `/api` e `/auth` same-origin; nessun token leggibile da JavaScript.
- React Flow confinato in `features/diagrams`; `buildGraph`, layout e routing sono funzioni pure testabili.
- `api/schema.d.ts` generato dall'OpenAPI; la CI fallisce se è driftato.
- Nessuna libreria di stato globale finché non serve davvero.

## Stato

Fase 0: nessun progetto. Non inventare comandi o file.
