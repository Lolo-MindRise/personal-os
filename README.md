# personal-os

Personal management app (personal finance first). Local web app: a single
Node.js process serves the API and the built frontend on `127.0.0.1`.

Architecture and rules: `docs/decisions/` and `CLAUDE.md`.

## Requirements

- Node.js, the version in `.nvmrc`, installed with `fnm` (see Prerequisites).
- npm (bundled with Node.js).
- On a fresh Ubuntu/WSL: the system packages under Prerequisites.

## Install

```sh
npm ci
```

## Run

| Command               | What it does                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run dev`         | API with reload on `127.0.0.1:5310` + Vite dev server on `127.0.0.1:5173` (open this one).     |
| `npm run build`       | Builds the frontend to `dist/web` and the server to `dist/server`.                             |
| `npm run db:seed`     | Fills the development database (`.dev-data/`, gitignored) with an invented month.              |
| `npm run db:reset`    | Deletes and re-seeds the development database. Refuses in production or with a data dir set.   |
| `npm run db:generate` | Generates a SQL migration into `drizzle/` after a schema change.                               |
| `npm start`           | Production mode: serves the API and the built frontend on `127.0.0.1:5310`. Run `build` first. |

The port comes from the `PORT` environment variable (default `5310`).

## Check

```sh
npm run lint        # ESLint + Prettier check
npm run typecheck   # TypeScript, strict
npm test            # Vitest
npm run test:e2e    # Playwright: dev and production smoke tests (builds first)
npm run format      # Apply Prettier formatting
```

CI (`.github/workflows/ci.yml`) runs two jobs on every pull request: `check`
(`npm ci`, lint, typecheck, test, build) and `e2e` (Chromium, `npm run test:e2e`).
Locally, Chromium needs `npx playwright install chromium` once, and on a fresh
Ubuntu/WSL also its system libraries (see Prerequisites).

The e2e suite uses its own ports (Vite 5321, API 5322, production server 5323, empty-database server 5324)
and fixed dates, so it can run while `npm run dev` or the real instance is up.

## Layout

```
scripts/      start, stop and deploy scripts for the real instance (+ Windows shortcuts)
config/       instance.env.example (template of the real instance's settings)
src/server/   Fastify API (health endpoint, static serving in production)
src/web/      React + Vite frontend (UI text in es-ES)
e2e/          Playwright smoke tests (dev and production servers)
```

## Prerequisites

For a fresh Ubuntu under WSL (the real instance and local e2e runs). Run once.

1. **Build tools.** `better-sqlite3` is compiled during `npm ci` when no
   prebuilt binary matches the Node version, and the install script is
   allowed on purpose (`allowScripts` in `package.json`). Without a compiler
   a deploy fails.

   ```sh
   sudo apt-get update
   sudo apt-get install build-essential
   ```

2. **Node through `fnm`**, using the version in `.nvmrc`. Install `fnm`
   (<https://github.com/Schniz/fnm>), then from the repository:

   ```sh
   fnm install      # reads .nvmrc
   fnm use
   node -v          # must match .nvmrc
   ```

   The scripts in `scripts/` initialise `fnm` themselves when `node` is not on
   `PATH` (as in a non-interactive shell opened from Windows).

3. **Playwright system packages** (only for local e2e runs; CI installs its own).
   First list what is missing, without installing anything:

   ```sh
   npx playwright install chromium
   npx playwright install-deps --dry-run chromium
   ```

   Then install exactly that list with `sudo apt-get install <packages>`
   (the dry run prints the command). Avoid running `install-deps` under `sudo`
   directly: it needs your `PATH` and would run npm's code as root.

## Run your real instance

Everything runs inside WSL (ADR-0003). The instance directory is
`PERSONAL_OS_APP_DIR`, default `~/apps/personal-os`; the commands below use
the default.

1. **Create the config file** (outside the repository):

   ```sh
   mkdir -p ~/.config/personal-os
   cp config/instance.env.example ~/.config/personal-os/instance.env
   nano ~/.config/personal-os/instance.env
   ```

   Set `PERSONAL_OS_DATA_DIR` (database, logs, local backups),
   `PERSONAL_OS_BACKUP_MIRROR_DIR` (a folder on the second disk, under `/mnt/...`)
   and `PORT`. Use a port other than 5310, the default of `npm run dev`
   (for example 5380): the development server and the real instance would
   otherwise fight for it, and a dev server started first would answer the
   start script's health check as if it were the real app. Another file can be used with
   `PERSONAL_OS_INSTANCE_ENV=/path/to/file`.

2. **First deploy** (clones `main`, `npm ci`, build), from your development clone:

   ```sh
   bash scripts/deploy-local.sh
   ```

   If a step fails it stops and names it.

3. **Windows shortcuts.** Copy `scripts/windows/personal-os-start.cmd` and
   `personal-os-stop.cmd` from the WSL folder (in Explorer, `\\wsl$\<distro>\...`)
   to a Windows folder, then right-click each → _Send to → Desktop (create
   shortcut)_. They use your default WSL distribution; to pin one, add
   `-d <name>` after `wsl.exe` (name from `wsl -l -v`), as the comment in each
   file explains. If the instance is not in the default directory, edit
   `APP_DIR` at the top of each file.

4. **First start.** Double-click the start shortcut, or run
   `bash ~/apps/personal-os/scripts/start.sh`. It waits until the app answers and
   then opens `http://localhost:<port>`. If it fails, the window stays open with
   the reason. The app log is `<data dir>/logs/app.log` (rotated at 5 MB, 3 kept).

5. **Check the first backup.** `<data dir>/backups` must contain a file ending in
   `-startup.sqlite`, and the mirror folder the same. The app must show no
   warning banner (`/api/backups/status` has the details).

6. **Stop** with the stop shortcut or `bash ~/apps/personal-os/scripts/stop.sh`.
   It waits for the app to close its database; it never force-kills.

7. **Rehearse a deployment** (before updating, whenever the new build has
   migrations). From the build you are about to deploy (your development clone,
   updated), run:

   ```sh
   git checkout main && git pull --ff-only && npm ci
   bash scripts/rehearse-migration.sh          # add --keep to keep the copy
   ```

   The helper uses the `node_modules` of the dev clone and the migrations of
   the checked-out branch, hence the commands above. The script takes your
   newest local backup, copies it to a temporary folder, applies this build's
   migrations to the copy and prints a table (table, rows before, rows after,
   difference) and the migrations applied. Differences must be 0 or positive
   and the exit code 0; if a migration fails or a table loses rows it exits
   non-zero: do not deploy. Mind that it compares ROW COUNTS only: a migration
   that deletes N rows and inserts N others, or empties a column, still shows 0.
   It never opens your live database; the backup file is only read (copied
   and compared), and it writes nowhere but the temporary folder (deleted
   afterwards; with `--keep` its path is printed, and that folder holds the
   migrated copy and possibly its `-wal`/`-shm` files). The app may be
   running. It reads the instance config like `start.sh`.

8. **Update after merging a PR:** stop the app, run
   `bash ~/apps/personal-os/scripts/deploy-local.sh`, start it again. The deploy
   refuses to run while the app is up, or if the instance directory has local
   changes (it must stay a clean copy of `main`). Migrations run on start, after
   a `-pre-migration` backup.

Do not start the real instance on a port another process uses (`npm run dev`
uses 5310; the e2e suite uses 5321–5324): keep `PORT` in the instance config
distinct, as in step 1.

### Backups: what is kept

A backup is taken on every start, every 24 hours and before each migration,
into `<data dir>/backups` and the mirror. After each one, both places are
trimmed with the same rules (days and months in Europe/Andorra time):

- every backup of the last 48 hours;
- the newest of each day, for the last 60 days;
- the newest of each month, forever;
- the 10 newest `-pre-migration` and the 10 newest `-before-restore`, whatever their age.

So restarting the app many times in a day never pushes out yesterday, last
week or last month. `/api/backups/status` shows the oldest restorable date
and how many backups each rule keeps, locally and in the mirror.

### Restore a backup

1. **Stop the app**: the stop shortcut, or `bash ~/apps/personal-os/scripts/stop.sh`.
   The script refuses to run while the app is up.
2. **List the backups**, newest first, with date (Andorra time) and type:

   ```sh
   bash ~/apps/personal-os/scripts/restore.sh            # local copies
   bash ~/apps/personal-os/scripts/restore.sh --mirror   # copies on the second disk
   ```

3. **Restore one** by its file name from the list (add `--mirror` for the mirror):

   ```sh
   bash ~/apps/personal-os/scripts/restore.sh personal-os-20261124T030000000Z-daily.sqlite
   ```

   Before anything changes, the script checks that the file is a healthy SQLite
   database and aborts with a message if it is not. Then it saves the current
   database as `<data dir>/backups/personal-os-<time>-before-restore.sqlite`
   and puts the chosen backup in its place. The `-before-restore` copy is how
   you undo a restore: restore that file the same way.

4. **Start the app** again. Migrations newer than the backup run on start,
   after their own `-pre-migration` backup.

Try it once on a quiet day, so you know a backup restores before you need it.

### Install as an app

The app can be installed from Edge or Chrome, so it opens in its own window from the Start
menu like a desktop application. It is still the same local server: nothing is cached for
offline use, and the app needs the server to be running.

1. **Start the instance** (the start shortcut, or `bash ~/apps/personal-os/scripts/start.sh`),
   after a deploy that includes this change (`scripts/deploy-local.sh`): the icons are made by
   the build.
2. **Install it.** Open `http://localhost:<port>` (the `PORT` of your instance config).
   - Edge: the install icon at the right of the address bar, or `…` → _Apps_ → _Install this
     site as an app_.
   - Chrome: the install icon in the address bar, or `⋮` → _Cast, save and share_ →
     _Install page as app_.

   Confirm "Personal OS". It now appears in the Start menu; right-click it for _Pin to taskbar_
   or _Pin to Start_. The installed app belongs to that exact address, so if you change `PORT`
   you install it again.

3. **Start it automatically when you sign in** (optional). In PowerShell, from the Windows side:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File "\\wsl$\<distro>\home\<you>\apps\personal-os\scripts\windows\install-autostart.ps1"
   ```

   (`<distro>` is the name from `wsl -l -v`, `<you>` your Linux user.) It registers a task called
   `PersonalOS-Autostart` for your user only, with no administrator rights, that runs
   `scripts/start.sh` inside WSL at logon with no visible window, and prints what it did. Running
   it twice leaves one task. Options: `-Distribution <name>` to pin a WSL distribution, `-AppDir`
   if the instance is not in `$HOME/apps/personal-os` (keep the single quotes around the value).
   The task only starts the server: open the installed app yourself. At logon a console window may
   flash for a moment before it is hidden; that is normal.

   To try it without signing out: `Start-ScheduledTask -TaskName PersonalOS-Autostart`, then open
   the app. If it does not start, `Get-ScheduledTaskInfo -TaskName PersonalOS-Autostart` shows
   the last result, and the app log is `<data dir>/logs/app.log`.

4. **Turn autostart off:** run `uninstall-autostart.ps1` the same way. It removes the task
   (and says so if there was none); an app that is already running keeps running. To remove the
   installed app itself, use `edge://apps` or `chrome://apps` (or right-click it in the Start
   menu → _Uninstall_).
