import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from './config.js';

// The tags migration (plan 0002, task 04) only adds tables: every existing row must survive.

const TAGS_MIGRATION = '0008_odd_may_parker';

let dir: string;
let sqlite: Database.Database;

/** A copy of the migrations folder that stops right before the tags migration. */
function migrationsBeforeTags(): string {
  const before = join(dir, 'before');
  cpSync(MIGRATIONS_DIR, before, { recursive: true });
  const journalPath = join(before, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: { tag: string }[];
  };
  const cut = journal.entries.findIndex((e) => e.tag === TAGS_MIGRATION);
  expect(cut).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, cut);
  writeFileSync(journalPath, JSON.stringify(journal));
  return before;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'personal-os-tags-'));
  sqlite = new Database(join(dir, 'test.sqlite'));
  sqlite.pragma('foreign_keys = ON');
});
afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('tags migration', () => {
  it('keeps every existing row and adds empty tags tables', () => {
    migrate(drizzle(sqlite), { migrationsFolder: migrationsBeforeTags() });
    sqlite.exec(`
      INSERT INTO accounts (id, name, type, opening_balance_cents, opening_balance_date)
        VALUES (2, 'Efectivo', 'cash', 5000, '2026-01-01');
      INSERT INTO categories (id, name, kind) VALUES (1, 'Nómina ficticia', 'income'), (2, 'Ocio', 'expense');
      INSERT INTO movements (id, date, kind, category_id, concept, amount_cents, notes, account_id) VALUES
        (1, '2026-03-05', 'income', 1, 'Nómina', 200000, NULL, 1),
        (2, '2026-02-10', 'expense', 2, 'Cine', 2400, 'Entradas para dos', 2);
      INSERT INTO transfers (id, date, amount_cents, from_account_id, to_account_id)
        VALUES (1, '2026-03-06', 1000, 1, 2);
    `);
    type Row = Record<string, unknown>;
    const tables = ['accounts', 'categories', 'movements', 'transfers'];
    const before = tables.map(
      (t) => sqlite.prepare(`SELECT * FROM ${t} ORDER BY id`).all() as Row[],
    );
    expect(before.map((rows) => rows.length)).toEqual([2, 2, 2, 1]);

    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_DIR });

    const after = tables.map(
      (t) => sqlite.prepare(`SELECT * FROM ${t} ORDER BY id`).all() as Row[],
    );
    expect(after).toEqual(before);
    expect(sqlite.prepare('SELECT count(*) AS n FROM tags').get()).toEqual({ n: 0 });
    expect(sqlite.prepare('SELECT count(*) AS n FROM movement_tags').get()).toEqual({ n: 0 });
  });

  it('enforces unique names and cascades links when a movement or a tag goes', () => {
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_DIR });
    sqlite.exec(`
      INSERT INTO categories (id, name, kind) VALUES (1, 'Ocio', 'expense');
      INSERT INTO movements (id, date, kind, category_id, concept, amount_cents) VALUES
        (1, '2026-02-10', 'expense', 1, 'Cine', 2400),
        (2, '2026-02-11', 'expense', 1, 'Teatro', 3000);
      INSERT INTO tags (id, name, name_key) VALUES (1, 'Viaje', 'viaje'), (2, 'Casa', 'casa');
      INSERT INTO movement_tags (movement_id, tag_id) VALUES (1, 1), (1, 2), (2, 1);
    `);
    expect(() =>
      sqlite.exec("INSERT INTO tags (name, name_key) VALUES ('VIAJE', 'viaje')"),
    ).toThrow(/UNIQUE/);
    expect(() =>
      sqlite.exec('INSERT INTO movement_tags (movement_id, tag_id) VALUES (1, 1)'),
    ).toThrow(/UNIQUE|PRIMARY/);
    expect(() =>
      sqlite.exec('INSERT INTO movement_tags (movement_id, tag_id) VALUES (1, 99)'),
    ).toThrow(/FOREIGN KEY/);

    sqlite.exec('DELETE FROM tags WHERE id = 2');
    expect(sqlite.prepare('SELECT count(*) AS n FROM movements').get()).toEqual({ n: 2 });
    expect(sqlite.prepare('SELECT count(*) AS n FROM movement_tags').get()).toEqual({ n: 2 });

    sqlite.exec('DELETE FROM movements WHERE id = 1');
    expect(sqlite.prepare('SELECT tag_id FROM movement_tags').all()).toEqual([{ tag_id: 1 }]);
    expect(sqlite.prepare('SELECT count(*) AS n FROM tags').get()).toEqual({ n: 1 });
  });
});
