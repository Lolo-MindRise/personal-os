import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertDevEnvironment, resetDevDatabase } from './reset.js';

describe('db:reset', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'personal-os-reset-'));
    dbPath = join(dir, 'dev.sqlite');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses in production and leaves the file alone', () => {
    writeFileSync(dbPath, 'precious');
    expect(() => {
      resetDevDatabase({ NODE_ENV: 'production' }, dbPath);
    }).toThrow(/NODE_ENV=production/);
    expect(existsSync(dbPath)).toBe(true);
  });

  it('refuses when PERSONAL_OS_DATA_DIR is set, even outside production', () => {
    writeFileSync(dbPath, 'precious');
    expect(() => {
      resetDevDatabase({ PERSONAL_OS_DATA_DIR: '/somewhere' }, dbPath);
    }).toThrow(/PERSONAL_OS_DATA_DIR/);
    expect(existsSync(dbPath)).toBe(true);
  });

  it('accepts a plain development environment, and an empty data dir variable', () => {
    expect(() => {
      assertDevEnvironment({});
    }).not.toThrow();
    expect(() => {
      assertDevEnvironment({ PERSONAL_OS_DATA_DIR: '' });
    }).not.toThrow();
  });

  it('replaces the database with a freshly seeded one', () => {
    resetDevDatabase({}, dbPath);
    const first = new Database(dbPath);
    first.prepare("INSERT INTO categories (name, kind) VALUES ('Extra', 'expense')").run();
    first.close();

    resetDevDatabase({}, dbPath);
    const db = new Database(dbPath, { readonly: true });
    const extra = db.prepare("SELECT COUNT(*) AS n FROM categories WHERE name = 'Extra'").get() as {
      n: number;
    };
    const seeded = db.prepare('SELECT COUNT(*) AS n FROM categories').get() as { n: number };
    db.close();
    expect(extra.n).toBe(0);
    expect(seeded.n).toBeGreaterThan(0);
  });
});
