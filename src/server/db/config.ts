import { join, resolve } from 'node:path';

export const DATA_DIR_ENV = 'PERSONAL_OS_DATA_DIR';
export const DB_FILENAME = 'personal-os.sqlite';

/** Dev database: a gitignored file inside the repo (`*.sqlite` is in .gitignore). */
export const DEV_DB_PATH = resolve(import.meta.dirname, '../../../.dev-data', DB_FILENAME);

/** Migrations are committed at the repo root; the same relative path works from src/ and dist/. */
export const MIGRATIONS_DIR = resolve(import.meta.dirname, '../../../drizzle');

/**
 * Where the database file lives (ADR-0003).
 * - production: inside PERSONAL_OS_DATA_DIR; refuses to start without it.
 * - otherwise: the gitignored dev file.
 */
export function resolveDbPath(env: Record<string, string | undefined>): string {
  if (env.NODE_ENV === 'production') {
    const dir = env[DATA_DIR_ENV];
    if (dir === undefined || dir.trim() === '') {
      throw new Error(
        `${DATA_DIR_ENV} is not set. In production the database lives in that directory (ADR-0003); refusing to start.`,
      );
    }
    return join(dir, DB_FILENAME);
  }
  return DEV_DB_PATH;
}

export const BACKUP_MIRROR_ENV = 'PERSONAL_OS_BACKUP_MIRROR_DIR';
export const BACKUPS_DIRNAME = 'backups';

export interface BackupConfig {
  /** Local backups: `<PERSONAL_OS_DATA_DIR>/backups`. */
  dir: string;
  /** Optional second location (a different disk); undefined when not configured. */
  mirrorDir: string | undefined;
}

/**
 * Backup locations (ADR-0003), both from the environment. Backups only run in
 * production, where the data directory exists; development has none.
 */
export function resolveBackupConfig(
  env: Record<string, string | undefined>,
): BackupConfig | undefined {
  const dataDir = env[DATA_DIR_ENV];
  if (env.NODE_ENV !== 'production' || dataDir === undefined || dataDir.trim() === '') {
    return undefined;
  }
  const mirror = env[BACKUP_MIRROR_ENV];
  return {
    dir: join(dataDir, BACKUPS_DIRNAME),
    mirrorDir: mirror === undefined || mirror.trim() === '' ? undefined : mirror,
  };
}
