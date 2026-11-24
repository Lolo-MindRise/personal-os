# Task 0009: Real instance operations (start, stop, deploy)

**Branch:** `agent/implementer/real-instance-ops`
**ADRs:** 0001, 0002, 0003

## Goal

Everything Manuel needs to run his real instance as described in ADR-0003,
built and tested here with temporary directories. You never touch the real
instance, its data or its backups (the guard hook enforces this). Manuel
sets it up himself afterwards by following the README.

## Scope

### 1. Configuration outside the repo

- The real instance reads its settings from `~/.config/personal-os/instance.env`
  (overridable with `PERSONAL_OS_INSTANCE_ENV`): `PERSONAL_OS_DATA_DIR`,
  `PERSONAL_OS_BACKUP_MIRROR_DIR`, `PORT`.
- Commit `config/instance.env.example` with placeholder values and a comment
  per variable. Placeholders only: no real paths anywhere in the repo.

### 2. `scripts/start.sh`

- Loads the instance config; fails with a clear message if it is missing or
  `PERSONAL_OS_DATA_DIR` is not set.
- Finds Node even in a non-interactive login shell: Manuel's Node comes from
  `fnm`. If `node` is not on `PATH`, initialise `fnm` if it is installed;
  otherwise fail with a clear message.
- If the app already answers on its port, say so and exit successfully.
- Otherwise start it in production mode, detached, writing its log to
  `<data dir>/logs/app.log` (rotate when larger than 5 MB, keep 3) and its
  PID to `<data dir>/app.pid`.
- Wait until `GET /api/health` answers (timeout 30 s, then fail and point to
  the log). Exit 0 only when the app is up.

### 3. `scripts/stop.sh`

Stops the app using the PID file (graceful signal, then wait); handles a
stale PID file; succeeds if the app was not running.

### 4. `scripts/deploy-local.sh`

- Instance directory from `PERSONAL_OS_APP_DIR` (default documented in the
  README only, not hard-coded to a real path in tests).
- Refuses to run while the app is running (tells Manuel to stop it first).
- First run: clones the repository's `main`. Later runs: `git fetch` and fast-
  forward to `origin/main`; refuses if the instance directory has local changes.
- `npm ci`, then `npm run build`. If any step fails, stop and say which.
- Does not run migrations itself: the app migrates on start, after its own
  pre-migration backup (task 0008, block 2).

### 5. Windows shortcuts

`scripts/windows/personal-os-start.cmd` and `personal-os-stop.cmd`: call the
scripts through `wsl.exe` with a login shell, open
`http://localhost:<port>` in the default browser after a successful start,
and keep the window open with the error if something fails. Use the default
WSL distribution; a comment explains how to pin one with `-d`.

### 6. `npm run db:reset` (development only)

Deletes and re-seeds the development database (`.dev-data/`). Refuses to
run when `NODE_ENV` is `production` or when `PERSONAL_OS_DATA_DIR` is set.

### 7. README: "Run your real instance"

A short step-by-step guide for Manuel: create the config file, first
deploy, create the Windows shortcuts, first start, check the first backup,
stop, update after merging a PR. Mention that the real instance must not be
started while a test run uses the same port.

### 8. Tests

Scripts are tested with temporary directories, a temporary local bare
repository as the remote, and a free port: config missing, Node lookup,
start when stopped, start when already running, health timeout, stale PID,
stop when not running, deploy first run, deploy update, deploy refusing on
local changes and while running, `db:reset` refusing in production.
No new dependencies.

### 9. Process

Run the `reviewer` subagent before opening the PR and add the review log
row. Handoff in `docs/handoffs/`. ADR-0003: tick action item 2.

## Out of scope

Running anything against the real instance; off-site backups; the
dashboard.

## Done when

- Both CI jobs pass on the PR.
- The reviewer verdict is in the PR, with blockers and majors fixed or
  explained.
- The README guide can be followed by Manuel without asking anything.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
