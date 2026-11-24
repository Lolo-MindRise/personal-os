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

- Playwright prod project now runs every spec except `dev.spec.ts` (was an allowlist), so
  future specs run against the production server by default.

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
- Migration tests use their own tiny migrations folder (`openDatabaseGuarded` takes an optional
  folder), so later blocks adding migrations cannot break them.

### Review
- Reviewer: changes required, all fixed. Major: mirror `mkdir` recursive (above, with a test
  proven by mutation). Minors: mirror = local dir, shutdown race, tests tied to the newest
  migration, duplicate import, missing review-log row.
- Drizzle's `__drizzle_migrations.id` is not filled in; migrations are counted by rows and
  ordered by `created_at`.

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
  Categories without a budget show no difference. Totals: budget and actual over all rows, and
  difference = total budget − total actual (so unbudgeted spending lowers it).
- "Actual" = confirmed movements of the category in the month; pending fixed items do not count.
- A second line for the same category and month is a `409` ("history is not edited"): a typo in
  a month's amount can only be fixed by adding a line from the next month on. There is no way
  to remove a budget (amount must be positive). Say if you want either.
- The e2e test adds a line in 2030 and cannot clean up (append-only); the e2e database is
  fresh per run.

### Open questions
- None.
