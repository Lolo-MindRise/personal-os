import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DATA_DIR_ENV, DEV_DB_PATH } from './config.js';
import { openDatabase } from './index.js';
import { seed } from './seed.js';

/**
 * Throws unless this is plainly a development environment: not production and
 * no data directory configured (that variable points at real data).
 */
export function assertDevEnvironment(env: Record<string, string | undefined>): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('db:reset is for development only; refusing to run when NODE_ENV=production.');
  }
  const dataDir = env[DATA_DIR_ENV];
  if (dataDir !== undefined && dataDir !== '') {
    throw new Error(
      `db:reset is for development only; refusing to run while ${DATA_DIR_ENV} is set (it points at real data). Unset it first.`,
    );
  }
}

/** Deletes the database file (and its WAL/SHM side files), then recreates and seeds it. */
export function resetDevDatabase(
  env: Record<string, string | undefined>,
  dbPath: string = DEV_DB_PATH,
): void {
  assertDevEnvironment(env);
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${dbPath}${suffix}`, { force: true });
  }
  const handle = openDatabase(dbPath);
  try {
    seed(handle.db);
  } finally {
    handle.close();
  }
}

// `npm run db:reset`
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  resetDevDatabase(process.env);
  console.log(`Development database reset and seeded: ${DEV_DB_PATH}`);
}
