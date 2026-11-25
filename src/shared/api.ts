import type { Kind, MilestoneStatus } from './constants.js';

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

/** One page of the movement search, with the totals of the whole filtered set (task 0013). */
export interface MovementSearchDto {
  /** The page asked for, newest first. */
  rows: MovementDto[];
  page: number;
  pageSize: number;
  /** Movements matching the filters, across all pages. */
  count: number;
  pageCount: number;
  /** Over every matching movement, not just this page. `netCents` = income − expenses − repayments. */
  totals: {
    incomeCents: number;
    expenseCents: number;
    repaymentCents: number;
    netCents: number;
  };
}

/** One projected month (task 0013, block 4), in cents. */
export interface ProjectionMonthDto {
  month: string;
  incomeCents: number;
  expenseCents: number;
  repaymentCents: number;
  /** income − expenses − repayments; negative when the month is projected in deficit. */
  savingsCents: number;
  /** Accumulated savings at the end of the month: the baseline plus every month so far. */
  accumulatedCents: number;
  /** Projected total per category (only categories above zero), for scenarios on a category. */
  byCategory: { categoryId: number; cents: number }[];
}

/** The base projection from the current month to a chosen end month. */
export interface ProjectionDto {
  /** The month of today: the first projected month. */
  currentMonth: string;
  endMonth: string;
  /** Accumulated savings at the end of the previous month, where the projection starts. */
  baselineCents: number;
  months: ProjectionMonthDto[];
  /** Every category, so the page can offer expense categories for scenarios and name them. */
  categories: CategoryDto[];
  /** Goals, to mark their targets and dates on the chart. */
  goals: { id: number; name: string; targetAmountCents: number; targetDate: string }[];
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
  /** The debt whose installments this item pays, if any: confirming it reduces the debt. */
  debtId: number | null;
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
  /** Linked extra repayments dated after `balanceAsOf` that reduced the balance (capped at what was owed). */
  repaidSinceCents: number;
  /**
   * Recorded balance minus the principal of the confirmed installments of linked recurring items
   * and the extra repayments after `balanceAsOf` (French amortization), never below zero.
   */
  estimatedBalanceCents: number;
  /** Principal repaid by those installments (the part that reduced the balance). */
  principalPaidCents: number;
  /** Interest paid inside those installments. */
  interestPaidCents: number;
  /** Confirmed installments after `balanceAsOf`, oldest first, split into interest and principal. */
  installments: DebtInstallmentDto[];
}

export interface DebtInstallmentDto {
  movementId: number;
  date: string;
  paidCents: number;
  interestCents: number;
  principalCents: number;
  balanceAfterCents: number;
}

/** A milestone: a dated step towards a goal, with a status. */
export interface MilestoneDto {
  id: number;
  title: string;
  targetDate: string;
  status: MilestoneStatus;
  notes: string | null;
}

/** App settings (block 5). Without a saved date, savings accumulate from the first movement. */
export interface SettingsDto {
  initialSavingsCents: number;
  /** The date the initial balance is valid on (`YYYY-MM-DD`), or null when not set. */
  initialSavingsDate: string | null;
}

export interface YearSummaryRowDto {
  month: string;
  incomeCents: number;
  expenseCents: number;
  repaymentCents: number;
  /** income − expenses − repayments of the whole month (negative in deficit). */
  savingsCents: number;
  /**
   * Initial balance plus the savings of every movement after the initial date, up to the end of
   * the month. Null for months that end before the initial date.
   */
  accumulatedCents: number | null;
}

export interface YearSummaryDto {
  year: number;
  settings: SettingsDto;
  rows: YearSummaryRowDto[];
  totals: {
    incomeCents: number;
    expenseCents: number;
    repaymentCents: number;
    savingsCents: number;
  };
}

/** A savings goal with its progress against the accumulated savings. */
export interface GoalDto {
  id: number;
  name: string;
  targetAmountCents: number;
  targetDate: string;
  /** Accumulated savings today (shared by all goals: they are not split between goals). */
  accumulatedCents: number;
  /** Whole percent reached, 0 to 100. */
  progressPercent: number;
  /** target − accumulated, never below zero. */
  remainingCents: number;
  /** `reached` (nothing left), `overdue` (target date passed, goal not reached) or `open`. */
  status: 'reached' | 'overdue' | 'open';
  /** Months left including the current one; null unless the goal is open. */
  monthsLeft: number | null;
  /** remaining / months left, rounded up; null unless the goal is open. */
  monthlyRequiredCents: number | null;
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

/** One month of the dashboard's 12-month window (same figures as a Resumen row). */
export interface DashboardMonthDto {
  month: string;
  incomeCents: number;
  expenseCents: number;
  repaymentCents: number;
  savingsCents: number;
  /** Accumulated savings at the end of the month; null before the initial balance date. */
  accumulatedCents: number | null;
}

/** An expense category of the selected month with the budget in effect (null when none). */
export interface DashboardCategoryDto {
  categoryId: number;
  categoryName: string;
  budgetCents: number | null;
  actualCents: number;
  /** True only when there is a budget and the actual amount exceeds it. */
  overBudget: boolean;
}

export interface DashboardDebtDto {
  id: number;
  name: string;
  estimatedBalanceCents: number;
  remainingInstallments: number;
  monthlyPaymentCents: number;
  /** The balance as last recorded and its date: the baseline of the progress. */
  recordedBalanceCents: number;
  balanceAsOf: string;
  /** Capital repaid since the as-of date: recorded balance − estimated balance. */
  repaidSinceCents: number;
  /** Interest paid in the confirmed installments since the as-of date. */
  interestPaidCents: number;
  /**
   * Whole percent of the recorded balance repaid (installment principal and extra repayments) since its date.
   * Null when the recorded balance is zero (there is no baseline). The original amount of the
   * loan is not stored, so progress is never measured against it.
   */
  progressPercent: number | null;
}

export interface DashboardMilestoneDto extends MilestoneDto {
  overdue: boolean;
}

/** Everything the home screen shows (task 0011), in cents. */
export interface DashboardDto {
  month: string;
  /** The server's local date, used for goals and overdue milestones. */
  today: string;
  /** What exists yet, so each block can say what to set up. */
  setup: {
    initialBalance: boolean;
    movements: boolean;
    goals: boolean;
    budget: boolean;
    debts: boolean;
  };
  keyFigures: {
    /**
     * Accumulated savings at the end of the selected month (the chart's last point); null when
     * the month ends before the initial balance date.
     */
    accumulatedSavingsCents: number | null;
    /** The goal with the nearest target date that is not in the past, or null. */
    nextGoal: GoalDto | null;
    totalDebtCents: number;
    /** Savings of the month plus what is still pending (ADR-0005). */
    projectedSavingsCents: number;
    /**
     * The same figures one month earlier (month-over-month); null where that month has no data.
     * Debt and goals have no monthly history, so they have no previous value.
     */
    previous: {
      month: string;
      accumulatedSavingsCents: number | null;
      projectedSavingsCents: number | null;
    };
  };
  /** The 12 months ending at `month`, oldest first. */
  months: DashboardMonthDto[];
  categories: DashboardCategoryDto[];
  debts: { items: DashboardDebtDto[]; totalEstimatedCents: number };
  upcoming: {
    pending: PendingEntryDto[];
    /** The next three milestones not done, overdue first (earliest date first). */
    milestones: DashboardMilestoneDto[];
  };
}

/** "Concept contains `pattern`" → category (task 0013, block 2). */
export interface CategoryRuleDto {
  id: number;
  pattern: string;
  categoryId: number;
  categoryName: string;
  kind: Kind;
}

/** One CSV row after classification, shown in the import preview. */
export interface ImportPreviewRowDto {
  date: string;
  concept: string;
  /** Signed, as in the file: negative is money out. */
  amountCents: number;
  /** The proposed kind (the category's, or from the sign when there is no category yet). */
  kind: Kind;
  categoryId: number | null;
  categoryName: string | null;
  /** The rule that proposed the category, if any. */
  ruleId: number | null;
  /**
   * `new` (will become a movement), `duplicate` (same date, amount and concept already exist),
   * `recurring` (confirms a pending fixed item) or `noCategory` (a category must be chosen).
   */
  status: 'new' | 'duplicate' | 'recurring' | 'noCategory';
  recurringItemId: number | null;
  recurringConcept: string | null;
  /** For a duplicate: why ("ya existe un movimiento igual" or "ya confirmado como fijo"). */
  reason: string | null;
}

export interface ImportSummaryDto {
  /** New movements created. */
  created: number;
  /** Pending fixed items confirmed by a row. */
  confirmedRecurring: number;
}

export interface BackupTiersDto {
  /** Last 48 hours. */
  recent: number;
  /** Newest of each day, last 60 days. */
  daily: number;
  /** Newest of each month. */
  monthly: number;
  /** Kept only because they are `-pre-migration` or `-before-restore` (10 newest of each). */
  preMigration: number;
}

export interface BackupSetStatusDto {
  count: number;
  oldestBackupAt: string | null;
  tiers: BackupTiersDto;
}

/** State of the in-app backups (ADR-0003). */
export interface BackupStatusDto {
  /** False when backups do not run (development, or no data directory). */
  enabled: boolean;
  /** ISO timestamp of the newest local backup file (a `-before-restore` copy counts), or null. */
  lastBackupAt: string | null;
  localCount: number;
  /** ISO timestamp of the oldest local backup (the furthest back Manuel can restore), or null. */
  oldestBackupAt: string | null;
  /** Local backups per retention tier; each file is counted once, in the first tier that keeps it. */
  tiers: BackupTiersDto;
  mirror: BackupSetStatusDto & {
    configured: boolean;
    /** `ok` after a successful copy, `error` when the mirror is unreachable. */
    state: 'disabled' | 'ok' | 'error';
  };
  /** Spanish messages for the UI banner; empty when everything is fine. */
  warnings: string[];
}

/** Error body for every 4xx response. `fields` maps a field name to its message. */
export interface ApiErrorBody {
  error: string;
  fields?: Record<string, string>;
}
