import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from './db/index.js';

// scripts/rehearse-migration.sh (plan 0003, task 00), with temporary directories, fixture
// backups and a temporary instance configuration only. Nothing here touches the real
// instance, its data or its backups.
vi.setConfig({ testTimeout: 60_000 });

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const NODE_DIR = dirname(process.execPath);

let root: string;
let appDir: string;
let dataDir: string;
let tmpWork: string;
let envFile: string;

const OLD = 'personal-os-20261124T030000000Z-daily.sqlite';
const NEWEST = 'personal-os-20261125T123000000Z-startup.sqlite';

interface Migration {
  tag: string;
  sql: string;
}

const BASE: Migration = {
  tag: '0000_base',
  sql: 'CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT);\n--> statement-breakpoint\nCREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);',
};

function writeMigrations(dir: string, migrations: Migration[]): void {
  mkdirSync(join(dir, 'meta'), { recursive: true });
  const entries = migrations.map((m, idx) => ({
    idx,
    version: '6',
    when: 1_800_000_000_000 + idx * 1000,
    tag: m.tag,
    breakpoints: true,
  }));
  writeFileSync(
    join(dir, 'meta', '_journal.json'),
    JSON.stringify({ version: '7', dialect: 'sqlite', entries }),
  );
  for (const m of migrations) writeFileSync(join(dir, `${m.tag}.sql`), m.sql);
}

/** Installs the build's migrations (what the script will apply) in the temporary app. */
function setBuildMigrations(migrations: Migration[]): void {
  rmSync(join(appDir, 'drizzle'), { recursive: true, force: true });
  writeMigrations(join(appDir, 'drizzle'), migrations);
}

/** A backup that already has `applied` migrations, with 3 people and 2 notes. */
function makeBackup(file: string, applied: Migration[]): void {
  const folder = mkdtempSync(join(root, 'fixture-migrations-'));
  writeMigrations(folder, applied);
  const db = new Database(file);
  migrate(drizzle(db), { migrationsFolder: folder });
  const insertPerson = db.prepare('INSERT INTO people (name) VALUES (?)');
  for (const name of ['a', 'b', 'c']) insertPerson.run(name);
  const insertNote = db.prepare('INSERT INTO notes (body) VALUES (?)');
  for (const body of ['x', 'y']) insertNote.run(body);
  db.close();
}

function rehearse(args: string[] = []): { status: number | null; out: string } {
  const result = spawnSync('bash', [join(appDir, 'scripts/rehearse-migration.sh'), ...args], {
    env: {
      PATH: `${NODE_DIR}:/usr/bin:/bin`,
      HOME: join(root, 'home'),
      TMPDIR: tmpWork,
      PERSONAL_OS_INSTANCE_ENV: envFile,
    },
    encoding: 'utf8',
    cwd: root,
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

const dbFile = () => join(dataDir, 'personal-os.sqlite');

/** Every file under `dir` with its size, mtime and content, to prove nothing changed. */
function fingerprint(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const stat = statSync(full);
        out[full] =
          `${String(stat.size)}:${String(stat.mtimeMs)}:${readFileSync(full).toString('base64')}`;
      }
    }
  };
  walk(dir);
  return out;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'personal-os-rehearse-'));
  mkdirSync(join(root, 'home'));
  appDir = join(root, 'app');
  dataDir = join(root, 'data');
  tmpWork = join(root, 'tmp');
  envFile = join(root, 'instance.env');
  mkdirSync(tmpWork);
  cpSync(join(REPO_ROOT, 'scripts'), join(appDir, 'scripts'), { recursive: true });
  // The helpers import better-sqlite3 and drizzle-orm from the app's node_modules.
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(appDir, 'node_modules'));
  mkdirSync(join(dataDir, 'backups'), { recursive: true });
  writeFileSync(envFile, `PERSONAL_OS_DATA_DIR=${dataDir}\nPORT=1\n`);
  // The "live" database: a different, recognisable file that must never be touched.
  makeBackup(dbFile(), [BASE]);
  makeBackup(join(dataDir, 'backups', OLD), [BASE]);
  makeBackup(join(dataDir, 'backups', NEWEST), [BASE]);
  setBuildMigrations([
    BASE,
    { tag: '0001_add', sql: 'CREATE TABLE tags (id INTEGER PRIMARY KEY);' },
  ]);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('rehearsing', () => {
  it('prints rows per table before and after, and the migrations applied', () => {
    setBuildMigrations([
      BASE,
      {
        tag: '0001_add',
        sql: "CREATE TABLE tags (id INTEGER PRIMARY KEY);\n--> statement-breakpoint\nINSERT INTO tags (id) VALUES (1);\n--> statement-breakpoint\nINSERT INTO notes (body) VALUES ('z');",
      },
    ]);
    const result = rehearse();
    expect(result.status).toBe(0);
    expect(result.out).toMatch(/notes\s+2\s+3\s+\+1/);
    expect(result.out).toMatch(/people\s+3\s+3\s+0/);
    expect(result.out).toMatch(/tags\s+0\s+1\s+\+1\s+\(new table\)/);
    expect(result.out).toContain('Migrations applied (1):');
    expect(result.out).toContain('0001_add');
    expect(result.out).not.toContain('0000_base');
    expect(result.out).toContain(NEWEST);
    expect(result.out).toContain('OK');
  });

  it('says so when the backup already has every migration', () => {
    setBuildMigrations([BASE]);
    const result = rehearse();
    expect(result.status).toBe(0);
    expect(result.out).toContain('Migrations applied: none');
  });

  it('works with the real migrations of this build on a backup made by the app', () => {
    rmSync(join(appDir, 'drizzle'), { recursive: true });
    cpSync(join(REPO_ROOT, 'drizzle'), join(appDir, 'drizzle'), { recursive: true });
    // A backup with the real schema, then a build that is the same: nothing pending.
    const real = join(dataDir, 'backups', 'personal-os-20261126T010000000Z-startup.sqlite');
    openDatabase(real).close();
    const result = rehearse();
    expect(result.status).toBe(0);
    expect(result.out).toContain('Migrations applied: none');
    expect(result.out).toMatch(/movements\s+0\s+0\s+0/);
  });

  it('fails when a migration deletes rows', () => {
    setBuildMigrations([BASE, { tag: '0001_purge', sql: 'DELETE FROM people WHERE id > 1;' }]);
    const result = rehearse();
    expect(result.status).toBe(1);
    expect(result.out).toMatch(/people\s+3\s+1\s+-2/);
    expect(result.out).toContain('people: lost 2 row(s)');
    expect(result.out).toContain('do not deploy');
  });

  it('fails when a migration drops a table', () => {
    setBuildMigrations([BASE, { tag: '0001_drop', sql: 'DROP TABLE notes;' }]);
    const result = rehearse();
    expect(result.status).toBe(1);
    expect(result.out).toContain('notes: table no longer exists');
  });

  it('fails when a migration fails', () => {
    setBuildMigrations([
      BASE,
      { tag: '0001_broken', sql: 'ALTER TABLE nowhere ADD COLUMN x TEXT;' },
    ]);
    const result = rehearse();
    expect(result.status).toBe(1);
    expect(result.out).toContain('MIGRATION FAILED');
    expect(result.out).toContain('do not deploy');
  });

  it('uses the newest backup, whatever its type', () => {
    const older = join(dataDir, 'backups', OLD);
    // Make the older file recognisable: with one more person, it would show 4 rows.
    const db = new Database(older);
    db.prepare("INSERT INTO people (name) VALUES ('extra')").run();
    db.close();
    const result = rehearse();
    expect(result.out).toContain(NEWEST);
    expect(result.out).toMatch(/people\s+3\s+3/);
    const pre = 'personal-os-20261127T000000000Z-pre-migration.sqlite';
    makeBackup(join(dataDir, 'backups', pre), [BASE]);
    expect(rehearse().out).toContain(pre);
  });
});

describe('the temporary copy', () => {
  it('is deleted by default', () => {
    expect(rehearse().status).toBe(0);
    expect(readdirSync(tmpWork)).toEqual([]);
  });

  it('is deleted after a failure too', () => {
    setBuildMigrations([BASE, { tag: '0001_purge', sql: 'DELETE FROM people;' }]);
    expect(rehearse().status).toBe(1);
    expect(readdirSync(tmpWork)).toEqual([]);
  });

  it('is kept with --keep, migrated, and its path is printed', () => {
    const result = rehearse(['--keep']);
    expect(result.status).toBe(0);
    const kept = readdirSync(tmpWork);
    expect(kept).toHaveLength(1);
    const copy = join(tmpWork, kept[0] ?? '', 'rehearsal.sqlite');
    expect(result.out).toContain(copy);
    const db = new Database(copy, { readonly: true });
    expect(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'tags'").get()).toEqual(
      { n: 1 },
    );
    db.close();
  });
});

describe('never touches the real data', () => {
  it('leaves the live database, the backups and the data folder byte-identical', () => {
    // Live data that differs from every backup, so a read of it would show in the output.
    const live = new Database(dbFile());
    live.prepare("INSERT INTO people (name) VALUES ('only live')").run();
    live.close();
    const before = fingerprint(dataDir);
    expect(rehearse().status).toBe(0);
    setBuildMigrations([BASE, { tag: '0001_purge', sql: 'DELETE FROM people;' }]);
    expect(rehearse().status).toBe(1);
    expect(rehearse(['--keep']).status).toBe(1);
    expect(fingerprint(dataDir)).toEqual(before);
    expect(existsSync(`${dbFile()}-wal`)).toBe(false);
  });

  it('creates no -wal/-shm next to a backup made the way the app makes it (WAL source + backup API)', async () => {
    // The app backs up a WAL-mode database with sqlite.backup(); the file keeps WAL mode.
    const source = new Database(join(root, 'wal-source.sqlite'));
    source.pragma('journal_mode = WAL');
    source.pragma('foreign_keys = ON');
    const folder = mkdtempSync(join(root, 'fixture-migrations-'));
    writeMigrations(folder, [BASE]);
    migrate(drizzle(source), { migrationsFolder: folder });
    source.prepare("INSERT INTO people (name) VALUES ('w')").run();
    const newest = 'personal-os-20261128T000000000Z-startup.sqlite';
    const backups = join(dataDir, 'backups');
    await source.backup(join(backups, newest));
    source.close();
    const header = readFileSync(join(backups, newest)).subarray(18, 20);
    expect([...header]).toEqual([2, 2]); // file format write/read version 2 = WAL mode

    const before = fingerprint(dataDir);
    const result = rehearse();
    expect(result.status).toBe(0);
    expect(result.out).toContain(newest);
    expect(result.out).toMatch(/people\s+1\s+1\s+0/);
    expect(fingerprint(dataDir)).toEqual(before);
    expect(readdirSync(backups).filter((name) => /-(shm|wal)$/.test(name))).toEqual([]);
    expect(readdirSync(tmpWork)).toEqual([]);
  });

  it('does not need the live database at all', () => {
    rmSync(dbFile());
    expect(rehearse().status).toBe(0);
    expect(existsSync(dbFile())).toBe(false);
  });
});

describe('errors', () => {
  it('says clearly when there is no backup', () => {
    rmSync(join(dataDir, 'backups', OLD));
    rmSync(join(dataDir, 'backups', NEWEST));
    writeFileSync(join(dataDir, 'backups', 'notes.txt'), 'mine');
    const result = rehearse();
    expect(result.status).toBe(1);
    expect(result.out).toContain('no backup found');
    expect(readdirSync(tmpWork)).toEqual([]);
  });

  it('says clearly when there is no backup folder', () => {
    rmSync(join(dataDir, 'backups'), { recursive: true });
    const result = rehearse();
    expect(result.status).toBe(1);
    expect(result.out).toContain('no backup folder');
  });

  it('refuses a corrupt newest backup', () => {
    const bad = 'personal-os-20261126T010000000Z-startup.sqlite';
    writeFileSync(join(dataDir, 'backups', bad), 'this is not a database, just text '.repeat(200));
    const result = rehearse();
    expect(result.status).toBe(1);
    expect(result.out).toContain('not a valid backup');
    expect(readdirSync(tmpWork)).toEqual([]);
  });

  it('fails when the instance configuration is missing', () => {
    rmSync(envFile);
    const result = rehearse();
    expect(result.status).toBe(1);
    expect(result.out).toContain('config file not found');
  });

  it('rejects unknown options', () => {
    const result = rehearse(['--now']);
    expect(result.status).toBe(1);
    expect(result.out).toContain('unknown option');
  });
});
