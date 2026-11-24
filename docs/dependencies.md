# Dependencies

Register of every dependency added to the project. A dependency without an
entry here must not be merged.

| Package | Version | Added in | Why | Alternatives considered |
|---------|---------|----------|-----|-------------------------|
| `fastify` | 5.12.8 | Task 0001 | HTTP server for the API and the built frontend (ADR-0002). | Express (slower, weaker TypeScript types), Hono (less mature Node static serving). Chosen in ADR-0002. |
| `@fastify/static` | 10.1.12 | Task 0001 | Serves the built frontend from Fastify in production. | Hand-written static handler (more code to secure: path traversal, MIME types, caching). |
| `react` | 19.3.1 | Task 0001 | UI library (ADR-0002). | Chosen in ADR-0002. |
| `react-dom` | 19.3.1 | Task 0001 | Renders React in the browser. | Required by React. |
| `typescript` (dev) | 6.0.3 | Task 0001 | Strict typing everywhere (ADR-0002). | 7.x (native port) is out, but `typescript-eslint` 8.74 only supports `<6.1`; revisit when it supports 7. |
| `@types/node` (dev) | 26.6.6 | Task 0001 | Node.js type definitions, matching Node 26 LTS in `.nvmrc`. | None. |
| `@types/react` (dev) | 19.3.0 | Task 0001 | React type definitions. | None. |
| `@types/react-dom` (dev) | 19.3.0 | Task 0001 | React DOM type definitions. | None. |
| `vite` (dev) | 8.3.8 | Task 0001 | Frontend dev server and bundler (ADR-0002). | Chosen in ADR-0002. |
| `@vitejs/plugin-react` (dev) | 6.3.0 | Task 0001 | JSX transform and Fast Refresh for Vite. | `@vitejs/plugin-react-swc` (extra native binary, no benefit at this size). |
| `vitest` (dev) | 5.1.1 | Task 0001 | Unit and integration tests (ADR-0002). | Chosen in ADR-0002. |
| `tsx` (dev) | 4.23.15 | Task 0001 | Runs the TypeScript server in dev with watch/reload. | Node native type stripping (no watch-mode reload story as clean, no `tsconfig` path support), `ts-node` (slower, ESM friction). |
| `concurrently` (dev) | 10.0.7 | Task 0001 | `npm run dev` starts API and Vite together with labelled output. | Shell `&` (orphaned processes on Ctrl-C), `@fastify/vite` (couples dev server into Fastify, more setup). |
| `eslint` (dev) | 10.15.0 | Task 0001 | Linting (task 0001). | Biome (single tool, but weaker type-aware rules than typescript-eslint). |
| `@eslint/js` (dev) | 10.0.1 | Task 0001 | ESLint's recommended JavaScript rules. | None. |
| `typescript-eslint` (dev) | 8.74.0 | Task 0001 | Type-aware TypeScript lint rules (`strictTypeChecked`). | None for type-aware rules. |
| `eslint-plugin-react-hooks` (dev) | 7.1.1 | Task 0001 | Enforces the rules of hooks in React code. | None. |
| `globals` (dev) | 17.14.0 | Task 0001 | Browser/Node global definitions for ESLint flat config. | Listing globals by hand. |
| `prettier` (dev) | 3.10.1 | Task 0001 | Code formatting (task 0001). | Biome formatter (see ESLint row). |
| `eslint-config-prettier` (dev) | 10.1.8 | Task 0001 | Turns off ESLint rules that conflict with Prettier. | None. |
| `better-sqlite3` | 13.2.0 | Task 0004 | SQLite driver (ADR-0002): synchronous, fast, has the online backup API planned in ADR-0003. Ships a prebuilt binary; works on Node 26. | `node:sqlite` (built in, but ADR-0002 chose `better-sqlite3` and Drizzle's driver targets it), `sql.js` (in-memory WASM, wrong fit for a file DB). |
| `drizzle-orm` | 0.45.4 | Task 0004 | Typed schema and queries, migration runner (ADR-0002). | Kysely (no schema/migration generator), raw SQL (no types). Chosen in ADR-0002. |
| `zod` | 4.6.7 | Task 0004 | Validation schemas shared by API and frontend (ADR-0002). | Valibot (smaller, but ADR-0002 chose Zod). |
| `drizzle-kit` (dev) | 0.31.11 | Task 0004 | Generates SQL migrations from the schema. Not used at runtime. | Hand-written migrations (error-prone, no schema diff). Pulls extra `esbuild` copies, dev only. |
| `@types/better-sqlite3` (dev) | 9.6.0 | Task 0004 | Type definitions for `better-sqlite3`. | None. |
| (none added) | | Task 0010 | Task 0010 adds no package and does not touch the lockfile; see the two sections below. | |

## `npm audit` (task 0010, 2026-11-24, npm 11.20)

`npm audit --omit=dev` (what runs in production): **0 vulnerabilities.**
`npm audit` (everything): 4 moderate findings, all one advisory chain, **development tooling only**.

| Package | Severity | Advisory | Reaches production? | Why it is not fixed |
|---------|----------|----------|---------------------|---------------------|
| `esbuild` 0.18.20 (via `@esbuild-kit/core-utils`) | moderate | GHSA-67mh-4wv8-2f99: any website can send requests to esbuild's development server and read the answer | No. Dev dependency of `drizzle-kit`; esbuild's own dev server (`serve`) is never started, only its transform API when `npm run db:generate` runs. | The only fix npm offers is `drizzle-kit@0.18.1`, a major **downgrade** (0.31.11 today) that would break the migration tooling. Wait for a `drizzle-kit` release that drops `@esbuild-kit`. |
| `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader` | moderate | Depend on the vulnerable esbuild above | No (same chain) | Same as above. |
| `drizzle-kit` 0.31.11 | moderate | Depends on the vulnerable chain | No (dev only, not in `dist/`) | Same as above. |

The other two `esbuild` copies (0.25.12 under `drizzle-kit`, 0.28.2 under `vite` and `tsx`) are not affected.
Revisit at the next dependency update.

## Install scripts (task 0010)

npm 11.20 blocks dependency install scripts unless `allowScripts` in
`package.json` covers them. Committed decision (`npm install-scripts ...`):

| Package | Decision | Why |
|---------|----------|-----|
| `better-sqlite3@13.2.0` | **allowed**, pinned to this version | Its `install` script (`node-gyp rebuild`) builds the native module; it needs `build-essential` (README, Prerequisites). Without approval a platform with no matching prebuilt binary would fail at runtime. A new version needs a new, reviewed approval. |
| `esbuild` (0.18.20, 0.25.12, 0.28.2) | **denied** (all versions) | The postinstall only checks the binary; the platform binary arrives as an optional dependency. Verified: a clean `npm ci` with it denied still builds and passes all 661 unit tests. |

Any other package that adds an install script is skipped and listed by npm,
and `npm install-scripts ls` shows it for review. Verified in a clean copy: `npm ci --foreground-scripts`
runs `better-sqlite3`'s `node-gyp rebuild`, builds and loads it, and leaves no unapproved scripts.
CI runs the same `npm ci`; its result is in the PR checks.
| `@playwright/test` (dev) | 1.65.1 | Task 0006 | Browser smoke tests of the dev and production servers (ADR-0002 lists Playwright). Downloads Chromium only, to `~/.cache/ms-playwright`; CI installs it with `--with-deps`. | Cypress (heavier, own runner and server model), Puppeteer (no test runner, no auto-waiting assertions), Vitest browser mode (still needs a browser provider, and does not start the real servers). |
