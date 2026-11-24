import { describe, expect, it } from 'vitest';
import { currentMonth, formatDate, monthLabel, shiftMonth, todayISO } from './months.js';

describe('months', () => {
  it('uses the local calendar date, zero-padded', () => {
    const date = new Date(2026, 0, 5, 23, 30); // 5 Jan 2026, local time
    expect(todayISO(date)).toBe('2026-01-05');
    expect(currentMonth(date)).toBe('2026-01');
  });

  it('shifts across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
    expect(shiftMonth('2026-05', 0)).toBe('2026-05');
    expect(shiftMonth('2026-05', -17)).toBe('2024-12');
  });

  it('labels months and dates in Spanish', () => {
    expect(monthLabel('2026-01')).toBe('enero de 2026');
    expect(monthLabel('2026-12')).toBe('diciembre de 2026');
    expect(formatDate('2026-01-05')).toBe('05/01/2026');
  });
});
