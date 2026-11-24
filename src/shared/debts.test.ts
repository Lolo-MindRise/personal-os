import { describe, expect, it } from 'vitest';
import { estimateBalance, formatRate, parseRate, rateToInput, repaidSince } from './debts.js';

const repayments = [
  { date: '2026-01-25', amountCents: 10_000 },
  { date: '2026-01-31', amountCents: 20_000 },
  { date: '2026-02-01', amountCents: 30_000 },
  { date: '2026-03-15', amountCents: 5_000 },
];

describe('repaidSince', () => {
  it('counts only repayments strictly after the as-of date', () => {
    expect(repaidSince('2026-01-31', repayments)).toBe(35_000);
    expect(repaidSince('2026-01-30', repayments)).toBe(55_000);
    expect(repaidSince('2026-03-15', repayments)).toBe(0);
    expect(repaidSince('2025-12-31', [])).toBe(0);
  });
});

describe('estimateBalance', () => {
  it('is the balance minus the linked repayments after the as-of date', () => {
    expect(estimateBalance(300_000, '2026-01-31', repayments)).toBe(265_000);
  });

  it('is the recorded balance when nothing was repaid since', () => {
    expect(estimateBalance(300_000, '2026-03-15', repayments)).toBe(300_000);
  });

  it('never goes below zero', () => {
    expect(estimateBalance(10_000, '2026-01-31', repayments)).toBe(0);
  });
});

describe('parseRate', () => {
  it.each([
    ['6,5', 650],
    ['6.5', 650],
    ['4,25', 425],
    ['12', 1200],
    ['0', 0],
    ['0,05', 5],
    [' 7,5 % ', 750],
    ['100', 10_000],
  ])('parses %j as %d basis points', (input, bps) => {
    expect(parseRate(input)).toEqual({ ok: true, bps });
  });

  it.each([
    ['', 'Introduce'],
    ['abc', 'no válido'],
    ['-1', 'no válido'],
    ['6,555', 'dos decimales'],
    ['100,01', 'superar'],
    ['101', 'superar'],
    ['1.234,5', 'no válido'],
  ])('rejects %j', (input, message) => {
    const result = parseRate(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(message);
    }
  });
});

describe('formatRate and rateToInput', () => {
  it('formats in es-ES with a no-break space before the percent sign', () => {
    expect(formatRate(650)).toBe('6,50 %');
    expect(formatRate(0)).toBe('0,00 %');
    expect(formatRate(5)).toBe('0,05 %');
    expect(formatRate(10_000)).toBe('100,00 %');
  });

  it('gives back what parseRate accepts', () => {
    for (const bps of [0, 5, 50, 425, 600, 650, 1234, 10_000]) {
      const text = rateToInput(bps);
      expect(parseRate(text)).toEqual({ ok: true, bps });
    }
    expect(rateToInput(650)).toBe('6,5');
    expect(rateToInput(600)).toBe('6');
  });
});
