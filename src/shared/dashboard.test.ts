import { describe, expect, it } from 'vitest';
import type { GoalDto, MilestoneDto, SettingsDto } from './api.js';
import {
  debtProgressPercent,
  monthRows,
  monthsEnding,
  nextGoal,
  upcomingMilestones,
} from './dashboard.js';

describe('monthsEnding', () => {
  it('gives 12 months ending at the selected one, oldest first', () => {
    const months = monthsEnding('2026-06');
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2025-07');
    expect(months[11]).toBe('2026-06');
  });

  it('crosses a year boundary without skipping or repeating a month', () => {
    expect(monthsEnding('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(new Set(monthsEnding('2026-01')).size).toBe(12);
    expect(monthsEnding('2026-01')[0]).toBe('2025-02');
  });

  it('ending in December stays inside one year', () => {
    expect(monthsEnding('2026-12')[0]).toBe('2026-01');
  });
});

describe('monthRows', () => {
  const settings: SettingsDto = { initialSavingsCents: 1_000, initialSavingsDate: '2025-12-31' };
  const movements = [
    { date: '2025-12-20', kind: 'income' as const, amountCents: 500 },
    { date: '2026-01-05', kind: 'income' as const, amountCents: 3_000 },
    { date: '2026-01-06', kind: 'expense' as const, amountCents: 1_200 },
    { date: '2026-02-01', kind: 'repayment' as const, amountCents: 100 },
  ];

  it('returns one row per requested month across a year boundary, with accumulated savings', () => {
    const rows = monthRows(['2025-12', '2026-01', '2026-02'], settings, movements);
    expect(rows.map((r) => r.month)).toEqual(['2025-12', '2026-01', '2026-02']);
    // December ends on the initial date: the balance is the initial one.
    expect(rows[0]?.accumulatedCents).toBe(1_000);
    expect(rows[1]).toMatchObject({
      incomeCents: 3_000,
      expenseCents: 1_200,
      savingsCents: 1_800,
      accumulatedCents: 2_800,
    });
    expect(rows[2]).toMatchObject({
      repaymentCents: 100,
      savingsCents: -100,
      accumulatedCents: 2_700,
    });
  });

  it('has no accumulated figure before the initial date, and zeros without movements', () => {
    const rows = monthRows(['2025-11'], settings, []);
    expect(rows).toEqual([
      {
        month: '2025-11',
        incomeCents: 0,
        expenseCents: 0,
        repaymentCents: 0,
        savingsCents: 0,
        accumulatedCents: null,
      },
    ]);
  });
});

const goal = (id: number, targetDate: string): GoalDto => ({
  id,
  name: `g${String(id)}`,
  targetAmountCents: 100,
  targetDate,
  accumulatedCents: 0,
  progressPercent: 0,
  remainingCents: 100,
  status: 'open',
  monthsLeft: 1,
  monthlyRequiredCents: 100,
});

describe('nextGoal', () => {
  it('picks the nearest target date that is not in the past', () => {
    const goals = [goal(1, '2026-03-01'), goal(2, '2027-01-01'), goal(3, '2026-12-31')];
    expect(nextGoal(goals, '2026-06-15')?.id).toBe(3);
  });

  it('counts a goal due today, and is null without a future goal', () => {
    expect(nextGoal([goal(1, '2026-06-15')], '2026-06-15')?.id).toBe(1);
    expect(nextGoal([goal(1, '2026-06-14')], '2026-06-15')).toBeNull();
    expect(nextGoal([], '2026-06-15')).toBeNull();
  });
});

const milestone = (
  id: number,
  targetDate: string,
  status: MilestoneDto['status'],
): MilestoneDto => ({
  id,
  title: `m${String(id)}`,
  targetDate,
  status,
  notes: null,
});

describe('upcomingMilestones', () => {
  it('skips done ones, leads with overdue and keeps three', () => {
    const list = upcomingMilestones(
      [
        milestone(1, '2026-09-01', 'pending'),
        milestone(2, '2026-01-01', 'in_progress'),
        milestone(3, '2026-02-01', 'done'),
        milestone(4, '2026-07-01', 'pending'),
        milestone(5, '2026-08-01', 'pending'),
      ],
      '2026-06-15',
    );
    expect(list.map((m) => m.id)).toEqual([2, 4, 5]);
    expect(list.map((m) => m.overdue)).toEqual([true, false, false]);
  });

  it('the target day itself is not overdue', () => {
    const [only] = upcomingMilestones([milestone(1, '2026-06-15', 'pending')], '2026-06-15');
    expect(only?.overdue).toBe(false);
  });
});

describe('debtProgressPercent', () => {
  it('is the share of the recorded balance repaid since its date, floored and clamped', () => {
    expect(debtProgressPercent(10_000, 2_500)).toBe(25);
    expect(debtProgressPercent(10_000, 9_999)).toBe(99);
    expect(debtProgressPercent(10_000, 20_000)).toBe(100);
    expect(debtProgressPercent(10_000, 0)).toBe(0);
  });

  it('is null without a baseline (recorded balance zero)', () => {
    expect(debtProgressPercent(0, 0)).toBeNull();
  });
});
