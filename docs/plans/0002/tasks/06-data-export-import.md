# Task 0002-06: Full data export and import

**Branch:** `agent/0002/06-data-export-import`
**ADRs:** 0002; plan `docs/plans/0002-insights-and-accounts.md`; the backup ADR/README "Restore a backup"
**Depends on:** 01, 03 and 04 merged (it must cover every table, including accounts, transfers, tags). Runs after 05 if 05 is still running only when areas do not overlap.
**Touches:** a new `src/server/dataExportApi.ts` / `dataImportApi.ts` (+ registration), a new `src/shared/dataFile.ts` (format, Zod schema), `src/web/BackupsPage.tsx` (import entry and warning), a client-side download helper, `docs/ui-glossary.md`, tests. No schema change.

## Goal

Make data portable: one JSON file out, the same data in on a new
installation.

## Scope

1. "Exportar datos": one JSON file with every table (derive the table list
   from the schema so a forgotten table fails a test), a format version and
   the export date. Downloaded from the browser; nothing written on the server.
2. "Importar datos": accepted **only when the database has no movements,
   categories or recurring items**; otherwise refused with a clear Spanish
   message and nothing written.
2b. **Accounts note (from the task 01 review).** Every freshly migrated
   database already contains the account "Principal" (id 1), and
   `movements.account_id` is enforced by triggers (migration 0006: unknown
   account rejected; deleting an account that has movements is blocked).
   The importer must therefore replace or upsert account id 1, insert
   accounts before movements (and transfers, tags), and delete in the
   reverse order when it has to clear anything. The "database is empty"
   check ignores the default Principal account. Test it.
2c. **Tags and AUTOINCREMENT notes (from the task 04 review).** The table list
   must include `tags` and `movement_tags` (derive it from the schema).
   Insert order: accounts, tags, movements, movement_tags, transfers (and
   everything else with its references first); clear in reverse (deleting
   tags or movements cascades to the links anyway). `movement_tags` has no
   `id`: its primary key is (movement_id, tag_id), so the row-by-row
   comparison sorts by that pair. `tags.name_key` is computed with
   `tagKey(name)`: export it, and on import check it equals `tagKey(name)`;
   duplicate keys make the file invalid before anything is written. Keep the
   original ids of every table; decide and record whether `sqlite_sequence`
   must match for the round trip to count as identical (AUTOINCREMENT tables
   include tags). Validate that every `movement_tags` row points to a
   movement and a tag present in the file, and every movement's `account_id`
   to an account in the file (accounts have no FK from movements: triggers
   enforce it, see migration 0006) and every transfer's two accounts.
3. Validate the whole file (version, shape, references between tables)
   before writing anything; write all or nothing in one transaction; an
   invalid file leaves the database untouched (test).
4. **Round trip:** export, reset a development database, import: the
   database is identical (test comparing every table row by row, including
   ids and ordering-sensitive data).
5. The importer is reached from "Copias" with a visible warning that it is
   for moving to a new installation, not for restoring backups; point to the
   README "Restore a backup" as the way to restore.
6. Never use real data; fixtures only. The import file size is bounded
   (record the limit).

## Out of scope

Restoring backups, merging into non-empty databases, schema changes, new
dependencies.

## Manual test

None (everything covered by tests); Manuel may try an export/import between
two development databases.

## Done when

- Both CI jobs pass on the PR; reviewer verdicts in the PR.
- Import into a database with data is refused (test).

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
