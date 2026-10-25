# infraorgit-web — guida per agenti

Leggi `../AGENTS.md` e `../PLAN.md`.

## Regole repo

- TypeScript strict; niente JavaScript.
- Gate: Biome + `tsc --noEmit`. `next lint` non esiste più e non si usa.
- Chiamate solo a `/api` e `/auth` same-origin; nessun token leggibile da JavaScript.
- React Flow confinato in `features/diagrams`; `buildGraph`, layout e routing sono funzioni pure testabili.
- `api/schema.d.ts` generato dall'OpenAPI; la CI fallisce se è driftato.
- Nessuna libreria di stato globale finché non serve davvero.
- RBAC D7 = B: menu e azioni filtrati; non fidarsi della UI, l'API è la fonte di verità.

## Stato

Fase 5: shell autenticata, menu, inventario, diagrammi e gestione remota (credenziali, comandi, reachability, esecuzioni, console). La Fase 6 aggiunge admin/RBAC completo. Comandi reali nel README.
