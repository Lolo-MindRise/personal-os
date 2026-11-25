import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from './config.js';

// The transfers migration (plan 0002, task 03) only adds a table: every existing row must
// survive untouched.

const TRANSFERS_MIGRATION = '0007_brave_mysterio';

let dir: string;
let sqlite: Database.Database;

/** A copy of the migrations folder that stops right before the transfers migration. */
function migrationsBeforeTransfers(): string {
  const before = join(dir, 'before');
  cpSync(MIGRATIONS_DIR, before, { recursive: true });
  const journalPath = join(before, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: { tag: string }[];
  };
  const cut = journal.entries.findIndex((e) => e.tag === TRANSFERS_MIGRATION);
  expect(cut).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, cut);
  writeFileSync(journalPath, JSON.stringify(journal));
  return before;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'personal-os-transfers-'));
  sqlite = new Database(join(dir, 'test.sqlite'));
  sqlite.pragma('foreign_keys = ON');
});
afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('transfers migration', () => {
  it('keeps accounts and movements intact and adds an empty transfers table', () => {
    migrate(drizzle(sqlite), { migrationsFolder: migrationsBeforeTransfers() });
    sqlite.exec(`
      INSERT INTO accounts (id, name, type, opening_balance_cents, opening_balance_date)
        VALUES (2, 'Efectivo', 'cash', 5000, '2026-01-01');
      INSERT INTO categories (id, name, kind) VALUES (1, 'Nómina ficticia', 'income'), (2, 'Ocio', 'expense');
      INSERT INTO movements (id, date, kind, category_id, concept, amount_cents, notes, account_id) VALUES
        (1, '2026-03-05', 'income', 1, 'Nómina', 200000, NULL, 1),
        (2, '2026-02-10', 'expense', 2, 'Cine', 2400, 'Entradas para dos', 2);
    `);
    type Row = Record<string, unknown>;
    const tables = ['accounts', 'categories', 'movements'];
    const before = tables.map(
      (t) => sqlite.prepare(`SELECT * FROM ${t} ORDER BY id`).all() as Row[],
    );
    expect(before.map((rows) => rows.length)).toEqual([2, 2, 2]);

    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_DIR });

    const after = tables.map(
      (t) => sqlite.prepare(`SELECT * FROM ${t} ORDER BY id`).all() as Row[],
    );
    expect(after).toEqual(before);
    expect(sqlite.prepare('SELECT count(*) AS n FROM transfers').get()).toEqual({ n: 0 });
  });
});
