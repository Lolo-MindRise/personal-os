import { accountBalance } from './accountBalance.js';

/**
 * Whether a movement dated `date` counts in the balance of an account opened on `openingDate`.
 *
 * The rule (movements count strictly after the opening date) lives in `accountBalance`; this
 * asks that function instead of repeating the comparison, so the two cannot drift apart.
 */
export function countsInAccountBalance(date: string, openingDate: string): boolean {
  const delta = accountBalance(
    { id: 1, openingBalanceCents: 0, openingBalanceDate: openingDate },
    [{ accountId: 1, date, kind: 'income', amountCents: 1 }],
    [],
  );
  return delta !== 0;
}

/** A row the balance of the account would silently not count (dated on or before its opening date). */
export function isOutsideAccountBalance(date: string, openingDate: string): boolean {
  return !countsInAccountBalance(date, openingDate);
}
