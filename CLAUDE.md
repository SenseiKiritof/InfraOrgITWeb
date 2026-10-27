# InfraOrgITWeb — agent guide

`AGENTS.md` is a symlink to this file, read by opencode and the other agents: edit only `CLAUDE.md`.

Read `../AllInfraOrgIT/README.md` and `../AllInfraOrgIT/docs/backlog.md`.

## Repo rules

- Strict TypeScript; no JavaScript.
- Gate: Biome + `tsc --noEmit`. `next lint` no longer exists and is not used.
- Calls only to same-origin `/api` and `/auth`; no token readable from JavaScript.
- React Flow confined to `features/diagrams`; `buildGraph`, layout and routing are pure, testable functions.
- `api/schema.d.ts` generated from OpenAPI; CI fails if it drifts.
- No global state library until it is really needed.
- RBAC D7 = B: menus and actions filtered; do not trust the UI, the API is the source of truth.

## Status

Phase 6: shell, menu, inventory, diagrams, remote management and admin/RBAC (users, groups, roles, menu). Phase 7 is the legacy migration. Real commands in the README.
