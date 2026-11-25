import { describe, expect, it } from 'vitest';
import { accountBalance } from './accountBalance.js';
import { countsInAccountBalance, isOutsideAccountBalance } from './importAccount.js';

describe('countsInAccountBalance', () => {
  it('does not count the opening date itself, nor earlier days; counts the next day', () => {
    expect(isOutsideAccountBalance('2026-01-10', '2026-01-10')).toBe(true);
    expect(isOutsideAccountBalance('2026-01-09', '2026-01-10')).toBe(true);
    expect(isOutsideAccountBalance('2026-01-11', '2026-01-10')).toBe(false);
    expect(countsInAccountBalance('2026-01-11', '2026-01-10')).toBe(true);
  });

  it('agrees with the balance function for expenses too', () => {
    const account = { id: 1, openingBalanceCents: 100, openingBalanceDate: '2026-01-10' };
    for (const date of ['2026-01-09', '2026-01-10', '2026-01-11']) {
      const moved =
        accountBalance(account, [{ accountId: 1, date, kind: 'expense', amountCents: 30 }], []) !==
        100;
      expect(countsInAccountBalance(date, account.openingBalanceDate)).toBe(moved);
    }
  });
});
