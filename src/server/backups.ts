import { copyFile, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type Database from 'better-sqlite3';
import type { BackupSetStatusDto, BackupStatusDto } from '../shared/api.js';
import {
  BACKUP_FILE_PATTERN,
  DEFAULT_TIME_ZONE,
  applyRetention,
  parseBackupName,
} from './retention.js';

// In-app backups (ADR-0003): SQLite's online backup API, written to a local
// directory and optionally copied to a mirror. Locations come from the caller
// (environment variables); nothing here knows a real path.

export const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type BackupReason = 'startup' | 'daily' | 'pre-migration';
// `before-restore` copies are written by scripts/restore.sh, never by the app.

const FILE_PATTERN = BACKUP_FILE_PATTERN;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** `2026-11-25T03:04:05.006Z` → `20261125T030405006Z`: sorts as text in time order. */
export function stamp(date: Date): string {
  return (
    `${String(date.getUTCFullYear())}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}` +
    `${pad(date.getUTCMilliseconds(), 3)}Z`
  );
}

/** Inverse of `stamp`; undefined when the text is not a stamp. */
export function parseStamp(text: string): string | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z$/.exec(text);
  return m === null
    ? undefined
    : `${m[1] ?? ''}-${m[2] ?? ''}-${m[3] ?? ''}T${m[4] ?? ''}:${m[5] ?? ''}:${m[6] ?? ''}.${m[7] ?? ''}Z`;
}

/** Backup files in a directory, newest first. Other files are never listed (so never deleted). */
export async function listBackups(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir))
      .filter((name) => FILE_PATTERN.test(name))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/** Applies the retention policy to a directory; the backup just created is never deleted. */
async function prune(dir: string, now: Date, timeZone: string, justCreated: string): Promise<void> {
  const entries = (await listBackups(dir)).flatMap((name) => parseBackupName(name) ?? []);
  for (const entry of applyRetention(entries, now, timeZone, justCreated).remove) {
    await rm(join(dir, entry.name), { force: true });
  }
}

async function describeSet(dir: string, now: Date, timeZone: string): Promise<BackupSetStatusDto> {
  const entries = (await listBackups(dir)).flatMap((name) => parseBackupName(name) ?? []);
  const { tiers } = applyRetention(entries, now, timeZone);
  const oldest = entries.reduce<Date | undefined>(
    (min, e) => (min === undefined || e.at < min ? e.at : min),
    undefined,
  );
  return { count: entries.length, oldestBackupAt: oldest?.toISOString() ?? null, tiers };
}

const emptySet = (): BackupSetStatusDto => ({
  count: 0,
  oldestBackupAt: null,
  tiers: { recent: 0, daily: 0, monthly: 0, preMigration: 0 },
});

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface BackupServiceOptions {
  sqlite: Database.Database;
  dir: string;
  mirrorDir?: string | undefined;
  now?: () => Date;
  /** Calendar days and months for retention; default Europe/Andorra. */
  timeZone?: string;
  intervalMs?: number;
  /** Replaceable in tests; defaults to `setInterval`. */
  schedule?: (run: () => void, ms: number) => { unref?: () => void; clear: () => void };
  /** Called with warnings worth logging. */
  log?: (message: string) => void;
}

export interface BackupResult {
  ok: boolean;
  /** The local file written, when `ok`. */
  file?: string;
  error?: string;
}

export interface BackupService {
  /** Takes a backup now. Never throws; failures are in the result and in `status()`. */
  runBackup: (reason: BackupReason) => Promise<BackupResult>;
  /** Starts the 24-hour timer. */
  start: () => void;
  stop: () => void;
  /** Resolves when no backup is running or queued (await before closing the database). */
  whenIdle: () => Promise<void>;
  status: () => Promise<BackupStatusDto>;
}

export function createBackupService(options: BackupServiceOptions): BackupService {
  const {
    sqlite,
    dir,
    mirrorDir,
    now = () => new Date(),
    timeZone = DEFAULT_TIME_ZONE,
    intervalMs = BACKUP_INTERVAL_MS,
    log = () => undefined,
  } = options;
  const schedule =
    options.schedule ??
    ((run, ms) => {
      const timer = setInterval(run, ms);
      return {
        unref: () => timer.unref(),
        clear: () => {
          clearInterval(timer);
        },
      };
    });

  /** The last local failure and the last mirror failure; cleared by the next success. */
  let localError: string | undefined;
  let mirrorError: string | undefined;
  let timer: { clear: () => void } | undefined;
  /** Backups never overlap: each waits for the previous one. */
  let queue: Promise<unknown> = Promise.resolve();

  async function copyToMirror(name: string, at: Date): Promise<void> {
    if (mirrorDir === undefined) {
      return;
    }
    try {
      if (resolve(mirrorDir) === resolve(dir)) {
        // Pruning the mirror would delete local backups below the required count.
        throw new Error('el espejo no puede ser el mismo directorio que las copias locales');
      }
      // Only the last directory is created, never its parents: if the second disk is not
      // mounted, its mount point may exist as an empty folder on the main disk, and creating
      // the path below it would silently put the "mirror" on the wrong disk.
      await mkdir(mirrorDir).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
      });
      const target = join(mirrorDir, name);
      await copyFile(join(dir, name), `${target}.partial`);
      await rename(`${target}.partial`, target);
      await prune(mirrorDir, at, timeZone, name);
      mirrorError = undefined;
    } catch (error) {
      mirrorError = messageOf(error);
      log(`Backup mirror unreachable: ${mirrorError}`);
    }
  }

  async function backupNow(reason: BackupReason): Promise<BackupResult> {
    const at = now();
    const name = `personal-os-${stamp(at)}-${reason}.sqlite`;
    const target = join(dir, name);
    try {
      await mkdir(dir, { recursive: true });
      // Written under a temporary name, so a crash never leaves a half file that counts as a backup.
      await sqlite.backup(`${target}.partial`);
      await rename(`${target}.partial`, target);
      await prune(dir, at, timeZone, name);
      localError = undefined;
    } catch (error) {
      // Best effort: the directory itself may be what failed.
      await rm(`${target}.partial`, { force: true }).catch(() => undefined);
      localError = messageOf(error);
      log(`Backup failed: ${localError}`);
      return { ok: false, error: localError };
    }
    // The local copy is safe; the mirror is best effort.
    await copyToMirror(name, at);
    return { ok: true, file: name };
  }

  const runBackup = (reason: BackupReason): Promise<BackupResult> => {
    const result = queue.then(() => backupNow(reason));
    queue = result.catch(() => undefined);
    return result;
  };

  return {
    runBackup,
    start() {
      if (timer !== undefined) {
        return;
      }
      const handle = schedule(() => {
        void runBackup('daily');
      }, intervalMs);
      handle.unref?.();
      timer = handle;
    },
    stop() {
      timer?.clear();
      timer = undefined;
    },
    whenIdle: () => queue.then(() => undefined),
    async status() {
      const local = await listBackups(dir);
      const newest = local[0];
      const lastBackupAt =
        newest === undefined ? null : (parseStamp(FILE_PATTERN.exec(newest)?.[1] ?? '') ?? null);
      const warnings: string[] = [];
      if (localError !== undefined) {
        warnings.push(`La última copia de seguridad ha fallado: ${localError}`);
      }
      if (mirrorError !== undefined) {
        warnings.push(`No se puede acceder a la copia de reserva (espejo): ${mirrorError}`);
      }
      if (lastBackupAt === null && localError === undefined) {
        warnings.push('Todavía no hay ninguna copia de seguridad.');
      }
      const at = now();
      const localSet = await describeSet(dir, at, timeZone);
      const mirrorSet =
        mirrorDir === undefined ? emptySet() : await describeSet(mirrorDir, at, timeZone);
      return {
        enabled: true,
        lastBackupAt,
        localCount: localSet.count,
        oldestBackupAt: localSet.oldestBackupAt,
        tiers: localSet.tiers,
        mirror: {
          configured: mirrorDir !== undefined,
          state: mirrorDir === undefined ? 'disabled' : mirrorError !== undefined ? 'error' : 'ok',
          ...mirrorSet,
        },
        warnings,
      };
    },
  };
}
