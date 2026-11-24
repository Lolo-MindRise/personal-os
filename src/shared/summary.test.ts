import { describe, expect, it } from 'vitest';
import type { SettingsDto } from './api.js';
import {
  accumulatedAt,
  buildYearSummary,
  goalProgress,
  monthsBetween,
  savingsDelta,
  type SummaryMovement,
} from './summary.js';

const m = (date: string, kind: SummaryMovement['kind'], amountCents: number): SummaryMovement => ({
  date,
  kind,
  amountCents,
});

const none: SettingsDto = { initialSavingsCents: 0, initialSavingsDate: null };
const initial: SettingsDto = { initialSavingsCents: 100_000, initialSavingsDate: '2026-01-15' };

const movements = [
  m('2026-01-10', 'income', 50_000), // before the initial date: already in the initial balance
  m('2026-01-15', 'expense', 7_000), // on the initial date: also already in it
  m('2026-01-16', 'income', 200_000),
  m('2026-01-20', 'expense', 80_000),
  m('2026-01-25', 'repayment', 10_000),
  m('2026-02-01', 'income', 200_000),
  m('2026-02-05', 'expense', 150_000),
  m('2025-12-31', 'income', 999),
];

describe('savingsDelta', () => {
  it('adds income and subtracts expenses and repayments', () => {
    expect(savingsDelta(m('2026-01-01', 'income', 5))).toBe(5);
    expect(savingsDelta(m('2026-01-01', 'expense', 5))).toBe(-5);
    expect(savingsDelta(m('2026-01-01', 'repayment', 5))).toBe(-5);
  });
});

describe('accumulatedAt', () => {
  it('is the initial balance plus the savings of movements strictly after the initial date', () => {
    expect(accumulatedAt(initial, movements, '2026-01-15')).toBe(100_000);
    expect(accumulatedAt(initial, movements, '2026-01-16')).toBe(300_000);
    expect(accumulatedAt(initial, movements, '2026-01-31')).toBe(
      100_000 + 200_000 - 80_000 - 10_000,
    );
    expect(accumulatedAt(initial, movements, '2026-02-28')).toBe(100_000 + 110_000 + 50_000);
  });

  it('includes a movement on the target date itself', () => {
    expect(accumulatedAt(initial, [m('2026-03-01', 'income', 10)], '2026-03-01')).toBe(100_010);
  });

  it('without an initial date, counts every movement from the start', () => {
    expect(accumulatedAt(none, movements, '2026-01-10')).toBe(999 + 50_000);
  });
});

describe('buildYearSummary', () => {
  const summary = buildYearSummary(2026, initial, movements);
  const row = (month: string) => summary.rows.find((r) => r.month === month);

  it('has twelve months in order, with zeros for empty ones', () => {
    expect(summary.rows.map((r) => r.month)).toEqual(
      Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`),
    );
    expect(row('2026-06')).toMatchObject({
      incomeCents: 0,
      expenseCents: 0,
      repaymentCents: 0,
      savingsCents: 0,
    });
  });

  it('totals each kind per month and the savings of the whole month', () => {
    expect(row('2026-01')).toMatchObject({
      incomeCents: 250_000,
      expenseCents: 87_000,
      repaymentCents: 10_000,
      savingsCents: 153_000,
    });
    expect(row('2026-02')).toMatchObject({
      incomeCents: 200_000,
      expenseCents: 150_000,
      savingsCents: 50_000,
    });
  });

  it('accumulates from the initial balance, carrying through months without movements', () => {
    expect(row('2026-01')?.accumulatedCents).toBe(210_000);
    expect(row('2026-02')?.accumulatedCents).toBe(260_000);
    expect(row('2026-12')?.accumulatedCents).toBe(260_000);
  });

  it('has no accumulated value for months that end before the initial date', () => {
    const later = buildYearSummary(
      2026,
      { initialSavingsCents: 5_000, initialSavingsDate: '2026-03-10' },
      movements,
    );
    expect(later.rows[0]?.accumulatedCents).toBeNull();
    expect(later.rows[1]?.accumulatedCents).toBeNull();
    expect(later.rows[2]?.accumulatedCents).toBe(5_000); // March contains the date
    expect(later.rows[3]?.accumulatedCents).toBe(5_000);
  });

  it('carries the previous years in: a later year starts from what was saved before', () => {
    expect(buildYearSummary(2027, initial, movements).rows[0]?.accumulatedCents).toBe(260_000);
  });

  it('uses movements from before the year without an initial date', () => {
    const noDate = buildYearSummary(2026, none, movements);
    expect(noDate.rows[0]?.accumulatedCents).toBe(999 + 250_000 - 87_000 - 10_000);
  });

  it('totals the year', () => {
    expect(summary.totals).toEqual({
      incomeCents: 450_000,
      expenseCents: 237_000,
      repaymentCents: 10_000,
      savingsCents: 203_000,
    });
  });

  it('ignores movements of other years in the rows', () => {
    expect(buildYearSummary(2025, none, movements).rows[11]).toMatchObject({ incomeCents: 999 });
  });

  it('handles a leap February', () => {
    const leap = buildYearSummary(2028, none, [m('2028-02-29', 'income', 100)]);
    expect(leap.rows[1]?.accumulatedCents).toBe(100);
  });
});

describe('monthsBetween', () => {
  it('counts calendar months, across years, negative backwards', () => {
    expect(monthsBetween('2026-11', '2026-12')).toBe(1);
    expect(monthsBetween('2026-11', '2027-02')).toBe(3);
    expect(monthsBetween('2026-11', '2026-11')).toBe(0);
    expect(monthsBetween('2026-11', '2026-09')).toBe(-2);
  });
});

describe('goalProgress', () => {
  const goal = { id: 1, name: 'Fondo', targetAmountCents: 600_000, targetDate: '2026-12-31' };

  it('open: progress, what is left, and the monthly saving needed, counting the current month', () => {
    const result = goalProgress(goal, 300_000, '2026-10-20');
    expect(result).toMatchObject({
      status: 'open',
      accumulatedCents: 300_000,
      progressPercent: 50,
      remainingCents: 300_000,
      monthsLeft: 3, // October, November, December
      monthlyRequiredCents: 100_000,
    });
  });

  it('rounds the monthly saving up to the cent, never down', () => {
    const result = goalProgress(goal, 0, '2026-10-20');
    expect(result.monthlyRequiredCents).toBe(200_000);
    const odd = goalProgress({ ...goal, targetAmountCents: 100_000 }, 0, '2026-10-20');
    expect(odd.monthlyRequiredCents).toBe(33_334);
    expect((odd.monthlyRequiredCents ?? 0) * (odd.monthsLeft ?? 0)).toBeGreaterThanOrEqual(100_000);
  });

  it('needs everything within the month when the target is this month', () => {
    const result = goalProgress(goal, 500_000, '2026-12-05');
    expect(result).toMatchObject({ status: 'open', monthsLeft: 1, monthlyRequiredCents: 100_000 });
  });

  it('the target day itself is not overdue', () => {
    expect(goalProgress(goal, 0, '2026-12-31').status).toBe('open');
    expect(goalProgress(goal, 0, '2027-01-01').status).toBe('overdue');
  });

  it('overdue: no monthly figure, the amount still needed stays', () => {
    expect(goalProgress(goal, 100_000, '2027-02-01')).toMatchObject({
      status: 'overdue',
      remainingCents: 500_000,
      monthsLeft: null,
      monthlyRequiredCents: null,
    });
  });

  it('reached: 100 %, nothing left, even when overdue or exceeded', () => {
    for (const today of ['2026-10-01', '2027-06-01']) {
      expect(goalProgress(goal, 650_000, today)).toMatchObject({
        status: 'reached',
        progressPercent: 100,
        remainingCents: 0,
        monthlyRequiredCents: null,
      });
    }
    expect(goalProgress(goal, 600_000, '2026-10-01').status).toBe('reached');
  });

  it('floors the percent, so 99,9 % never shows as done, and clamps negative savings to 0 %', () => {
    expect(goalProgress(goal, 599_999, '2026-10-01').progressPercent).toBe(99);
    const negative = goalProgress(goal, -5_000, '2026-10-01');
    expect(negative.progressPercent).toBe(0);
    expect(negative.remainingCents).toBe(605_000);
  });
});
