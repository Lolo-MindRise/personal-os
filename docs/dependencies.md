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
