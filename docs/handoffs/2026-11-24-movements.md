# Handoff 2026-11-24: Movements API and screen (task 0005)

## Done
- Branch `agent/implementer/movements`. No new dependencies.
- `src/shared/money.ts`: `parseMoney` (Spanish input → integer cents, no
  floats) and `formatCents` (`1.234,56 €`, no-break space), `centsToInput`.
- API in `src/server/api.ts`, registered by `buildApp({ db })`:
  `GET /api/categories[?kind]`, `GET/POST /api/movements`,
  `PATCH/DELETE /api/movements/:id`, `GET /api/months/:month/summary`.
  Errors are `{ error, fields? }` in Spanish: 400 invalid input, unknown
  category or debt, kind/category mismatch (checked before the insert, so the
  composite FK never surfaces as a 500); 404 unknown or malformed id.
  PATCH merges with the stored row and re-validates the whole movement.
- `src/shared/schemas.ts`: `movementFieldsSchema` and `movementUpdateSchema`
  (partial) split out of `movementCreateSchema`; `src/shared/api.ts` DTOs.
- Screen (`src/web`): month picker (default current month), totals, list,
  add/edit form with per-field Spanish errors, delete with `confirm`, plain CSS.
- `CLAUDE.md`: two rules (no permission edits; no editing committed migrations).
- Tests: 197 total (health tests removed with the helper): money, API (in-memory DB), form validation,
  list/summary/form rendering, API client, month helpers.

## Decisions taken
- `1.234` parses as 1234 € (dot + exactly three digits = thousands);
  `12.5` as 12,50 €. Documented in `parseMoney`. `0` is rejected.
- Screen tests use `renderToStaticMarkup` plus pure functions, to avoid adding
  a DOM test library (jsdom, Testing Library). The interactive page wiring
  (`MovementsPage`) is therefore not unit-tested; checked by hand through the
  dev proxy. Playwright is out of scope; propose it as its own task.
- Validation messages are Spanish (Zod `es` locale set in `src/shared/schemas.ts`, a global side effect of importing it).
- Removed `src/web/health.ts` and its test: the screen replaced the health
  page and nothing used them. `GET /api/health` stays.

## Defect found in manual testing (fixed in a follow-up PR)
- `npm run dev` showed a blank page: `GET /api.ts 404`. Cause: the Vite proxy
  key `'/api'` is a prefix match, so the module `src/web/api.ts` (served as
  `/api.ts`) went to Fastify. Tests, typecheck, build and `npm start` cannot
  see it: none goes through the dev server.
- PR #10 was merged before the fix, so `main` had the bug until the follow-up.
- Fix: `src/web/devProxy.ts` anchors the key to `^/api/`. `devProxy.test.ts`
  fails with the old key, with a literal `'/api'` in `vite.config.ts` and with
  a folder `src/web/api/` (each checked).
- Verified like a browser: with `npm run dev`, `/` and every module it imports
  (25, via `es-module-lexer`) return 200; `/api.ts` was Fastify's 404 before.
  `npm run build` + `npm start` (scratch data dir): page, JS, CSS, API all 200.
- Not verified: no browser here, the page was never rendered. My earlier dev
  smoke only called the API, not the modules.
- For Manuel: "shows the screen working" has no automated check. Options: a
  Playwright smoke test (out of scope in brief 0005) or the module crawl as an
  `npm run` script.

## Notes
- The seed is January 2026, the default month is the current one: pick
  January 2026 in the selector to see the seed data.
- The brief itself lives on open PR #9 (`docs/task-0005`), not on `main`.
- Only a category list exists; there is no screen to create categories.

## In progress / Blocked
- Nothing.

## Next steps
1. Manuel: review and merge.
2. Budget screen, then debts; consider Playwright for end-to-end checks.
