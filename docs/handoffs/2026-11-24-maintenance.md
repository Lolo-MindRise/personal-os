# Handoff 2026-11-24: Maintenance (task 0010)

Branch `agent/implementer/maintenance` (from `main`).

## Done
- README: new "Prerequisites" section (build-essential, fnm + `.nvmrc`, Playwright system
  packages via `install-deps --dry-run` then `sudo apt-get install`). Real instance guide now
  recommends a `PORT` other than 5310 (example config uses 5380) and says why.
- `npm audit`: `--omit=dev` is clean. The 4 moderate findings are one dev-only chain
  (`drizzle-kit` -> `@esbuild-kit` -> esbuild 0.18.20); npm's only fix is a major downgrade of
  `drizzle-kit`, so not fixed. Recorded in `docs/dependencies.md`. Lockfile untouched.
- Install scripts: `allowScripts` in `package.json`: `better-sqlite3@13.2.0` allowed (pinned),
  `esbuild` denied. Verified in a clean copy: `npm ci` runs the `node-gyp rebuild`, no
  unreviewed scripts remain, build and 661 unit tests pass. Decision in `docs/dependencies.md`.
- E2E isolation: dev smoke test on Vite 5321 / API 5322 (new `VITE_PORT` env in
  `vite.config.ts`, default 5173), prod server 5323. Date-dependent specs (`prod`, `recurring`,
  `summary`) fix the browser clock with `page.clock.setFixedTime` and use constant months.

## Evidence
- With `npm run dev` running (Vite 5173 + API 5310 answering 200 / ok), `npm run test:e2e`:
  17 passed, the dev server still up afterwards.
- The recurring and movement-form specs pass with the fixed clock (2027-03-15).

## Decisions taken
- `better-sqlite3` is approved even though 13.2.0 ships prebuilds: npm treats its binding as an
  install script that always runs, so the compiler is required (documented as a prerequisite),
  and a platform without a matching prebuild keeps working.
- Fixed clock instead of editing each test's dates: the page's "today" is the only moving part.
  Seeded items run from 2026-01 without end, so 2027-03 shows them all pending.
- The dev e2e still uses `.dev-data` (same as a running `npm run dev`): it only reads.

- Known gaps (reviewer minors, left as is): the dev e2e server and a running `npm run dev` open
  the same `.dev-data` SQLite file (WAL mode, the e2e dev test only reads; the seed is not
  re-run), and the data path is fixed in code, so a separate dir would be a feature change.
  The fixed clock affects the browser only: the goals API uses the server's real
  `localToday()`; the goals test does not assert on dates, so it cannot flake on this.

## Review
- Reviewer: changes required. Major: new sections were inserted inside the dependencies table
  (fixed: moved after it). Minors: handoff date (fixed, 2026-11-24), the two gaps above.

## Open / next
- CI must confirm `npm ci` with `allowScripts` on its npm version (an npm without the feature
  ignores the field and runs scripts as before).
- Revisit the audit when `drizzle-kit` drops `@esbuild-kit`.

## Blocked
Nothing. No Windows-only parts in this task.
