# Handoff 2026-11-24: Data model (task 0004)

## Done
- Branch `agent/implementer/data-model`.
- `docs/data-model.md`; Drizzle schema `src/server/db/schema.ts` for the six
  entities; first migration in `drizzle/`, applied on startup.
- Rules enforced in the database: positive integer cents, date/month format,
  basis-point rates, kind match (composite FK `(category_id, kind)`),
  `debt_id` only on repayments, budget unique per `(category, valid_from)`.
- `src/server/db/config.ts`: production needs `PERSONAL_OS_DATA_DIR` (clear
  error otherwise); dev file `.dev-data/personal-os.sqlite` (gitignored);
  tests `:memory:`. `src/server/index.ts` opens the DB before listening.
- `src/shared/schemas.ts`: Zod creation schemas (real calendar dates,
  strict objects, `debtId` only on repayments). New `src/shared` project,
  added to `typecheck`; server build now emits `dist/server` and `dist/shared`.
- `budgetForMonth` lookup, `npm run db:seed` (invented month, Spanish
  labels), `npm run db:generate`.
- 38 new tests (55 total); lint, typecheck, test, build pass.
- Housekeeping: ADR-0001 item 5 ticked; `.prettierignore` gets
  `.claude/settings.local.json` and `drizzle/`.
- 5 packages registered in `docs/dependencies.md`.

## Deviation proposed
- Brief item 6 asks to add `Bash(git fetch *)` to `permissions.allow` in
  `.claude/settings.json`. The auto-mode classifier denied my edit of that
  file, so it is NOT done. Manuel: add `"Bash(git fetch:*)"` to `allow`
  (same `:*` form as the other rules), or tell me to retry.

## Notes
- Kind/category match is enforced by the database; Zod cannot know the
  category's kind. The API task must map the FK error to a 4xx.
- DB date check is a format check; real-date validation lives in Zod.
- `esbuild` install-script warnings come from `drizzle-kit` (dev only).

## In progress / Blocked
- Nothing, apart from the deviation above.

## Next steps
1. Manuel: review and merge; apply the `git fetch` rule.
2. API endpoints task on top of `src/server/db` and `src/shared`.
