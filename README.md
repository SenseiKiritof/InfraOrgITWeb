# InfraOrgITWeb

InfraOrgIT frontend: Vite + React 19 + TypeScript SPA.

## Status

2026-10-30. Implemented: BFF login, session, filtered menu, inventory, diagrams, remote management and admin pages (users, groups, roles, menu, per-environment roles). Recent UI work: a single shell header for every page, single-record cards instead of one-row tables, the new server/deployment fields, typed applications, project server sections with a run-all reachability action. React Flow and the console are in separate chunks; 5 Playwright E2E tests.

## Stack

- Vite 8 + React 19 + TypeScript
- React Router 7, TanStack Query
- Tailwind 4
- Biome 2 + `tsc --noEmit`
- Vitest + Testing Library, Playwright

## Structure

```
src/
  app/{App.tsx, AuthProvider.tsx}
  components/{EntitySection.tsx, RecordCard.tsx, PageHeaderSlot.tsx, page.tsx}
  features/{inventory, catalog, diagrams, remote, admin}/*.tsx
  lib/{api.ts, inventory.ts, diagrams.ts, buildGraph.ts, remote.ts, admin.ts, useServerAccess.ts}
  test/setup.ts
e2e/{login,inventory,diagrams,remote,admin}.spec.ts
```

## UI conventions

- The shell header shows the page name (and, for list pages, its short
  description); detail pages show the record name and keep the actions on the
  right.
- A single record (provider, environment, application, project, server) is a
  `RecordCard`: an editable form for who can write, a definition list
  otherwise. Never a one-row table with pagination.
- Applications are typed: `Backend`, `Frontend`, `Sftp`, `RabbitMq`, `Nginx`,
  `Elastic`, `Kibana`, `Kafka`, `MySql`, `MongoDb`, `Redis`. Only `Frontend`
  hides the API, API key and call sections.
- The server page edits the master data and the deployed applications in one
  place (runtime, container image/name/compose folder, host port, HA role).
- The project page lists the servers of its applications split into
  integrated and production, and can run all their reachability tests.
- Action buttons are 34 px high; table headers and the compact pagination keep
  their smaller size.

## Commands

```bash
yarn dev              # Vite :3000, /api and /auth proxy → API :5298
yarn build            # tsc --noEmit + vite build
yarn biome ci .
yarn tsc --noEmit
yarn vitest run
yarn playwright test  # requires the stack started with make dev
```

With the meta repo:

```bash
cd ../AllInfraOrgIT
make dev
make e2e
```

## Auth

- The SPA calls `/api/session`; on 401 it goes to `/auth/login`.
- The backend handles the callback and the HttpOnly cookie; no token in JavaScript.
- Logout: `POST /auth/logout` with the `X-CSRF-Token` from the session.
- Menu: `/api/menus` filtered by role; admin entries only for `SystemAdmin`.

## References

- `../AllInfraOrgIT/docs/ux/pages.md`
- ADR 002, 003, 005, 007

## Docker image

Multi-stage `Dockerfile` (Node 24 → Caddy 2) and `Caddyfile` that serves the SPA and proxies `/api`, `/auth`, `/realms` and `/resources` (compose front door).

- workflow `.github/workflows/docker.yml`: builds on every PR (no push, required `image` check), publishes `main`, `dev` and `sha-<commit>` on branch pushes, and `X.Y.Z`, `X.Y`, `sha-<commit>`, `latest` on `v*` tags
- branch and tag builds are multi-arch (`linux/amd64`, `linux/arm64`); PR builds stay amd64
- image `ghcr.io/senseikiritof/infraorgit-web`
- local build: `docker build --build-arg APP_VERSION=v0.2.0 -t infraorgit-web:0.2.0 .`
- the SPA is served on port 80; the version is baked into `VITE_APP_VERSION` and shown in the sidebar
- the published image is used by `../AllInfraOrgIT/deploy/compose.yaml` (stack without source, `make up-images`)
