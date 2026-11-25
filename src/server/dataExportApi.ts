import { asc, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  DATA_FILE_APP,
  DATA_FILE_VERSION,
  ROW_SCHEMAS,
  type DataFile,
} from '../shared/dataFile.js';
import type { Db } from './db/index.js';
import { ORDERED_TABLES, primaryKeyColumns } from './dataTables.js';

/** Last id handed out by each table that has one (sqlite_sequence), limited to known tables. */
export function readSequences(db: Db): Record<string, number> {
  const rows = db.all<{ name: string; seq: number }>(sql`SELECT name, seq FROM sqlite_sequence`);
  return Object.fromEntries(
    rows.filter((r) => r.name in ROW_SCHEMAS).map((r) => [r.name, r.seq] as const),
  );
}

/** Every row of every table, in primary key order, with the format version and the date. */
export function exportData(db: Db, now: Date = new Date()): DataFile {
  const tables: Record<string, unknown[]> = {};
  for (const { name, table } of ORDERED_TABLES) {
    tables[name] = db
      .select()
      .from(table)
      .orderBy(...primaryKeyColumns(table).map((column) => asc(column)))
      .all();
  }
  return {
    app: DATA_FILE_APP,
    formatVersion: DATA_FILE_VERSION,
    exportedAt: now.toISOString(),
    tables: tables as DataFile['tables'],
    sequences: readSequences(db),
  };
}

/** `GET /api/data/export`: the browser saves the answer as a file; nothing is written here. */
export function registerDataExportApi(app: FastifyInstance, db: Db): void {
  app.get('/api/data/export', () => exportData(db));
}
