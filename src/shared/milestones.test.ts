import { describe, expect, it } from 'vitest';
import { isOverdue } from './milestones.js';

describe('isOverdue', () => {
  const today = '2026-11-25';

  it('is overdue when the date has passed and the milestone is not done', () => {
    expect(isOverdue({ targetDate: '2026-11-24', status: 'pending' }, today)).toBe(true);
    expect(isOverdue({ targetDate: '2020-01-01', status: 'in_progress' }, today)).toBe(true);
  });

  it('is never overdue once done', () => {
    expect(isOverdue({ targetDate: '2020-01-01', status: 'done' }, today)).toBe(false);
  });

  it('is not overdue on the target day itself, nor before it', () => {
    expect(isOverdue({ targetDate: '2026-11-25', status: 'pending' }, today)).toBe(false);
    expect(isOverdue({ targetDate: '2026-11-26', status: 'pending' }, today)).toBe(false);
    expect(isOverdue({ targetDate: '2027-01-01', status: 'in_progress' }, today)).toBe(false);
  });
});
