import type { AccountDto } from './api.js';
import { savingsDelta, type SummaryMovement } from './summary.js';

// Pure account-balance logic (plan 0002, task 03), tested without a database.

export interface BalanceMovement extends SummaryMovement {
  accountId: number;
}

export interface BalanceTransfer {
  /** `YYYY-MM-DD`. */
  date: string;
  amountCents: number;
  fromAccountId: number;
  toAccountId: number;
}

/**
 * Balance of one account: its opening balance plus the movements and transfers dated after the
 * opening date (the opening balance is valid at the end of its own day, as for the savings
 * balance). Movements use the app's sign (income in; expenses and repayments out); a transfer
 * takes its amount out of the origin account and puts it into the destination.
 */
export function accountBalance(
  account: Pick<AccountDto, 'id' | 'openingBalanceCents' | 'openingBalanceDate'>,
  movements: readonly BalanceMovement[],
  transfers: readonly BalanceTransfer[],
): number {
  let total = account.openingBalanceCents;
  for (const m of movements) {
    if (m.accountId === account.id && m.date > account.openingBalanceDate) {
      total += savingsDelta(m);
    }
  }
  for (const t of transfers) {
    if (t.date > account.openingBalanceDate) {
      if (t.fromAccountId === account.id) {
        total -= t.amountCents;
      }
      if (t.toAccountId === account.id) {
        total += t.amountCents;
      }
    }
  }
  return total;
}
