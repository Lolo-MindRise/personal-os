import { describe, expect, it } from 'vitest';
import { accountBalance, type BalanceMovement, type BalanceTransfer } from './accountBalance.js';

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
