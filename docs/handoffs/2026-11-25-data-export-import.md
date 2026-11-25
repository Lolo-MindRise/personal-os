# Handoff 2026-11-25: Full data export and import (plan 0002, task 06)

Branch `agent/0002/06-data-export-import` (from `integration/0002-insights-and-accounts`).

## Done
- `src/shared/dataFile.ts`: file format v1 (`app`, `formatVersion`, `exportedAt`, `tables`,
  `sequences`), Zod row schema per table, `TABLE_INSERT_ORDER`, `referenceProblems` (pure
  cross-table validation, Spanish messages), `MAX_IMPORT_BYTES` (25 MiB), messages.
- `src/server/dataTables.ts`: table list derived from the Drizzle schema exports.
- `GET /api/data/export` (`dataExportApi.ts`), `POST /api/data/import` (`dataImportApi.ts`):
  validate shape and references, refuse a database with data (409), write in one transaction.
- Copias screen: "Exportar datos" (browser download, nothing written on the server) and "Importar
  datos" with the warning (new installation, not a restore, README "Restore a backup").
- Tests (`dataTransfer.test.ts`): schema tables and columns vs the file definition, insert order
  vs foreign keys, round trip through temp-dir database files comparing every table row by row
  (primary key order) and the counters, refusals, 14 invalid-file cases leave the database
  untouched, rollback, malformed JSON, body limit. Web: `dataTransfer.test.tsx`.
- Docs: data-model section, glossary rows.

## Decisions taken
- `sqlite_sequence` is exported and restored: ids freed before the export are not reused after the
  import (tags and every other AUTOINCREMENT table). The round-trip test compares it.
- Principal (id 1) is deleted and re-inserted from the file; the file must contain account 1.
- "Empty" is stricter than the brief: any row in any table, or any account other than id 1,
  refuses the import (ids would collide; clearing would silently delete data).
- Tables keyed by SQL name; row keys are Drizzle property names (camelCase).
- Body limit 25 MiB (route option); the client also checks the size.

## Open
- Reviewer not run by me; the orchestrator runs it.
- Adding a table later: update `ROW_SCHEMAS`, `TABLE_INSERT_ORDER`, `referenceProblems`; tests fail
  until then.
