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
src/server/   Fastify API (health endpoint, static serving in production)
src/web/      React + Vite frontend (UI text in es-ES)
e2e/          Playwright smoke tests (dev and production servers)
```
