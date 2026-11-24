import { copyFile, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { BackupStatusDto } from '../shared/api.js';

// In-app backups (ADR-0003): SQLite's online backup API, written to a local
// directory and optionally copied to a mirror. Locations come from the caller
// (environment variables); nothing here knows a real path.

export const KEEP_LOCAL = 14;
export const KEEP_MIRROR = 7;
export const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type BackupReason = 'startup' | 'daily' | 'pre-migration';

const FILE_PATTERN = /^personal-os-(\d{8}T\d{9}Z)-(startup|daily|pre-migration)\.sqlite$/;

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

async function prune(dir: string, keep: number): Promise<void> {
  for (const name of (await listBackups(dir)).slice(keep)) {
    await rm(join(dir, name), { force: true });
  }
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface BackupServiceOptions {
  sqlite: Database.Database;
  dir: string;
  mirrorDir?: string | undefined;
  now?: () => Date;
  keepLocal?: number;
  keepMirror?: number;
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
  status: () => Promise<BackupStatusDto>;
}

export function createBackupService(options: BackupServiceOptions): BackupService {
  const {
    sqlite,
    dir,
    mirrorDir,
    now = () => new Date(),
    keepLocal = KEEP_LOCAL,
    keepMirror = KEEP_MIRROR,
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

  async function copyToMirror(name: string): Promise<void> {
    if (mirrorDir === undefined) {
      return;
    }
    try {
      await mkdir(mirrorDir, { recursive: true });
      const target = join(mirrorDir, name);
      await copyFile(join(dir, name), `${target}.partial`);
      await rename(`${target}.partial`, target);
      await prune(mirrorDir, keepMirror);
      mirrorError = undefined;
    } catch (error) {
      mirrorError = messageOf(error);
      log(`Backup mirror unreachable: ${mirrorError}`);
    }
  }

  async function backupNow(reason: BackupReason): Promise<BackupResult> {
    const name = `personal-os-${stamp(now())}-${reason}.sqlite`;
    const target = join(dir, name);
    try {
      await mkdir(dir, { recursive: true });
      // Written under a temporary name, so a crash never leaves a half file that counts as a backup.
      await sqlite.backup(`${target}.partial`);
      await rename(`${target}.partial`, target);
      await prune(dir, keepLocal);
      localError = undefined;
    } catch (error) {
      // Best effort: the directory itself may be what failed.
      await rm(`${target}.partial`, { force: true }).catch(() => undefined);
      localError = messageOf(error);
      log(`Backup failed: ${localError}`);
      return { ok: false, error: localError };
    }
    // The local copy is safe; the mirror is best effort.
    await copyToMirror(name);
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
      const mirrorFiles = mirrorDir === undefined ? [] : await listBackups(mirrorDir);
      return {
        enabled: true,
        lastBackupAt,
        localCount: local.length,
        mirror: {
          configured: mirrorDir !== undefined,
          state: mirrorDir === undefined ? 'disabled' : mirrorError !== undefined ? 'error' : 'ok',
          count: mirrorFiles.length,
        },
        warnings,
      };
    },
  };
}
