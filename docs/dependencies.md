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
