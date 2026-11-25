import { eq, getTableName, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_ACCOUNT_ID } from '../shared/constants.js';
import {
  DATA_MESSAGES,
  MAX_IMPORT_BYTES,
  dataFileSchema,
  referenceProblems,
  shapeProblems,
  type DataFile,
  type DataImportResultDto,
} from '../shared/dataFile.js';
import { badRequest, conflict } from './apiCommon.js';
import { ORDERED_TABLES } from './dataTables.js';
import type { Db } from './db/index.js';
import { accounts } from './db/schema.js';

/**
 * True when the database holds anything an import would collide with. Every freshly migrated
 * database already has the account "Principal" (id 1), so that one account does not count; it is
 * replaced by the file's. Any other row, in any table, does (stricter than "movements, categories
 * or fixed items": ids would collide, and clearing would silently delete the user's data).
 */
export function hasData(db: Db): boolean {
  return ORDERED_TABLES.some(({ name, table }) => {
    const where = name === 'accounts' ? sql` WHERE id <> ${DEFAULT_ACCOUNT_ID}` : sql``;
    const row = db.get<{ found: number }>(
      sql`SELECT EXISTS (SELECT 1 FROM ${table}${where}) AS found`,
    );
    return row.found === 1;
  });
}

/** SQLite allows 999 bound variables in older builds; stay under it. */
const VARIABLE_BUDGET = 900;

/**
 * Writes a validated file in one transaction: accounts first (replacing Principal), then the rest
 * in dependency order, then the AUTOINCREMENT counters. Throws, rolling back, on any failure.
 */
export function importData(db: Db, file: DataFile): DataImportResultDto {
  return db.transaction((tx) => {
    tx.delete(accounts).where(eq(accounts.id, DEFAULT_ACCOUNT_ID)).run();
    const imported: Record<string, number> = {};
    for (const { name, table } of ORDERED_TABLES) {
      const rows = file.tables[name] as Record<string, unknown>[];
      const chunk = Math.max(1, Math.floor(VARIABLE_BUDGET / getTableConfig(table).columns.length));
      for (let i = 0; i < rows.length; i += chunk) {
        tx.insert(table)
          .values(rows.slice(i, i + chunk))
          .run();
      }
      imported[getTableName(table)] = rows.length;
    }
    for (const [name, seq] of Object.entries(file.sequences)) {
      const updated = tx.run(sql`UPDATE sqlite_sequence SET seq = ${seq} WHERE name = ${name}`);
      if (updated.changes === 0) {
        tx.run(sql`INSERT INTO sqlite_sequence (name, seq) VALUES (${name}, ${seq})`);
      }
    }
    return { imported };
  });
}

/**
 * `POST /api/data/import`: only into an empty database; the whole file is validated first and
 * written all or nothing. The body is limited to MAX_IMPORT_BYTES.
 */
export function registerDataImportApi(app: FastifyInstance, db: Db): void {
  void app.register((scope, _options, done) => {
    scope.setErrorHandler((error: { code?: string; statusCode?: number }, _request, reply) => {
      if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
        return reply.code(413).send({ error: DATA_MESSAGES.tooBig });
      }
      return badRequest(reply, DATA_MESSAGES.notJson);
    });

    scope.post('/api/data/import', { bodyLimit: MAX_IMPORT_BYTES }, (request, reply) => {
      const parsed = dataFileSchema.safeParse(request.body);
      if (!parsed.success) {
        return badRequest(
          reply,
          `${DATA_MESSAGES.invalid} ${shapeProblems(parsed.error).join('; ')}.`,
        );
      }
      const problems = referenceProblems(parsed.data);
      if (problems.length > 0) {
        return badRequest(reply, `${DATA_MESSAGES.invalid} ${problems.slice(0, 5).join('; ')}.`);
      }
      if (hasData(db)) {
        return conflict(reply, DATA_MESSAGES.notEmpty);
      }
      try {
        return importData(db, parsed.data);
      } catch (error) {
        request.log.error(error);
        return badRequest(reply, DATA_MESSAGES.failed);
      }
    });
    done();
  });
}
