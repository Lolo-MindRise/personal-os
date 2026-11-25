import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from './config.js';

// The trash migration (plan 0003, task 01) adds `deleted_at` to movements and transfers and makes
// the (recurring item, month) unique index partial. Every existing row must survive untouched.

const TRASH_MIGRATION = '0009_trash';

let dir: string;
let sqlite: Database.Database;

/** A copy of the migrations folder that stops right before the trash migration. */
function migrationsBeforeTrash(): string {
  const before = join(dir, 'before');
  cpSync(MIGRATIONS_DIR, before, { recursive: true });
  const journalPath = join(before, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: { tag: string }[];
  };
  const cut = journal.entries.findIndex((e) => e.tag === TRASH_MIGRATION);
  expect(cut).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, cut);
  writeFileSync(journalPath, JSON.stringify(journal));
  return before;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'personal-os-trash-'));
  sqlite = new Database(join(dir, 'test.sqlite'));
  sqlite.pragma('foreign_keys = ON');
});
afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

type Row = Record<string, unknown>;
const rowsOf = (table: string): Row[] =>
  sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all() as Row[];

describe('trash migration', () => {
  it('keeps every existing row, with deleted_at NULL, and every tag link', () => {
    migrate(drizzle(sqlite), { migrationsFolder: migrationsBeforeTrash() });
    sqlite.exec(`
      INSERT INTO accounts (id, name, type, opening_balance_cents, opening_balance_date)
        VALUES (2, 'Efectivo', 'cash', 5000, '2026-01-01');
      INSERT INTO categories (id, name, kind) VALUES (1, 'Nómina ficticia', 'income'), (2, 'Ocio', 'expense');
      INSERT INTO recurring_items (id, kind, category_id, concept, amount_cents, expected_day, start_month)
        VALUES (1, 'expense', 2, 'Gimnasio', 3000, 5, '2026-01');
      INSERT INTO movements (id, date, kind, category_id, concept, amount_cents, notes, account_id, recurring_item_id) VALUES
        (1, '2026-03-05', 'income', 1, 'Nómina', 200000, NULL, 1, NULL),
        (2, '2026-02-10', 'expense', 2, 'Cine', 2400, 'Entradas para dos', 2, NULL),
        (3, '2026-02-05', 'expense', 2, 'Gimnasio', 3000, NULL, 1, 1);
      INSERT INTO transfers (id, date, amount_cents, from_account_id, to_account_id)
        VALUES (1, '2026-03-06', 1000, 1, 2);
      INSERT INTO tags (id, name, name_key) VALUES (1, 'Viaje', 'viaje');
      INSERT INTO movement_tags (movement_id, tag_id) VALUES (2, 1);
    `);
    const tables = ['accounts', 'categories', 'recurring_items', 'movements', 'transfers', 'tags'];
    const before = tables.map(rowsOf);
    const linksBefore = sqlite.prepare('SELECT * FROM movement_tags').all();

    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_DIR });

    const after = tables.map(rowsOf);
    for (const [i, name] of tables.entries()) {
      const hasColumn = name === 'movements' || name === 'transfers';
      expect(
        after[i]?.map((row) =>
          Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'deleted_at')),
        ),
        name,
      ).toEqual(before[i]);
      if (hasColumn) {
        expect(after[i]?.length).toBeGreaterThan(0);
        expect(
          after[i]?.every((r) => r.deleted_at === null),
          name,
        ).toBe(true);
      }
    }
    expect(sqlite.prepare('SELECT * FROM movement_tags').all()).toEqual(linksBefore);
  });

  it('lets a trashed movement and a live one share a fixed item and month, but not two live ones', () => {
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_DIR });
    sqlite.exec(`
      INSERT INTO categories (id, name, kind) VALUES (1, 'Ocio', 'expense');
      INSERT INTO recurring_items (id, kind, category_id, concept, amount_cents, expected_day, start_month)
        VALUES (1, 'expense', 1, 'Gimnasio', 3000, 5, '2026-01');
      INSERT INTO movements (id, date, kind, category_id, concept, amount_cents, recurring_item_id, deleted_at)
        VALUES (1, '2026-02-05', 'expense', 1, 'Gimnasio', 3000, 1, '2026-02-06T10:00:00.000Z');
      INSERT INTO movements (id, date, kind, category_id, concept, amount_cents, recurring_item_id)
        VALUES (2, '2026-02-07', 'expense', 1, 'Gimnasio', 3000, 1);
    `);
    expect(() =>
      sqlite.exec(`INSERT INTO movements (date, kind, category_id, concept, amount_cents, recurring_item_id)
        VALUES ('2026-02-09', 'expense', 1, 'Gimnasio', 3000, 1)`),
    ).toThrow(/UNIQUE/);
  });
});
