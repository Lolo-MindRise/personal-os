# Task 0001: Walking skeleton + CI

**Branch:** `agent/implementer/walking-skeleton`
**ADRs:** 0001, 0002, 0003

## Goal

The smallest app that builds, runs, is tested and is checked by CI, so every
later task has a working base and every PR is verified automatically.

## Scope

1. Project setup: TypeScript strict, Node.js LTS pinned in `.nvmrc`,
   `.gitignore`, npm scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`.
2. Backend: Fastify server on `127.0.0.1`, port from `PORT` (default 5310),
   one endpoint `GET /api/health` returning `{ "status": "ok" }`.
   In production mode it also serves the built frontend.
3. Frontend: React + Vite, one page that calls `/api/health` and shows the
   result. UI text in Spanish.
4. Tests: Vitest, one test for the health endpoint.
5. Lint and format: ESLint (typescript-eslint) and Prettier.
6. CI: GitHub Actions workflow on every pull request running
   `npm ci`, `lint`, `typecheck`, `test`, `build`.
7. `README.md`: how to install, run, test (short).
8. Every package added gets its row in `docs/dependencies.md`.

## Out of scope

Database, Drizzle, Zod, Playwright, backups, deploy scripts, any feature.
Each comes in its own task.

## Done when

- All checks pass locally and in CI on the PR.
- PR description follows `CLAUDE.md`.
- Handoff written in `docs/handoffs/`.

## If something blocks you

Do not work around an ADR. Stop, write "Deviation proposed" in the PR or
handoff with the reason and options.
