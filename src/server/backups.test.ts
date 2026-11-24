import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BackupStatusDto } from '../shared/api.js';
import { buildApp } from './app.js';
import {
  BACKUP_INTERVAL_MS,
  createBackupService,
  listBackups,
  parseStamp,
  stamp,
  type BackupService,
} from './backups.js';
import { resolveBackupConfig } from './db/config.js';
import { migrationStatus, openDatabase, openDatabaseGuarded } from './db/index.js';

let root: string;
let sqlite: Database.Database;
let clock: number;

const dirs = () => ({ local: join(root, 'backups'), mirror: join(root, 'mirror') });
const tick = () => new Date((clock += 1_000));

function service(extra: Partial<Parameters<typeof createBackupService>[0]> = {}): BackupService {
  return createBackupService({
    sqlite,
    dir: dirs().local,
    now: tick,
    ...extra,
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'personal-os-backup-test-'));
  clock = Date.UTC(2026, 10, 25, 3, 0, 0);
  sqlite = new Database(join(root, 'live.sqlite'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('one');");
});
afterEach(() => {
  sqlite.close();
  rmSync(root, { recursive: true, force: true });
});

describe('stamp', () => {
  it('sorts in time order and round-trips', () => {
    const a = stamp(new Date('2026-11-25T03:04:05.006Z'));
    expect(a).toBe('20261125T030405006Z');
    expect(parseStamp(a)).toBe('2026-11-25T03:04:05.006Z');
    expect(stamp(new Date('2026-12-01T00:00:00.000Z')) > a).toBe(true);
    expect(parseStamp('nope')).toBeUndefined();
  });
});

describe('runBackup', () => {
  it('writes a consistent, openable copy of the live database', async () => {
    const result = await service().runBackup('startup');
    expect(result.ok).toBe(true);
    expect(result.file).toMatch(/^personal-os-20261125T\d{9}Z-startup\.sqlite$/);
    // Changes after the backup are not in it.
    sqlite.exec("INSERT INTO t VALUES ('two')");
    const copy = new Database(join(dirs().local, result.file ?? ''), { readonly: true });
    expect(copy.prepare('SELECT v FROM t').all()).toEqual([{ v: 'one' }]);
    copy.close();
  });

  it('applies retention locally and never touches other files', async () => {
    mkdirSync(dirs().local, { recursive: true });
    writeFileSync(join(dirs().local, 'notes.txt'), 'mine');
    // 5 days old, a second one on the same day: only the newest of that day survives.
    const old1 = 'personal-os-20261120T080000000Z-startup.sqlite';
    const old2 = 'personal-os-20261120T090000000Z-startup.sqlite';
    writeFileSync(join(dirs().local, old1), 'x');
    writeFileSync(join(dirs().local, old2), 'x');
    const backups = service();
    await backups.runBackup('daily');
    const files = await listBackups(dirs().local);
    expect(files).toContain(old2);
    expect(files).not.toContain(old1);
    expect(files).toHaveLength(2);
    expect(readdirSync(dirs().local)).toContain('notes.txt');
    expect(readdirSync(dirs().local).some((f) => f.endsWith('.partial'))).toBe(false);
  });

  it('applies the same policy in the mirror and reports its tiers', async () => {
    mkdirSync(dirs().mirror, { recursive: true });
    const old1 = 'personal-os-20261120T080000000Z-startup.sqlite';
    const old2 = 'personal-os-20261120T090000000Z-startup.sqlite';
    writeFileSync(join(dirs().mirror, old1), 'x');
    writeFileSync(join(dirs().mirror, old2), 'x');
    const backups = service({ mirrorDir: dirs().mirror });
    await backups.runBackup('daily');
    expect(await listBackups(dirs().mirror)).toEqual([
      expect.stringContaining('20261125T030001'),
      old2,
    ]);
    const status = await backups.status();
    expect(status.mirror).toEqual({
      configured: true,
      state: 'ok',
      count: 2,
      oldestBackupAt: '2026-11-20T09:00:00.000Z',
      tiers: { recent: 1, daily: 1, monthly: 0, preMigration: 0 },
    });
    expect(status.warnings).toEqual([]);
  });

  it('keeps running when the mirror is unreachable, exposes it, and recovers', async () => {
    // A regular file where the mirror directory should be: it can never be created.
    writeFileSync(dirs().mirror, 'in the way');
    const logged: string[] = [];
    const backups = service({ mirrorDir: dirs().mirror, log: (m) => logged.push(m) });

    const result = await backups.runBackup('startup');
    expect(result.ok).toBe(true);
    expect(await listBackups(dirs().local)).toHaveLength(1);
    const broken = await backups.status();
    expect(broken.mirror.state).toBe('error');
    expect(broken.warnings).toHaveLength(1);
    expect(broken.warnings[0]).toMatch(/espejo/);
    expect(logged[0]).toMatch(/mirror unreachable/i);

    rmSync(dirs().mirror);
    await backups.runBackup('daily');
    const fixed = await backups.status();
    expect(fixed.mirror.state).toBe('ok');
    expect(fixed.warnings).toEqual([]);
  });

  it('does not create missing parents of the mirror: an unmounted disk must not fall back to the main one', async () => {
    const mirror = join(root, 'not-mounted', 'backups');
    const backups = service({ mirrorDir: mirror });
    expect((await backups.runBackup('startup')).ok).toBe(true);
    expect(existsSync(join(root, 'not-mounted'))).toBe(false);
    expect((await backups.status()).mirror.state).toBe('error');
  });

  it('creates only the last directory of the mirror when its parent exists', async () => {
    mkdirSync(join(root, 'disk'));
    const backups = service({ mirrorDir: join(root, 'disk', 'backups') });
    await backups.runBackup('startup');
    expect(await listBackups(join(root, 'disk', 'backups'))).toHaveLength(1);
    expect((await backups.status()).mirror.state).toBe('ok');
  });

  it('refuses a mirror that is the local directory, so pruning cannot eat local backups', async () => {
    const backups = service({ mirrorDir: dirs().local });
    for (let i = 0; i < 3; i++) {
      await backups.runBackup('daily');
    }
    expect(await listBackups(dirs().local)).toHaveLength(3);
    const status = await backups.status();
    expect(status.mirror.state).toBe('error');
    expect(status.warnings[0]).toMatch(/mismo directorio/);
  });

  it('whenIdle waits for a running backup', async () => {
    const backups = service();
    const running = backups.runBackup('startup');
    await backups.whenIdle();
    expect(await listBackups(dirs().local)).toHaveLength(1);
    await running;
  });

  it('reports a failed local backup without throwing, and clears it on the next success', async () => {
    writeFileSync(dirs().local, 'in the way');
    const backups = service();
    const result = await backups.runBackup('startup');
    expect(result.ok).toBe(false);
    expect((await backups.status()).warnings[0]).toMatch(/ha fallado/);

    rmSync(dirs().local);
    expect((await backups.runBackup('daily')).ok).toBe(true);
    expect((await backups.status()).warnings).toEqual([]);
  });

  it('serialises overlapping backups', async () => {
    const backups = service();
    const results = await Promise.all([
      backups.runBackup('startup'),
      backups.runBackup('daily'),
      backups.runBackup('pre-migration'),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await listBackups(dirs().local)).toHaveLength(3);
  });
});

describe('status', () => {
  it('warns when there is no backup yet, then reports the last one', async () => {
    const backups = service();
    const before = await backups.status();
    expect(before).toMatchObject({
      enabled: true,
      lastBackupAt: null,
      localCount: 0,
      oldestBackupAt: null,
      mirror: { configured: false, state: 'disabled', count: 0, oldestBackupAt: null },
    });
    expect(before.warnings[0]).toMatch(/Todavía no hay/);

    await backups.runBackup('startup');
    const after = await backups.status();
    expect(after.lastBackupAt).toBe('2026-11-25T03:00:02.000Z');
    expect(after.localCount).toBe(1);
    expect(after.oldestBackupAt).toBe('2026-11-25T03:00:02.000Z');
    expect(after.tiers).toEqual({ recent: 1, daily: 0, monthly: 0, preMigration: 0 });
    expect(after.warnings).toEqual([]);
  });
});

describe('daily schedule', () => {
  it('schedules every 24 h once, runs a daily backup when it fires, and stops', async () => {
    const scheduled: { run: () => void; ms: number; cleared: boolean }[] = [];
    const backups = service({
      schedule: (run, ms) => {
        const entry = { run, ms, cleared: false };
        scheduled.push(entry);
        return {
          clear: () => {
            entry.cleared = true;
          },
        };
      },
    });
    backups.start();
    backups.start();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.ms).toBe(BACKUP_INTERVAL_MS);
    expect(BACKUP_INTERVAL_MS).toBe(86_400_000);

    scheduled[0]?.run();
    await backups.runBackup('startup'); // queued behind the daily one
    const files = await listBackups(dirs().local);
    expect(files.some((f) => f.endsWith('-daily.sqlite'))).toBe(true);

    backups.stop();
    expect(scheduled[0]?.cleared).toBe(true);
  });
});

describe('GET /api/backups/status', () => {
  it('reports disabled when no backup service runs', async () => {
    const handle = openDatabase(':memory:');
    const app = buildApp({ db: handle.db });
    const response = await app.inject({ method: 'GET', url: '/api/backups/status' });
    expect(response.statusCode).toBe(200);
    expect(response.json<BackupStatusDto>()).toMatchObject({ enabled: false, warnings: [] });
    await app.close();
    handle.close();
  });

  it('reports the service state, including a mirror warning', async () => {
    writeFileSync(dirs().mirror, 'in the way');
    const backups = service({ mirrorDir: dirs().mirror });
    await backups.runBackup('startup');
    const handle = openDatabase(':memory:');
    const app = buildApp({ db: handle.db, backups });
    const body = (
      await app.inject({ method: 'GET', url: '/api/backups/status' })
    ).json<BackupStatusDto>();
    expect(body.enabled).toBe(true);
    expect(body.localCount).toBe(1);
    expect(body.mirror.state).toBe('error');
    expect(body.warnings).toHaveLength(1);
    await app.close();
    handle.close();
  });
});

describe('resolveBackupConfig', () => {
  it('is off outside production or without a data directory', () => {
    expect(resolveBackupConfig({ PERSONAL_OS_DATA_DIR: '/d' })).toBeUndefined();
    expect(resolveBackupConfig({ NODE_ENV: 'production' })).toBeUndefined();
    expect(
      resolveBackupConfig({ NODE_ENV: 'production', PERSONAL_OS_DATA_DIR: ' ' }),
    ).toBeUndefined();
  });

  it('puts backups in <data dir>/backups and reads the mirror from the environment', () => {
    expect(resolveBackupConfig({ NODE_ENV: 'production', PERSONAL_OS_DATA_DIR: '/d' })).toEqual({
      dir: '/d/backups',
      mirrorDir: undefined,
    });
    expect(
      resolveBackupConfig({
        NODE_ENV: 'production',
        PERSONAL_OS_DATA_DIR: '/d',
        PERSONAL_OS_BACKUP_MIRROR_DIR: '/m',
      }),
    ).toEqual({ dir: '/d/backups', mirrorDir: '/m' });
    expect(
      resolveBackupConfig({
        NODE_ENV: 'production',
        PERSONAL_OS_DATA_DIR: '/d',
        PERSONAL_OS_BACKUP_MIRROR_DIR: '  ',
      })?.mirrorDir,
    ).toBeUndefined();
  });
});

describe('backup before migrations', () => {
  const ENTRY = (idx: number, tag: string) =>
    `{"idx":${String(idx)},"version":"6","when":${String(1_700_000_000_000 + idx)},"tag":"${tag}","breakpoints":true}`;

  /** A tiny migrations folder of its own, so these tests never depend on the real migrations. */
  function migrationsFolder(name: string, steps: { tag: string; sql: string }[]): string {
    const folder = join(root, name);
    mkdirSync(join(folder, 'meta'), { recursive: true });
    const entries = steps.map((step, idx) => ENTRY(idx, step.tag)).join(',');
    writeFileSync(
      join(folder, 'meta', '_journal.json'),
      `{"version":"7","dialect":"sqlite","entries":[${entries}]}`,
    );
    for (const step of steps) {
      writeFileSync(join(folder, `${step.tag}.sql`), step.sql);
    }
    return folder;
  }

  const FIRST = {
    tag: '0000_first',
    // Drizzle runs one statement at a time, split on this marker.
    sql: "CREATE TABLE t (v TEXT);\n--> statement-breakpoint\nINSERT INTO t VALUES ('kept');",
  };
  const SECOND = { tag: '0001_second', sql: 'CREATE TABLE u (v TEXT);' };
  const hasTable = (db: Database.Database, table: string) =>
    db.prepare('SELECT 1 FROM sqlite_master WHERE name = ?').get(table) !== undefined;
  const never = () => Promise.reject(new Error('the hook must not run'));

  /** A database that already applied the first migration, with the second one pending. */
  async function behind(path: string) {
    (await openDatabaseGuarded(path, never, migrationsFolder('m1', [FIRST]))).close();
    return migrationsFolder('m2', [FIRST, SECOND]);
  }

  it('counts applied and total migrations', () => {
    const real = openDatabase(':memory:');
    const { total, applied } = migrationStatus(real.sqlite);
    expect(total).toBeGreaterThan(0);
    expect(applied).toBe(total);
    real.close();
    const fresh = new Database(':memory:');
    expect(migrationStatus(fresh).applied).toBe(0);
    fresh.close();
  });

  it('calls the hook before migrating an existing database that is behind', async () => {
    const path = join(root, 'behind.sqlite');
    const folder = await behind(path);
    let tableUSeenByHook: boolean | undefined;
    let calls = 0;
    const handle = await openDatabaseGuarded(
      path,
      (db) => {
        calls += 1;
        tableUSeenByHook = hasTable(db, 'u');
        return Promise.resolve();
      },
      folder,
    );
    expect(calls).toBe(1);
    expect(tableUSeenByHook).toBe(false); // the hook ran before the migration
    expect(hasTable(handle.sqlite, 'u')).toBe(true); // and the migration ran afterwards
    handle.close();
  });

  it('the pre-migration backup holds the old schema and the data', async () => {
    const path = join(root, 'behind.sqlite');
    const folder = await behind(path);
    const handle = await openDatabaseGuarded(
      path,
      async (db) => {
        const result = await createBackupService({
          sqlite: db,
          dir: dirs().local,
          now: tick,
        }).runBackup('pre-migration');
        expect(result.ok).toBe(true);
      },
      folder,
    );
    handle.close();
    const [name] = await listBackups(dirs().local);
    expect(name).toMatch(/-pre-migration\.sqlite$/);
    const copy = new Database(join(dirs().local, name ?? ''), { readonly: true });
    expect(hasTable(copy, 'u')).toBe(false);
    expect(copy.prepare('SELECT v FROM t').all()).toEqual([{ v: 'kept' }]);
    copy.close();
  });

  it('does not migrate, and closes the database, when the hook throws', async () => {
    const path = join(root, 'behind.sqlite');
    const folder = await behind(path);
    await expect(
      openDatabaseGuarded(path, () => Promise.reject(new Error('no backup')), folder),
    ).rejects.toThrow('no backup');
    const check = new Database(path);
    expect(hasTable(check, 'u')).toBe(false);
    check.close();
  });

  it('skips the hook for a new or fully migrated database', async () => {
    const folder = migrationsFolder('m3', [FIRST, SECOND]);
    const path = join(root, 'new.sqlite');
    (await openDatabaseGuarded(path, never, folder)).close();
    (await openDatabaseGuarded(path, never, folder)).close();
  });
});
