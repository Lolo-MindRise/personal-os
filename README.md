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

| Command         | What it does                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `npm run dev`   | API with reload on `127.0.0.1:5310` + Vite dev server on `127.0.0.1:5173` (open this one).     |
| `npm run build` | Builds the frontend to `dist/web` and the server to `dist/server`.                             |
| `npm start`     | Production mode: serves the API and the built frontend on `127.0.0.1:5310`. Run `build` first. |

The port comes from the `PORT` environment variable (default `5310`).

## Check

```sh
npm run lint        # ESLint + Prettier check
npm run typecheck   # TypeScript, strict
npm test            # Vitest
npm run format      # Apply Prettier formatting
```

CI (`.github/workflows/ci.yml`) runs `npm ci`, lint, typecheck, test and
build on every pull request.

## Layout

```
src/server/   Fastify API (health endpoint, static serving in production)
src/web/      React + Vite frontend (UI text in es-ES)
```
