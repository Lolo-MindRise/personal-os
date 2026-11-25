import { describe, expect, it } from 'vitest';
import {
  accountBalance,
  accountBalanceAt,
  inReconcilePeriod,
  type BalanceMovement,
  type BalanceTransfer,
} from './accountBalance.js';

const account = { id: 1, openingBalanceCents: 50_000, openingBalanceDate: '2026-01-31' };

const move = (overrides: Partial<BalanceMovement>): BalanceMovement => ({
  accountId: 1,
  date: '2026-02-10',
  kind: 'income',
  amountCents: 1_000,
  ...overrides,
});

const transfer = (overrides: Partial<BalanceTransfer>): BalanceTransfer => ({
  date: '2026-02-10',
  amountCents: 1_000,
  fromAccountId: 1,
  toAccountId: 2,
  ...overrides,
});

describe('accountBalance', () => {
  it('is the opening balance when nothing happened', () => {
    expect(accountBalance(account, [], [])).toBe(50_000);
  });

  it('adds income and subtracts expenses and repayments', () => {
    const moves = [
      move({ kind: 'income', amountCents: 200_000 }),
      move({ kind: 'expense', amountCents: 30_000 }),
      move({ kind: 'repayment', amountCents: 5_000 }),
    ];
    expect(accountBalance(account, moves, [])).toBe(50_000 + 200_000 - 30_000 - 5_000);
  });

  it('ignores other accounts and movements on or before the opening date', () => {
    const moves = [
      move({ accountId: 2 }),
      move({ date: '2026-01-31' }),
      move({ date: '2026-01-01' }),
      move({ date: '2026-02-01', amountCents: 7 }),
    ];
    expect(accountBalance(account, moves, [])).toBe(50_007);
  });

  it('takes a transfer out of the origin and into the destination', () => {
    const t = [transfer({ amountCents: 10_000 })];
    expect(accountBalance(account, [], t)).toBe(40_000);
    expect(accountBalance({ ...account, id: 2 }, [], t)).toBe(60_000);
    expect(accountBalance({ ...account, id: 3 }, [], t)).toBe(50_000);
  });

  it('ignores a transfer dated on or before the opening date', () => {
    expect(accountBalance(account, [], [transfer({ date: '2026-01-31' })])).toBe(50_000);
  });

  it('works with a negative opening balance', () => {
    expect(accountBalance({ ...account, openingBalanceCents: -2_000 }, [move({})], [])).toBe(
      -1_000,
    );
  });
});

describe('accountBalanceAt', () => {
  const moves = [
    move({ date: '2026-01-31', amountCents: 9_999 }), // on the opening date: never counts
    move({ date: '2026-02-01', amountCents: 100 }), // day after opening: counts
    move({ date: '2026-02-10', kind: 'expense', amountCents: 30 }),
    move({ date: '2026-02-11', amountCents: 5_000 }), // after the reconcile date
  ];
  const moved = [
    transfer({ date: '2026-02-05', amountCents: 400 }), // out
    transfer({ date: '2026-02-06', amountCents: 250, fromAccountId: 2, toAccountId: 1 }), // in
    transfer({ date: '2026-02-12', amountCents: 8_000 }), // after
  ];

  it('equals the plain balance when the date is after every row', () => {
    expect(accountBalanceAt(account, moves, moved, '2026-12-31')).toBe(
      accountBalance(account, moves, moved),
    );
  });

  it('is the opening balance on the opening date', () => {
    expect(accountBalanceAt(account, moves, moved, '2026-01-31')).toBe(50_000);
  });

  it('counts rows dated on the reconcile date and not the ones after it', () => {
    // 50_000 + 100 - 30 - 400 + 250
    expect(accountBalanceAt(account, moves, moved, '2026-02-10')).toBe(49_920);
    // the day before the expense
    expect(accountBalanceAt(account, moves, moved, '2026-02-09')).toBe(49_950);
    // a transfer dated exactly on the date counts
    expect(accountBalanceAt(account, moves, moved, '2026-02-12')).toBe(49_920 + 5_000 - 8_000);
  });

  it('takes transfers out of the origin and into the destination', () => {
    expect(accountBalanceAt({ ...account, id: 2 }, [], moved, '2026-02-06')).toBe(
      50_000 + 400 - 250,
    );
  });
});

describe('inReconcilePeriod', () => {
  it('starts after the opening date and ends on the date', () => {
    expect(inReconcilePeriod('2026-01-31', '2026-01-31', undefined, '2026-02-10')).toBe(false);
    expect(inReconcilePeriod('2026-02-01', '2026-01-31', undefined, '2026-02-10')).toBe(true);
    expect(inReconcilePeriod('2026-02-10', '2026-01-31', undefined, '2026-02-10')).toBe(true);
    expect(inReconcilePeriod('2026-02-11', '2026-01-31', undefined, '2026-02-10')).toBe(false);
  });

  it('starts after the last reconciliation when there is one', () => {
    expect(inReconcilePeriod('2026-02-05', '2026-01-31', '2026-02-05', '2026-02-10')).toBe(false);
    expect(inReconcilePeriod('2026-02-06', '2026-01-31', '2026-02-05', '2026-02-10')).toBe(true);
    // a stale last reconciliation before the opening date does not widen the period
    expect(inReconcilePeriod('2026-01-15', '2026-01-31', '2026-01-01', '2026-02-10')).toBe(false);
  });
});
