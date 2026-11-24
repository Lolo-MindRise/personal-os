import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// scripts/restore.sh (task 0012), with temporary directories only. Nothing here touches
// the real instance, its data or its backups.
vi.setConfig({ testTimeout: 60_000 });

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const NODE_DIR = dirname(process.execPath);

let root: string;
let appDir: string;
let dataDir: string;
let mirrorDir: string;
let envFile: string;
let port: number;
let fakeApp: ChildProcess | undefined;

const BACKUP_A = 'personal-os-20261124T030000000Z-daily.sqlite';
const BACKUP_B = 'personal-os-20261125T123000000Z-startup.sqlite';
const BACKUP_PRE = 'personal-os-20260801T080000000Z-pre-migration.sqlite';

/** A SQLite file with one table `t` holding `value`. */
function makeDb(file: string, value: string): void {
  const db = new Database(file);
  db.exec('CREATE TABLE t (v TEXT)');
  db.prepare('INSERT INTO t VALUES (?)').run(value);
  db.close();
}

function readValue(file: string): string | undefined {
  const db = new Database(file, { readonly: true });
  try {
    return (db.prepare('SELECT v FROM t').get() as { v: string } | undefined)?.v;
  } finally {
    db.close();
  }
}

function restore(args: string[] = []): { status: number | null; out: string } {
  const result = spawnSync('bash', [join(appDir, 'scripts/restore.sh'), ...args], {
    env: {
      PATH: `${NODE_DIR}:/usr/bin:/bin`,
      HOME: join(root, 'home'),
      PERSONAL_OS_INSTANCE_ENV: envFile,
    },
    encoding: 'utf8',
    cwd: root,
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

const dbFile = () => join(dataDir, 'personal-os.sqlite');
const beforeRestoreFiles = () =>
  readdirSync(join(dataDir, 'backups')).filter((f) => f.endsWith('-before-restore.sqlite'));

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const value = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => {
        resolvePort(value);
      });
    });
  });
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'personal-os-restore-'));
  mkdirSync(join(root, 'home'));
  appDir = join(root, 'app');
  dataDir = join(root, 'data');
  mirrorDir = join(root, 'mirror');
  envFile = join(root, 'instance.env');
  port = await freePort();
  cpSync(join(REPO_ROOT, 'scripts'), join(appDir, 'scripts'), { recursive: true });
  // The helper imports better-sqlite3 from the app's node_modules.
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(appDir, 'node_modules'));
  mkdirSync(join(dataDir, 'backups'), { recursive: true });
  mkdirSync(mirrorDir);
  writeFileSync(
    envFile,
    `PERSONAL_OS_DATA_DIR=${dataDir}\nPERSONAL_OS_BACKUP_MIRROR_DIR=${mirrorDir}\nPORT=${String(port)}\n`,
  );
  makeDb(dbFile(), 'current');
  makeDb(join(dataDir, 'backups', BACKUP_A), 'from A');
  makeDb(join(dataDir, 'backups', BACKUP_B), 'from B');
  makeDb(join(dataDir, 'backups', BACKUP_PRE), 'from pre');
  makeDb(join(mirrorDir, BACKUP_A), 'mirror A');
});

afterEach(async () => {
  if (fakeApp !== undefined) {
    const app = fakeApp;
    fakeApp = undefined;
    const exited = new Promise<void>((done) => {
      app.once('exit', () => {
        done();
      });
    });
    app.kill();
    await exited;
  }
  rmSync(root, { recursive: true, force: true });
});

describe('listing', () => {
  it('lists local backups newest first with local date and type, ignoring other files', () => {
    writeFileSync(join(dataDir, 'backups', 'notes.txt'), 'mine');
    writeFileSync(join(dataDir, 'backups', `${BACKUP_A}.partial`), 'x');
    const result = restore();
    expect(result.status).toBe(0);
    const lines = result.out.split('\n').filter((l) => l.includes('.sqlite'));
    expect(lines.map((l) => l.trim().split(/\s+/).at(-1))).toEqual([
      BACKUP_B,
      BACKUP_A,
      BACKUP_PRE,
    ]);
    // 2026-11-25 12:30Z is 13:30 in Europe/Andorra (UTC+1); 2026-08-01 08:00Z is 10:00 (UTC+2).
    expect(lines[0]).toContain('2026-11-25 13:30');
    expect(lines[0]).toContain('startup');
    expect(lines[2]).toContain('2026-08-01 10:00');
    expect(lines[2]).toContain('pre-migration');
    expect(result.out).not.toContain('notes.txt');
  });

  it('lists the mirror with --mirror', () => {
    const result = restore(['--mirror']);
    expect(result.status).toBe(0);
    expect(result.out).toContain(BACKUP_A);
    expect(result.out).not.toContain(BACKUP_B);
  });

  it('changes nothing when listing', () => {
    restore();
    expect(readValue(dbFile())).toBe('current');
    expect(beforeRestoreFiles()).toEqual([]);
  });
});

describe('restoring', () => {
  it('replaces the database, keeps a -before-restore copy of the old one', () => {
    const result = restore([BACKUP_A]);
    expect(result.status).toBe(0);
    expect(readValue(dbFile())).toBe('from A');
    const saved = beforeRestoreFiles();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatch(/^personal-os-\d{8}T\d{9}Z-before-restore\.sqlite$/);
    expect(readValue(join(dataDir, 'backups', saved[0] ?? ''))).toBe('current');
    // The chosen backup itself is untouched, and nothing is left staged.
    expect(readValue(join(dataDir, 'backups', BACKUP_A))).toBe('from A');
    expect(existsSync(`${dbFile()}.restoring`)).toBe(false);
  });

  it('removes a leftover WAL so it is not applied to the restored database', () => {
    writeFileSync(`${dbFile()}-wal`, 'stale');
    writeFileSync(`${dbFile()}-shm`, 'stale');
    expect(restore([BACKUP_B]).status).toBe(0);
    expect(existsSync(`${dbFile()}-wal`)).toBe(false);
    expect(existsSync(`${dbFile()}-shm`)).toBe(false);
    expect(readValue(dbFile())).toBe('from B');
  });

  it('restores from the mirror with --mirror, and from a path', () => {
    expect(restore(['--mirror', BACKUP_A]).status).toBe(0);
    expect(readValue(dbFile())).toBe('mirror A');
    expect(restore([join(dataDir, 'backups', BACKUP_B)]).status).toBe(0);
    expect(readValue(dbFile())).toBe('from B');
    expect(beforeRestoreFiles()).toHaveLength(2);
  });

  it('works when there is no current database', () => {
    rmSync(dbFile());
    const result = restore([BACKUP_A]);
    expect(result.status).toBe(0);
    expect(readValue(dbFile())).toBe('from A');
    expect(beforeRestoreFiles()).toEqual([]);
  });

  it('refuses while the app is running and changes nothing', async () => {
    // A child process: spawnSync below blocks this process's event loop.
    const app = spawn(
      process.execPath,
      [
        '-e',
        `require('node:http').createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end('{"status":"ok"}'); }).listen(${String(port)}, '127.0.0.1', () => console.log('up'));`,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    fakeApp = app;
    await new Promise<void>((done) => {
      app.stdout.once('data', () => {
        done();
      });
    });
    const result = restore([BACKUP_A]);
    expect(result.status).toBe(1);
    expect(result.out).toMatch(/stop/i);
    expect(readValue(dbFile())).toBe('current');
    expect(beforeRestoreFiles()).toEqual([]);
  });

  it('refuses a corrupt backup before touching anything', () => {
    const bad = 'personal-os-20261126T010000000Z-startup.sqlite';
    writeFileSync(join(dataDir, 'backups', bad), 'this is not a database, just text '.repeat(200));
    const result = restore([bad]);
    expect(result.status).toBe(1);
    expect(result.out).toContain('not a valid backup');
    expect(result.out).toContain('Nothing was changed');
    expect(readValue(dbFile())).toBe('current');
    expect(beforeRestoreFiles()).toEqual([]);
    expect(existsSync(`${dbFile()}.restoring`)).toBe(false);
  });

  it('refuses a truncated database and an empty one', () => {
    const truncated = 'personal-os-20261126T020000000Z-startup.sqlite';
    const empty = 'personal-os-20261126T030000000Z-startup.sqlite';
    const source = join(dataDir, 'backups', BACKUP_A);
    // A real database cut in the middle of its header and first page.
    const bytes = readFileBytes(source).subarray(0, 60);
    writeFileSync(join(dataDir, 'backups', truncated), bytes);
    writeFileSync(join(dataDir, 'backups', empty), '');
    for (const name of [truncated, empty]) {
      const result = restore([name]);
      expect(result.status, name).toBe(1);
      expect(result.out).toContain('Nothing was changed');
    }
    expect(readValue(dbFile())).toBe('current');
  });

  it('fails clearly for a backup that does not exist', () => {
    const result = restore(['personal-os-20200101T000000000Z-daily.sqlite']);
    expect(result.status).toBe(1);
    expect(result.out).toContain('backup not found');
    expect(readValue(dbFile())).toBe('current');
  });

  it('keeps a raw copy when the current database is damaged, and still restores', () => {
    writeFileSync(dbFile(), 'garbage that is not sqlite '.repeat(100));
    const result = restore([BACKUP_A]);
    expect(result.status).toBe(0);
    expect(result.out).toContain('raw copy');
    expect(readValue(dbFile())).toBe('from A');
    expect(beforeRestoreFiles()).toHaveLength(1);
  });
});

function readFileBytes(file: string): Buffer {
  return readFileSync(file);
}
