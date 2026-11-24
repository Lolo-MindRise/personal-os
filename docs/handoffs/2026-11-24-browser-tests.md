# Handoff 2026-11-24: Browser tests and rules (task 0006)

## Done
- Branch `agent/implementer/browser-tests`, **stacked on PR #11's branch**
  (`agent/implementer/movements`), not on `main`: the dev smoke test needs the
  dev-proxy fix, which only exists in #11. Merge #11 first; this PR's diff then
  shrinks to task 0006 only. Deviation from "branch from `main`": see below.
- Playwright (`@playwright/test` 1.65.1, Chromium only), `npm run test:e2e`
  (builds, then runs both). Config: `playwright.config.ts`; specs in `e2e/`.
  - `dev.spec.ts`: `npm run dev` on API port 5311; heading renders, `/api/categories`
    answered through the proxy, no failed request, console or page error.
  - `prod.spec.ts`: `e2e/prod-server.ts` seeds a `mkdtemp` data dir and runs
    `npm start` on port 5312, removes the dir on SIGTERM. Flow: seeded month
    totals, add/edit/delete with the totals, declined delete, invalid amount
    error next to the field, month label and text-transform.
- CI: new `e2e` job (`playwright install --with-deps chromium`); `check` untouched.
- UI: removed `text-transform: capitalize` (the "Noviembre De 2026" label).
  The month label stays, now `noviembre de 2026`. No CSS or code changes typed
  text; the e2e test types lowercase and asserts it and `text-transform: none`.
- `CLAUDE.md`: three rules; the earlier "never modify settings" line merged
  into the new `.claude/` rule instead of duplicating it.
- Registered in `docs/dependencies.md`; README, `.gitignore`, ESLint, typecheck updated.
- Checked without a browser: 197 unit tests, lint, typecheck, build pass;
  `playwright test --list` shows 6 tests; the prod helper starts a seeded server
  and, on SIGTERM, stops it and deletes the temp dir.

## Blocked
- **The e2e tests have never run.** Chromium downloaded, but will not start:
  `libnspr4.so` is missing (28 system packages). Needs `sudo`, which agents
  cannot run. Manuel, in a WSL terminal:
  `cd ~/dev/personal-os && sudo env "PATH=$PATH" npx playwright install-deps chromium`
  (`env PATH` because Node comes from fnm and root does not have it).

## Next steps (after the command above)
1. Run `npm run test:e2e`; fix what the first real run finds.
2. Prove it: revert the proxy fix locally (`'/api'` key), see `dev.spec.ts`
   fail, restore.
3. Reviewer, review log row, PR, wait for both CI jobs.

## Deviation proposed
- Branch is stacked on #11 instead of created from `main`. Alternative: merge
  #11 first and I rebase onto `main`.
