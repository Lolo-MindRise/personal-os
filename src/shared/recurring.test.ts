import { describe, expect, it } from 'vitest';
import { daysInMonth, expectedDate, isDueInMonth, monthOf } from './recurring.js';

describe('daysInMonth', () => {
  it.each([
    ['2026-01', 31],
    ['2026-02', 28],
    ['2026-04', 30],
    ['2026-12', 31],
    ['2024-02', 29], // leap year
    ['2028-02', 29],
    ['2100-02', 28], // divisible by 100 but not by 400: not a leap year
    ['2000-02', 29], // divisible by 400: leap year
  ])('%s has %i days', (month, days) => {
    expect(daysInMonth(month)).toBe(days);
  });
});

describe('expectedDate', () => {
  it('uses the item day as is when the month is long enough', () => {
    expect(expectedDate('2026-01', 5)).toBe('2026-01-05');
    expect(expectedDate('2026-01', 31)).toBe('2026-01-31');
    expect(expectedDate('2026-04', 30)).toBe('2026-04-30');
  });

  it('clamps day 31 to the month length', () => {
    expect(expectedDate('2026-04', 31)).toBe('2026-04-30');
    expect(expectedDate('2026-02', 31)).toBe('2026-02-28');
  });

  it('clamps 29, 30 and 31 in February, with leap years', () => {
    expect(expectedDate('2026-02', 29)).toBe('2026-02-28');
    expect(expectedDate('2026-02', 30)).toBe('2026-02-28');
    expect(expectedDate('2028-02', 29)).toBe('2028-02-29');
    expect(expectedDate('2028-02', 31)).toBe('2028-02-29');
    expect(expectedDate('2100-02', 29)).toBe('2100-02-28');
  });

  it('always returns a zero-padded real date', () => {
    for (let day = 1; day <= 31; day++) {
      const date = expectedDate('2026-02', day);
      expect(date).toMatch(/^2026-02-\d{2}$/);
      expect(Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())).toBe(false);
    }
  });
});

describe('isDueInMonth', () => {
  const open = { startMonth: '2026-03', endMonth: null };
  const closed = { startMonth: '2026-03', endMonth: '2026-05' };

  it('is not due before the start month, and is due from it on', () => {
    expect(isDueInMonth(open, '2026-02')).toBe(false);
    expect(isDueInMonth(open, '2026-03')).toBe(true);
    expect(isDueInMonth(open, '2026-04')).toBe(true);
  });

  it('without an end month, it never stops (also across years)', () => {
    expect(isDueInMonth(open, '2031-12')).toBe(true);
  });

  it('includes both the start and the end month, and nothing after', () => {
    expect(isDueInMonth(closed, '2026-02')).toBe(false);
    expect(isDueInMonth(closed, '2026-03')).toBe(true);
    expect(isDueInMonth(closed, '2026-05')).toBe(true);
    expect(isDueInMonth(closed, '2026-06')).toBe(false);
  });

  it('works for a one-month item and across a year boundary', () => {
    const single = { startMonth: '2026-07', endMonth: '2026-07' };
    expect(isDueInMonth(single, '2026-06')).toBe(false);
    expect(isDueInMonth(single, '2026-07')).toBe(true);
    expect(isDueInMonth(single, '2026-08')).toBe(false);

    const overYear = { startMonth: '2025-11', endMonth: '2026-02' };
    expect(isDueInMonth(overYear, '2025-12')).toBe(true);
    expect(isDueInMonth(overYear, '2026-01')).toBe(true);
    expect(isDueInMonth(overYear, '2026-03')).toBe(false);
  });
});

describe('monthOf', () => {
  it('takes the month of a date', () => {
    expect(monthOf('2026-02-28')).toBe('2026-02');
  });
});
