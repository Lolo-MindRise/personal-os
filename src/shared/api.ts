import type { Kind } from './constants.js';

// Response shapes of the HTTP API, shared with the frontend.

export interface CategoryDto {
  id: number;
  name: string;
  kind: Kind;
}

/** A category with how many records point at it; any count above zero blocks deleting it. */
export interface CategoryUsageDto extends CategoryDto {
  movements: number;
  recurringItems: number;
  budgetLines: number;
}

export interface MovementDto {
  id: number;
  date: string;
  kind: Kind;
  categoryId: number;
  categoryName: string;
  concept: string;
  amountCents: number;
  notes: string | null;
  debtId: number | null;
  /** The recurring item this movement confirms, if any (ADR-0005). */
  recurringItemId: number | null;
}

/** A fixed income or expense, defined once (ADR-0005). */
export interface RecurringItemDto {
  id: number;
  kind: Kind;
  categoryId: number;
  categoryName: string;
  concept: string;
  amountCents: number;
  /** Expected day of the month, 1–31 (clamped to the month's length). */
  expectedDay: number;
  startMonth: string;
  endMonth: string | null;
  notes: string | null;
}

/** An item due in a month and not yet confirmed (computed, never stored). */
export interface PendingEntryDto {
  recurringItemId: number;
  month: string;
  /** Expected date: the item's day clamped to the month's length. */
  date: string;
  kind: Kind;
  categoryId: number;
  categoryName: string;
  concept: string;
  amountCents: number;
  notes: string | null;
}

export interface MonthSummaryDto {
  month: string;
  /** Confirmed movements only. */
  incomeCents: number;
  expenseCents: number;
  repaymentCents: number;
  /** income − expenses − repayments; negative when the month is in deficit. */
  savingsCents: number;
  /** Items still pending in the month (not confirmed, not skipped). */
  pendingIncomeCents: number;
  pendingExpenseCents: number;
  pendingRepaymentCents: number;
  /** savings + pending income − pending expenses − pending repayments. */
  projectedSavingsCents: number;
}

/** An extra repayment (a `repayment` movement) linked to a debt. */
export interface DebtRepaymentDto {
  movementId: number;
  date: string;
  concept: string;
  amountCents: number;
}

/** A debt with its linked extra repayments and the estimated current balance (block 4). */
export interface DebtDto {
  id: number;
  name: string;
  monthlyPaymentCents: number;
  /** Balance as last recorded, valid on `balanceAsOf`. */
  balanceCents: number;
  balanceAsOf: string;
  remainingInstallments: number;
  /** Annual rate in basis points (650 = 6,50 %). */
  annualRateBps: number;
  notes: string | null;
  /** Every extra repayment linked to the debt, newest first. */
  repayments: DebtRepaymentDto[];
  /** Sum of the linked repayments dated after `balanceAsOf`. */
  repaidSinceCents: number;
  /** balance − repaid since the as-of date, never below zero. Regular installments are not deducted. */
  estimatedBalanceCents: number;
}

/** One category's row in a month's budget (task 0008, block 3). */
export interface BudgetRowDto {
  categoryId: number;
  categoryName: string;
  kind: Kind;
  /** The budget in effect that month, or null when the category has none. */
  budgetCents: number | null;
  /** Month (`YYYY-MM`) the budget in effect starts from, or null. */
  budgetFrom: string | null;
  /** Confirmed movements of the category in the month. */
  actualCents: number;
  /** budget − actual: positive is under budget, negative is over. Null without a budget. */
  differenceCents: number | null;
}

export interface BudgetMonthDto {
  month: string;
  rows: BudgetRowDto[];
  /** Expense rows only; the difference is total budget − total actual. */
  totals: { budgetCents: number; actualCents: number; differenceCents: number };
}

/** State of the in-app backups (ADR-0003). */
export interface BackupStatusDto {
  /** False when backups do not run (development, or no data directory). */
  enabled: boolean;
  /** ISO timestamp of the newest local backup, or null if there is none. */
  lastBackupAt: string | null;
  localCount: number;
  mirror: {
    configured: boolean;
    /** `ok` after a successful copy, `error` when the mirror is unreachable. */
    state: 'disabled' | 'ok' | 'error';
    count: number;
  };
  /** Spanish messages for the UI banner; empty when everything is fine. */
  warnings: string[];
}

/** Error body for every 4xx response. `fields` maps a field name to its message. */
export interface ApiErrorBody {
  error: string;
  fields?: Record<string, string>;
}
