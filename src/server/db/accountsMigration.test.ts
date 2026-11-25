import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { accountBalance } from '../../shared/accountBalance.js';
import { MIGRATIONS_DIR } from './config.js';

// The accounts migration (plan 0002, task 01) must keep every existing movement with its values
// and assign it to the new account "Principal".

const ACCOUNTS_MIGRATION = '0006_stormy_bastion';

let dir: string;
let sqlite: Database.Database;

/** A copy of the migrations folder that stops right before the accounts migration. */
function migrationsBeforeAccounts(): string {
  const before = join(dir, 'before');
  cpSync(MIGRATIONS_DIR, before, { recursive: true });
  const journalPath = join(before, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: { tag: string }[];
  };
  const cut = journal.entries.findIndex((e) => e.tag === ACCOUNTS_MIGRATION);
  expect(cut).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, cut);
  writeFileSync(journalPath, JSON.stringify(journal));
  return before;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'personal-os-accounts-'));
  sqlite = new Database(join(dir, 'test.sqlite'));
  sqlite.pragma('foreign_keys = ON');
});
afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('accounts migration', () => {
  it('keeps every existing movement intact and assigns it to Principal', () => {
    migrate(drizzle(sqlite), { migrationsFolder: migrationsBeforeAccounts() });
    sqlite.exec(`
      INSERT INTO categories (id, name, kind) VALUES (1, 'Nómina ficticia', 'income'), (2, 'Ocio', 'expense');
      INSERT INTO movements (id, date, kind, category_id, concept, amount_cents, notes) VALUES
        (1, '2026-03-05', 'income', 1, 'Nómina', 200000, NULL),
        (2, '2026-02-10', 'expense', 2, 'Cine', 2400, 'Entradas para dos'),
        (3, '2026-04-01', 'expense', 2, 'Teatro', 3150, NULL);
    `);
    type Row = Record<string, unknown>;
    const before = sqlite.prepare('SELECT * FROM movements ORDER BY id').all() as Row[];
    expect(before).toHaveLength(3);

    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_DIR });

    const after = sqlite.prepare('SELECT * FROM movements ORDER BY id').all() as Row[];
    expect(after).toHaveLength(3);
    for (const [index, row] of after.entries()) {
      const { account_id: accountId, ...rest } = row;
      expect(rest).toEqual(before[index]);
      expect(accountId).toBe(1);
    }
    const accounts = sqlite.prepare('SELECT * FROM accounts').all() as Row[];
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      id: 1,
      name: 'Principal',
      type: 'bank',
      opening_balance_cents: 0,
      // The day before the earliest movement, so that movement counts in the balance.
      opening_balance_date: '2026-02-09',
    });
  });

  it('Principal balance includes every movement, also those on the first day', () => {
    migrate(drizzle(sqlite), { migrationsFolder: migrationsBeforeAccounts() });
    sqlite.exec(`
      INSERT INTO categories (id, name, kind) VALUES (1, 'Nómina ficticia', 'income'), (2, 'Ocio', 'expense');
      INSERT INTO movements (date, kind, category_id, concept, amount_cents) VALUES
        ('2026-03-01', 'income', 1, 'Nómina', 200000),
        ('2026-03-01', 'expense', 2, 'Cine', 2400),
        ('2026-03-01', 'expense', 2, 'Café', 150),
        ('2026-03-20', 'expense', 2, 'Teatro', 3150);
    `);
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_DIR });
    const account = sqlite
      .prepare('SELECT id, opening_balance_cents, opening_balance_date FROM accounts')
      .get() as { id: number; opening_balance_cents: number; opening_balance_date: string };
    expect(account.opening_balance_date).toBe('2026-02-28');
    const rows = sqlite.prepare('SELECT date, kind, amount_cents FROM movements').all() as {
      date: string;
      kind: 'income' | 'expense';
      amount_cents: number;
    }[];
    const balance = accountBalance(
      {
        id: account.id,
        openingBalanceCents: account.opening_balance_cents,
        openingBalanceDate: account.opening_balance_date,
      },
      rows.map((r) => ({
        date: r.date,
        kind: r.kind,
        amountCents: r.amount_cents,
        accountId: account.id,
      })),
      [],
    );
    expect(balance).toBe(200000 - 2400 - 150 - 3150);
  });

  it('creates Principal dated 2025-12-31 when there are no movements', () => {
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_DIR });
    expect(sqlite.prepare('SELECT name, opening_balance_date FROM accounts').all()).toEqual([
      { name: 'Principal', opening_balance_date: '2025-12-31' },
    ]);
  });

  it('rejects a movement with an unknown account, and deleting an account in use', () => {
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_DIR });
    sqlite.exec(`INSERT INTO categories (id, name, kind) VALUES (1, 'Ocio', 'expense')`);
    const insert = (accountId: number) =>
      sqlite
        .prepare(
          `INSERT INTO movements (date, kind, category_id, concept, amount_cents, account_id)
           VALUES ('2026-01-01', 'expense', 1, 'x', 100, ?)`,
        )
        .run(accountId);
    expect(() => insert(99)).toThrow(/existing account/);
    insert(1);
    expect(() => sqlite.prepare('UPDATE movements SET account_id = 99').run()).toThrow(
      /existing account/,
    );
    expect(() => sqlite.prepare('DELETE FROM accounts WHERE id = 1').run()).toThrow(
      /in use|movements/,
    );
  });
});
