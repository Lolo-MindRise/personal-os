# Handoff 2026-11-25: Overnight run (task 0008)

Stacked PRs: block 1 branches from `main`, each later block from the previous
block's branch. This file accumulates one section per block.

## Block 1: Categories screen
Branch `agent/overnight/01-categories` (from `main`; task 0007 confirmed merged, PR #15).

### Done
- API (`src/server/categoriesApi.ts`): `POST /api/categories`, `PATCH /api/categories/:id`
  (rename only), `DELETE /api/categories/:id`, `GET /api/categories/usage` (counts of
  movements, recurring items and budget lines per category).
- Screen "Categorías": three sections by kind, add form, rename (kind locked), delete.
  A category in use shows why ("En uso: 2 movimientos, 1 fijo…") and its Eliminar is disabled;
  the API also answers `409` if a race makes it in use.
- Playwright: every spec except `dev.spec.ts` now runs in the prod project (`testIgnore`).
- No migration (no schema change).

### Decisions taken
- Name uniqueness is also checked ignoring case and spaces (`Ocio` vs `ocio`), on top of
  the DB's exact unique constraint. `409` on a duplicate.
- Renaming never changes the kind (`400` if sent): movements and fixed items depend on it.
- Usage counts live in a separate endpoint so `GET /api/categories` keeps its shape.

- Playwright prod project now runs every spec except `dev.spec.ts` (was an allowlist), so
  future specs run against the production server by default.

### Review
- Reviewer: changes required. Blocker: handoff missing from the diff (it was written after
  the commit reviewed; now included). Minor: N+1 in the usage endpoint, fixed with one grouped
  query per table. Other minors are recorded above under Decisions taken.

### Open questions
- None.

### PR
(filled in when opened)
