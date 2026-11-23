# Handoff 2026-11-24: Walking skeleton + CI (task 0001)

## Done
- Guard hook verified in a real session: a PR merge and a listing of the real
  data directory were both blocked (next step 1 of the previous handoff).
- Branch `agent/implementer/walking-skeleton`, PR opened against `main`.
- Node 26 (active LTS) pinned in `.nvmrc`; ESM, TypeScript strict
  (+ `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- Fastify server on `127.0.0.1`, `PORT` (default 5310), `GET /api/health`.
  In production (`NODE_ENV=production`, set by `npm start`) it also serves
  `dist/web`, with SPA fallback to `index.html`; unknown `/api/*` stays 404.
- React + Vite page that calls `/api/health`, UI in es-ES.
- Vitest: 17 tests (health, static serving, PORT parsing, frontend fetch).
- ESLint (typescript-eslint `strictTypeChecked`, react-hooks) + Prettier.
- CI: `.github/workflows/ci.yml` on every PR: `npm ci`, lint, typecheck,
  test, build.
- README, 20 rows in `docs/dependencies.md`.
- Verified locally: clean `npm ci` + all checks; `npm start` and `npm run dev`
  smoke-tested with curl.

## In progress
- Nothing.

## Blocked
- Nothing.

## Next steps
1. Manuel: review and merge the PR once CI is green.
2. Manuel: add the CI job `check` as a required check in `protect-main`
   (ADR-0001 action item 4; agents cannot touch rulesets).
3. PR template (ADR-0001 action item 5).
4. Next feature task (database, Zod, Playwright each in their own task).

## Decisions taken
- TypeScript 6.0.3, not 7.x: `typescript-eslint` 8.74 supports `<6.1` only.
- Prettier ignores `docs/` and `CLAUDE.md` so formatting never rewrites
  Manuel's prose; code and config files are checked.
- Layout: `src/server`, `src/web`, one tsconfig each + root for config files.

## Notes
- `npm run dev`: if the page loads before the API is up, it shows the error
  message; reload fixes it. Not worth a retry loop in the skeleton.
- npm warns that `esbuild`'s install script is not in `allowScripts`. It is
  not needed (the binary comes from an optional dependency); everything works.
