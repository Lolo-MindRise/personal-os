/** Category and movement kinds. The kind gives the direction of the money. */
export const KINDS = ['income', 'expense', 'repayment'] as const;
export type Kind = (typeof KINDS)[number];

export const MILESTONE_STATUSES = ['pending', 'in_progress', 'done'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];
