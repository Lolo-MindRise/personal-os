/** Category and movement kinds. The kind gives the direction of the money. */
export const KINDS = ['income', 'expense', 'repayment'] as const;
export type Kind = (typeof KINDS)[number];

export const MILESTONE_STATUSES = ['pending', 'in_progress', 'done'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

/** Account types: a bank account, cash in hand, or a savings account. */
export const ACCOUNT_TYPES = ['bank', 'cash', 'savings'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** The account every movement belongs to unless another is chosen. Created by the migration. */
export const DEFAULT_ACCOUNT_ID = 1;
export const DEFAULT_ACCOUNT_NAME = 'Principal';
