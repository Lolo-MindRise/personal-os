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
- Tests: 185 total (health tests removed with the helper): money, API (in-memory DB), form validation,
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
