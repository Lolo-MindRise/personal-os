# Handoff 2026-11-25: Overnight run (task 0008)

Stacked PRs: block 1 branches from `main`, each later block from the previous
block's branch. This file accumulates one section per block.

## Block 1: Categories screen
Branch `agent/overnight/01-categories` (from `main`; task 0007 confirmed merged, PR #15).

### Done
- API (`src/server/categoriesApi.ts`): `POST /api/categories`, `PATCH /api/categories/:id`
  (rename only), `DELETE /api/categories/:id`, `GET /api/categories/usage` (counts of
  movements, recurring items and budget lines per category).
- Screen "Categorías": three sections by kind, add form, rename (kind locked), delete.
  A category in use shows why ("En uso: 2 movimientos, 1 fijo…") and its Eliminar is disabled;
  the API also answers `409` if a race makes it in use.
- Playwright: every spec except `dev.spec.ts` now runs in the prod project (`testIgnore`).
- No migration (no schema change).

### Decisions taken
- Name uniqueness is also checked ignoring case and spaces (`Ocio` vs `ocio`), on top of
  the DB's exact unique constraint. `409` on a duplicate.
- Renaming never changes the kind (`400` if sent): movements and fixed items depend on it.
- Usage counts live in a separate endpoint so `GET /api/categories` keeps its shape.

### Review
- Reviewer: changes required. Blocker: handoff missing from the diff (it was written after
  the commit reviewed; now included). Minor: N+1 in the usage endpoint, fixed with one grouped
  query per table. Other minors are recorded above under Decisions taken.

### Open questions
- None.

### PR
https://github.com/Lolo-MindRise/personal-os/pull/17 (both CI jobs green)

## Block 2: In-app backups (ADR-0003)
Branch `agent/overnight/02-backups`, stacked on block 1.

### Done
- `src/server/backups.ts`: backup service on SQLite's online backup API (`sqlite.backup`).
  Files `personal-os-<UTC stamp>-<startup|daily|pre-migration>.sqlite` in
  `<PERSONAL_OS_DATA_DIR>/backups`, written as `.partial` then renamed; keeps the 14 newest.
  Optional copy to `PERSONAL_OS_BACKUP_MIRROR_DIR`, keeps 7; if unreachable the app keeps
  running, logs it and reports it. Only files matching the naming pattern are ever pruned.
- Runs on startup, every 24 h (`unref`'d timer, stopped on SIGTERM), and before migrations:
  `openDatabaseGuarded` calls a hook only for an existing database with pending migrations.
  Closes the gap recorded in task 0004.
- `GET /api/backups/status`: `enabled`, `lastBackupAt`, `localCount`, mirror state and count,
  Spanish `warnings`. Banner (`role="status"`) on every screen when there are warnings.
- Backups only run in production with a data directory (dev has none). No migration.
- Tests (temporary directories only): retention, mirror, failures and recovery, scheduling,
  pre-migration ordering and content, status endpoint. The e2e server uses an unreachable
  mirror inside its temp dir, so Playwright checks the banner.

### Decisions taken
- If the backup before a migration fails, the app refuses to migrate and does not start
  (data safety over availability). Startup and daily failures only warn.
- All backup reasons share the same 14-file rotation (a migration backup can push out the
  oldest daily copy).
- No "stale backup" warning beyond: none yet, last attempt failed, mirror unreachable.
- The mirror directory is created one level only, never its parents: an unmounted second disk
  whose mount point exists as an empty folder must show as unreachable, not silently fill the
  main disk. A mirror equal to the local directory is refused (it would prune local backups).
- Shutdown waits for a backup in flight before closing the database. A `.partial` left by a
  hard kill is not counted and not cleaned up automatically.
- Drizzle's `__drizzle_migrations.id` is not filled in; migrations are counted by rows and
  ordered by `created_at`.
- Migration tests use their own tiny migrations folder (`openDatabaseGuarded` takes an optional
  folder), so later blocks adding migrations cannot break them.

### Review
- Reviewer: changes required, all fixed. Major: mirror `mkdir` recursive (above, with a test
  proven by mutation). Minors: mirror = local dir, shutdown race, tests tied to the newest
  migration, duplicate import, missing review-log row.

### Open questions
- None.

### PR
https://github.com/Lolo-MindRise/personal-os/pull/18 (both CI jobs green)

## Block 3: Budget screen
Branch `agent/overnight/03-budget`, stacked on block 2.

### Done
- `GET /api/months/:month/budget`: one row per category with the budget in effect (latest
  `valid_from` not after the month), the confirmed actual, and the difference, plus totals.
  Pure logic in `src/shared/budget.ts` (tested without a DB, and cross-checked against the
  existing `budgetForMonth`).
- `POST /api/budget-lines` adds a line (category, amount, from month); history is never
  edited. Screen "Presupuesto": month picker, table with totals row, "Cambiar presupuesto" form
  (new `MonthPicker` component). No migration.

### Decisions taken
- Rows: every expense category, plus any other category that has a budget in effect that month.
  Income and repayment categories without a budget are left out.
- Difference = budget − actual (positive = under budget, green; negative = over, red).
  Categories without a budget show no difference. "Total de gastos" adds the expense rows only
  (a budgeted income or repayment row is listed, marked "no entra en el total"); difference =
  total budget − total actual, so unbudgeted spending lowers it.
- "Actual" = confirmed movements of the category in the month; pending fixed items do not count.
- A second line for the same category and month is a `409` ("history is not edited"): a typo in
  a month's amount can only be fixed by adding a line from the next month on. There is no way
  to remove a budget (amount must be positive). Say if you want either.
- The e2e test adds a line in 2030 and cannot clean up (append-only); the e2e database is
  fresh per run.
- `POST /api/budget-lines` returns the month budget it starts from (the client reloads anyway);
  `lineInEffect` (shared) and `budgetForMonth` (db) are two implementations of the same rule,
  cross-checked by a test. Left as is.

### Review
- Reviewer: changes required, fixed. Major: totals mixed income/repayment rows with expenses
  (and a test asserted it); now expense rows only. Minors: dead `signed` helper removed, stale
  form error cleared on edit; two minors above left as is.

### Open questions
- None.

### PR
https://github.com/Lolo-MindRise/personal-os/pull/19 (both CI jobs green)

## Block 4: Debts screen
Branch `agent/overnight/04-debts`, stacked on block 3.

### Done
- API (`src/server/debtsApi.ts`): `GET /api/debts` (each with its linked repayments, the sum
  repaid after the as-of date and the estimated balance), `POST /api/debts`, `PATCH /api/debts/:id`.
  Pure logic in `src/shared/debts.ts`: `estimateBalance`, `parseRate` / `formatRate` (rate typed
  in percent, stored as basis points). `parseMoney` got an `allowZero` option (a balance can be 0).
- Screen "Deudas": one card per debt with balance and its date, estimated balance today, monthly
  payment, remaining installments, rate, repaid since the date and the linked repayments list.
  Add and edit form. The page says that regular installments are not deducted automatically.
- Movement form: a "Deuda (opcional)" select for `repayment` movements (not when confirming a
  fixed item). Editing a repayment into another kind sends `debtId: null`, so the API accepts it.
- No migration (the `debts` table and `movements.debt_id` already existed).

### Decisions taken
- Estimated balance = balance − linked repayments dated strictly after the as-of date, never
  below zero. Repayments on or before the as-of date are listed and marked "no se descuenta".
- "Updating the balance records a new as-of date": the API requires `balanceAsOf` whenever
  `balanceCents` changes (400 otherwise) and refuses a date earlier than the current one. A
  same-day correction is allowed. The form moves the date to today when the balance is edited.
- No delete for debts (not asked). Rate is typed in percent with at most two decimals, 0 to 100.
- A repayment confirmed from a fixed item cannot be linked to a debt (the confirm payload has no
  debt); link it by editing the movement afterwards.
- The API caps the rate at 100 % and installments at 9999, matching the form.

### Review
- Reviewer: changes required, fixed. Major: the `debtId: null` on a repayment turned into
  another kind had no test; now a pure helper (`payloadForUpdate`) with unit tests plus an API
  test of the transition. Minors: handoff section order, API bounds for rate and installments.

### Open questions
- None.

### PR
https://github.com/Lolo-MindRise/personal-os/pull/20 (both CI jobs green)

## Block 5: Summary and goals
Branch `agent/overnight/05-summary-goals`, stacked on block 4.

### Done
- Migration `0003_damp_jack_murdock` (additive, generated by drizzle-kit, no existing migration
  touched): table `app_settings` (single row id 1: `initial_savings_cents`, `initial_savings_date`).
  Documented in `docs/data-model.md`.
- API (`src/server/summaryApi.ts`): `GET/PUT /api/settings`; `GET /api/years/:year/summary`
  (12 rows: income, expenses, repayments, savings, accumulated; year totals); `GET/POST /api/goals`,
  `PATCH /api/goals/:id` (progress included). Pure logic in `src/shared/summary.ts`.
- Screen "Resumen": year picker, table with CSS bars (no chart library), initial-balance form.
  Screen "Objetivos": add/edit goals with progress bar, saved vs target, amount still needed,
  monthly saving required, "conseguido" / "vencido" notes. Nav now wraps on narrow screens.

### Decisions taken
- Accumulated savings at the end of a month = initial balance + savings of every confirmed
  movement dated **after** the initial date, up to that month's end. A movement on the initial date
  is already in the balance. Months that end before the initial date show "—". Without settings,
  all movements count from the start with a balance of 0. The "Ahorro" column is always the
  month's full savings, so in the initial month it can differ from the change in the accumulated.
- Initial balance must be >= 0 (zero allowed). Settings are replaced on each save (no history).
- Goal progress compares each goal with the same accumulated savings **today** (movements dated
  after today are not counted); savings are not split between goals. Percent is floored, so 99,9 %
  never reads as done; negative savings show 0 %.
- Monthly saving required = remaining / months left, rounded up to the cent, counting the current
  month (target in this month = 1 month). A goal whose date passed with money missing is
  "vencido" with no monthly figure; a reached goal shows none either.
- "Today" for goals is the server's local date (same machine as the browser). `GET /api/goals`
  accepts `?today=` for tests only.
- No delete for goals (not asked).

### Review
- Reviewer: approve, 3 minors, all fixed: handoff section order, the goals e2e test now sets the
  initial balance itself (independent of the Resumen test), and a failed settings load is no
  longer hidden by a successful summary load.

### Open questions
- None.

### PR
https://github.com/Lolo-MindRise/personal-os/pull/21 (both CI jobs green)

## Block 6: Milestones screen
Branch `agent/overnight/06-milestones`, stacked on block 5.

### Done
- API (`src/server/milestonesApi.ts`): `GET /api/milestones` (ordered by target date, then id),
  `POST` (status defaults to `pending`), `PATCH /api/milestones/:id` (any subset; `notes: null`
  clears the notes). No migration: the `milestones` table already existed.
- Screen "Hitos": list with date, title, notes, status (Pendiente / En curso / Hecho), add and edit
  form. A milestone whose date is before today and that is not done is highlighted and also
  flagged with the text "Vencido" (not only colour). Pure rule in `src/shared/milestones.ts`.

### Decisions taken
- Overdue is decided in the browser with its local date; the target day itself is not overdue.
- No delete for milestones (the brief says list, add, edit). Status changes through the edit form.
- The e2e test uses dates in 2020 and 2099, so it does not depend on the day it runs.

### Review
- Reviewer: approve, 5 minors, all fixed: the run summary wording (not every minor was fixed),
  an inaccurate "only block" claim, a stray bullet in block 1, a misplaced note in block 2, and an
  unrelated CSS assertion in the milestones e2e test.

### Open questions
- None.

### PR
https://github.com/Lolo-MindRise/personal-os/pull/22

## Run summary (read this first)

### What is done
All six blocks are implemented, each with unit and API tests, an e2e smoke test for its new
screen and a reviewer pass. Every blocker and major was fixed; some minors were recorded as
decisions instead (blocks 1 and 3, see their sections and `docs/metrics/review-log.md`). No new dependencies, no `.claude/` changes, no
data model change except one additive migration (`0003`, block 5).

### PRs in merge order (each is stacked on the previous one; merge 1 first)
1. #17 Categories screen
2. #18 In-app backups
3. #19 Budget screen
4. #20 Debts screen
5. #21 Summary and goals (migration `0003_damp_jack_murdock`)
6. #22 Milestones screen (also carries this summary)

Merge them in this order; after each merge GitHub retargets the next PR to `main`.

### Blocked
Nothing. No stop condition was hit and the guard hook never blocked anything.

### Test first, in the morning
1. **Backups** (the block that writes into the real data directory; #21's migration is the only
   other thing that changes the real database): start the real instance
   after merging #18 and check that `<data dir>/backups` has a `-startup` file and that
   `/api/backups/status` is healthy. Then set `PERSONAL_OS_BACKUP_MIRROR_DIR` and check the mirror
   fills and the banner shows when the second disk is unplugged. Merging #21 adds a migration: a
   `-pre-migration` backup must appear before it is applied.
2. **Categories**: create the real categories (the instance starts empty).
3. **Budget** and **Resumen**: set the initial savings balance and date, then check that the
   accumulated figures match what you expect.
4. **Debts**: link a real extra repayment from the movement form and check the estimated balance.

### Things to know
- Several screens have no delete (debts, goals, milestones, budget lines): the brief did not ask for it.
- The decisions I took are listed per block above; the ones most worth a look are the budget totals
  (expense rows only), the accumulated-savings boundary rule, and refusing to migrate when the
  pre-migration backup fails.
- Process: in three blocks my handoff edit landed in the wrong place and the reviewer caught it;
  the review-log row says so.
