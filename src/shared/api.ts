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
