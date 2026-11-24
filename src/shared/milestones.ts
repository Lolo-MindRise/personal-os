import type { MilestoneStatus } from './constants.js';

/**
 * A milestone is overdue when its target date is before `today` (`YYYY-MM-DD`) and it is not
 * done. The target day itself is not overdue yet.
 */
export function isOverdue(
  milestone: { targetDate: string; status: MilestoneStatus },
  today: string,
): boolean {
  return milestone.status !== 'done' && milestone.targetDate < today;
}
