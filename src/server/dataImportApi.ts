import { eq, getTableName, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_ACCOUNT_ID, DEFAULT_ACCOUNT_NAME } from '../shared/constants.js';
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
export function hasData(db: Pick<Db, 'get'>): boolean {
  return ORDERED_TABLES.some(({ name, table }) => {
    const where = name === 'accounts' ? sql` WHERE id <> ${DEFAULT_ACCOUNT_ID}` : sql``;
    const row = db.get<{ found: number }>(
      sql`SELECT EXISTS (SELECT 1 FROM ${table}${where}) AS found`,
    );
    return row.found === 1;
  });
}

/** The Principal account exactly as the migration creates it in an empty database. */
const DEFAULT_PRINCIPAL = {
  name: DEFAULT_ACCOUNT_NAME,
  type: 'bank',
  cents: 0,
  date: '2025-12-31',
};

/** True when account 1 was renamed or given another type, opening balance or date. */
export function principalEdited(db: Pick<Db, 'get'>): boolean {
  const row = db.get<{ name: string; type: string; cents: number; date: string } | undefined>(
    sql`SELECT name, type, opening_balance_cents AS cents, opening_balance_date AS date FROM accounts WHERE id = ${DEFAULT_ACCOUNT_ID}`,
  );
  return (
    row === undefined ||
    row.name !== DEFAULT_PRINCIPAL.name ||
    row.type !== DEFAULT_PRINCIPAL.type ||
    row.cents !== DEFAULT_PRINCIPAL.cents ||
    row.date !== DEFAULT_PRINCIPAL.date
  );
}

/** Thrown inside the import transaction when the database is not empty; rolls it back. */
export class ImportRefusedError extends Error {
  constructor(readonly userMessage: string) {
    super('import refused');
  }
}

/**
 * What is safe to log about a failed import: a short code and the innermost cause's message.
 * Never the query, its parameters or row contents (Drizzle puts them in its error message).
 */
export function safeErrorSummary(error: unknown): string {
  let inner: unknown = error;
  for (let i = 0; i < 5 && inner instanceof Error && inner.cause instanceof Error; i += 1) {
    inner = inner.cause;
  }
  if (!(inner instanceof Error)) {
    return 'UNKNOWN';
  }
  const code = (inner as { code?: unknown }).code;
  const codeText = typeof code === 'string' ? code : 'UNKNOWN';
  // A Drizzle error without a cause carries the query and its parameters: code only.
  if (inner.message.startsWith('Failed query') || inner.name === 'DrizzleQueryError') {
    return codeText;
  }
  return `${codeText}: ${inner.message}`;
}

/** SQLite allows 999 bound variables in older builds; stay under it. */
const VARIABLE_BUDGET = 900;

/**
 * Writes a validated file in one transaction: accounts first (replacing Principal), then the rest
 * in dependency order, then the AUTOINCREMENT counters. Throws, rolling back, on any failure.
 */
export function importData(db: Db, file: DataFile): DataImportResultDto {
  return db.transaction((tx) => {
    if (hasData(tx)) {
      throw new ImportRefusedError(DATA_MESSAGES.notEmpty);
    }
    if (principalEdited(tx)) {
      throw new ImportRefusedError(DATA_MESSAGES.principalEdited);
    }
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
    scope.setErrorHandler((error: { code?: string; statusCode?: number }, request, reply) => {
      if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
        return reply.code(413).send({ error: DATA_MESSAGES.tooBig });
      }
      if (error.statusCode === 400 && error.code?.startsWith('FST_ERR_CTP_') === true) {
        return badRequest(reply, DATA_MESSAGES.notJson);
      }
      const status =
        error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500
          ? error.statusCode
          : 500;
      request.log.error(`data import: ${error.code ?? 'error'}`);
      return reply.code(status).send({
        error: status === 415 ? DATA_MESSAGES.wrongType : DATA_MESSAGES.failed,
      });
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
      try {
        return importData(db, parsed.data);
      } catch (error) {
        if (error instanceof ImportRefusedError) {
          return conflict(reply, error.userMessage);
        }
        request.log.error(`data import failed: ${safeErrorSummary(error)}`);
        return badRequest(reply, DATA_MESSAGES.failed);
      }
    });
    done();
  });
}
