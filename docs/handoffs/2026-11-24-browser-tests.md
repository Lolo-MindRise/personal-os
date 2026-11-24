# Handoff 2026-11-24: Browser tests and rules (task 0006)

## Done
- Branch `agent/implementer/browser-tests`. Built on #11's branch while it was
  open; after #9, #11 and #12 were merged, `origin/main` was merged in (merge
  commit, no rebase). The PR diff is task 0006 only.
- Playwright (`@playwright/test` 1.65.1, Chromium only), `npm run test:e2e`
  (builds, then runs both). Config: `playwright.config.ts`; specs in `e2e/`.
  - `dev.spec.ts`: `npm run dev` on API port 5311; heading renders,
    `/api/categories` answered through the proxy, no failed request, console
    or page error. Problems are checked first, so a failure names the request.
  - `prod.spec.ts`: `e2e/prod-server.ts` seeds a `mkdtemp` data dir and runs
    `npm start` on port 5312, removes the dir on SIGTERM. Flow: seeded month
    totals, add/edit/delete with the totals, declined delete, invalid amount
    error next to the field, month label and `text-transform`.
- CI: new `e2e` job (`playwright install --with-deps chromium`); `check` untouched.
- UI: removed `text-transform: capitalize` (the "Noviembre De 2026" label).
  The label stays, now `noviembre de 2026`. The e2e test types lowercase text
  and asserts it is shown as typed.
- `CLAUDE.md`: three rules; the earlier "never modify settings" line was
  merged into the new rule about Manuel's `.claude/` files, not duplicated.
- Registered in `docs/dependencies.md`; README, `.gitignore`, ESLint, typecheck.

## Verified
- Guard hook (after merging the new one): an Edit of the permission settings
  file and a write through the GitHub API (PATCH on a pull request) were both
  blocked, once each.
- `npm run test:e2e`: 6/6 pass locally (8 s). Lint, typecheck, build and 197
  unit tests pass. No leftover processes or temp dirs after a run.
- Proof the tests can fail, each restored afterwards:
  - Old `'/api'` proxy key: dev test fails in 0.7 s with
    `404 http://127.0.0.1:5173/api.ts`.
  - Re-adding `text-transform: capitalize` to `.month-label` / `.movements td`:
    the month-label test and the typed-text test fail.

## Notes
- Production tests share one database and run in order (`serial`).
- The first version of the dev test failed with a 30 s timeout on the old
  proxy key; reordered so it fails fast and says why.
- Guard false positives: it scans the whole shell command, so a heredoc that
  only *quotes* a blocked path or command is blocked too (twice in this task).
  Reworded instead of bypassed. Same cause as in task 0003.
- Not done: tests for fixed expenses, categories, backups (out of scope).

## In progress / Blocked
- Nothing. Next: Manuel reviews and merges; both CI jobs must pass.
