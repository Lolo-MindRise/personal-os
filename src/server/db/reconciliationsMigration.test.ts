import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from './config.js';

// The reconciliations migration (plan 0003, task 06) is additive: it only creates a table. Every
// existing row must survive, and the SQL must not drop or rebuild anything.

const MIGRATION = '0010_reconciliations';

let dir: string;
let sqlite: Database.Database;

function migrationsBefore(): string {
  const before = join(dir, 'before');
  cpSync(MIGRATIONS_DIR, before, { recursive: true });
  const journalPath = join(before, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] };
  const cut = journal.entries.findIndex((e) => e.tag === MIGRATION);
  expect(cut).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, cut);
  writeFileSync(journalPath, JSON.stringify(journal));
  return before;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'personal-os-reconciliations-'));
  sqlite = new Database(join(dir, 'test.sqlite'));
  sqlite.pragma('foreign_keys = ON');
});
afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const rowsOf = (table: string): unknown[] =>
  sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all();

describe('reconciliations migration', () => {
  it('contains only CREATE statements: no DROP, no ALTER, no rebuild', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, `${MIGRATION}.sql`), 'utf8');
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bALTER\b/i);
    // (`ON DELETE cascade` of the foreign key is fine; a DELETE statement is not.)
    expect(sql).not.toMatch(/\bINSERT\b|\bUPDATE\s+`|(?<!ON )\bDELETE\b/i);
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s !== '');
    expect(statements.every((s) => /^CREATE (TABLE|INDEX) /.test(s))).toBe(true);
  });

  it('keeps every existing row and creates an empty table', () => {
    migrate(drizzle(sqlite), { migrationsFolder: migrationsBefore() });
    sqlite.exec(`
      INSERT INTO accounts (id, name, type, opening_balance_cents, opening_balance_date)
        VALUES (2, 'Efectivo', 'cash', 5000, '2026-01-01');
      INSERT INTO categories (id, name, kind) VALUES (1, 'Nómina ficticia', 'income'), (2, 'Ocio', 'expense');
      INSERT INTO movements (id, date, kind, category_id, concept, amount_cents, account_id, deleted_at) VALUES
        (1, '2026-03-05', 'income', 1, 'Nómina', 200000, 1, NULL),
        (2, '2026-02-10', 'expense', 2, 'Cine', 2400, 2, '2026-02-11T10:00:00.000Z');
      INSERT INTO transfers (id, date, amount_cents, from_account_id, to_account_id)
        VALUES (1, '2026-03-06', 1000, 1, 2);
    `);
    const tables = ['accounts', 'categories', 'movements', 'transfers'];
    const before = tables.map(rowsOf);

    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_DIR });

    expect(tables.map(rowsOf)).toEqual(before);
    expect(rowsOf('reconciliations')).toEqual([]);
    sqlite.exec(`INSERT INTO reconciliations (account_id, date, bank_balance_cents, app_balance_cents, difference_cents)
      VALUES (2, '2026-03-31', 7000, 6000, 1000)`);
    expect(rowsOf('reconciliations')).toHaveLength(1);
  });

  it('rejects an inconsistent difference and deletes the records with their account', () => {
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_DIR });
    sqlite.exec(`INSERT INTO accounts (id, name, type, opening_balance_cents, opening_balance_date)
      VALUES (2, 'Efectivo', 'cash', 0, '2026-01-01')`);
    expect(() =>
      sqlite.exec(`INSERT INTO reconciliations (account_id, date, bank_balance_cents, app_balance_cents, difference_cents)
        VALUES (2, '2026-03-31', 7000, 6000, 999)`),
    ).toThrow(/CHECK/);
    sqlite.exec(`INSERT INTO reconciliations (account_id, date, bank_balance_cents, app_balance_cents, difference_cents)
      VALUES (2, '2026-03-31', 7000, 6000, 1000)`);
    sqlite.exec('DELETE FROM accounts WHERE id = 2');
    expect(rowsOf('reconciliations')).toEqual([]);
  });
});
