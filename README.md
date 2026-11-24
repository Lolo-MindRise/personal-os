# personal-os

Personal management app (personal finance first). Local web app: a single
Node.js process serves the API and the built frontend on `127.0.0.1`.

Architecture and rules: `docs/decisions/` and `CLAUDE.md`.

## Requirements

- Node.js LTS, the version in `.nvmrc` (`nvm use`).
- npm (bundled with Node.js).

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
Ubuntu/WSL also its system libraries: `sudo env "PATH=$PATH" npx playwright install-deps chromium`.

## Layout

```
scripts/      start, stop and deploy scripts for the real instance (+ Windows shortcuts)
config/       instance.env.example (template of the real instance's settings)
src/server/   Fastify API (health endpoint, static serving in production)
src/web/      React + Vite frontend (UI text in es-ES)
e2e/          Playwright smoke tests (dev and production servers)
```

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
   and `PORT` (default 5310). Another file can be used with
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

7. **Update after merging a PR:** stop the app, run
   `bash ~/apps/personal-os/scripts/deploy-local.sh`, start it again. The deploy
   refuses to run while the app is up, or if the instance directory has local
   changes (it must stay a clean copy of `main`). Migrations run on start, after
   a `-pre-migration` backup.

Do not start the real instance while a test run (`npm run test:e2e`,
`npm run dev`) uses the same port: set a different `PORT` in the instance config
if you need both at once.
