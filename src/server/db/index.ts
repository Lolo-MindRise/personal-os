import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { join } from 'node:path';
import { MIGRATIONS_DIR, resolveDbPath } from './config.js';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

export interface DbHandle {
  db: Db;
  /** The raw driver handle, for the online backup API. */
  sqlite: Database.Database;
  close: () => void;
}

function openSqlite(path: string): Database.Database {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return sqlite;
}

function handleOf(sqlite: Database.Database): DbHandle {
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db, sqlite, close: () => sqlite.close() };
}

/**
 * Opens a database and applies pending migrations.
 * Pass ':memory:' for tests; otherwise the file's directory is created.
 */
export function openDatabase(path: string): DbHandle {
  return handleOf(openSqlite(path));
}

/**
 * How many migrations the folder has and how many the database has applied.
 * A brand-new database has applied none.
 */
export function migrationStatus(sqlite: Database.Database): { total: number; applied: number } {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
  ) as {
    entries: unknown[];
  };
  const table = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
    )
    .get();
  const applied =
    table === undefined
      ? 0
      : (sqlite.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get() as { n: number }).n;
  return { total: journal.entries.length, applied };
}

/**
 * Like openDatabase, but calls `beforeMigrate` first when an existing database
 * (one that already applied migrations) has pending ones, so a backup can be
 * taken before the schema changes (ADR-0003). If it throws, nothing is migrated
 * and the database is closed.
 */
export async function openDatabaseGuarded(
  path: string,
  beforeMigrate: (sqlite: Database.Database) => Promise<void>,
): Promise<DbHandle> {
  const sqlite = openSqlite(path);
  try {
    const { total, applied } = migrationStatus(sqlite);
    if (applied > 0 && applied < total) {
      await beforeMigrate(sqlite);
    }
    return handleOf(sqlite);
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

/** Opens the database for the current environment (see resolveDbPath). */
export function openDatabaseFromEnv(env: Record<string, string | undefined>): DbHandle {
  return openDatabase(resolveDbPath(env));
}

export { schema };
