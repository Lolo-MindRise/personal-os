import { describe, expect, it } from 'vitest';
import { centsToInput, formatCents, MONEY_ERRORS, parseMoney } from './money.js';

const cents = (input: string) => {
  const result = parseMoney(input);
  return result.ok ? result.cents : result.error;
};

describe('parseMoney: accepted formats', () => {
  it.each([
    ['12,50', 1250],
    ['12.5', 1250],
    ['12,5', 1250],
    ['1.234,56', 123456],
    ['1234', 123400],
    ['1234,56', 123456],
    ['12.50', 1250],
    ['0,05', 5],
    ['0.99', 99],
    ['1.234', 123400], // dot + exactly three digits is a thousands separator
    ['1.234.567', 123456700],
    ['12.345,6', 1234560], // dots before a comma are thousands separators
    ['7', 700],
    ['007,10', 710],
  ])('%s → %i cents', (input, expected) => {
    expect(cents(input)).toBe(expected);
  });

  it('ignores surrounding spaces', () => {
    expect(cents('  12,50  ')).toBe(1250);
    expect(cents('\t1.234,56\n')).toBe(123456);
  });

  it('never goes through floating point', () => {
    // 0.1 + 0.2 style traps: 19,99 * 100 would be 1998.9999999999998 as a float.
    expect(cents('19,99')).toBe(1999);
    expect(cents('1.005,15')).toBe(100515);
    expect(cents('90071992547409,91')).toBe(9007199254740991);
  });
});

describe('parseMoney: rejected input', () => {
  it.each(['', '   '])('rejects empty input %j', (input) => {
    expect(cents(input)).toBe(MONEY_ERRORS.empty);
  });

  it.each(['-5', '-12,50', ' -1', '--5'])('rejects negative %s', (input) => {
    expect(cents(input)).toBe(MONEY_ERRORS.negative);
  });

  it.each(['12,345', '1,999', '0,001', '1.234,567'])(
    'rejects more than two decimals: %s',
    (input) => {
      expect(cents(input)).toBe(MONEY_ERRORS.decimals);
    },
  );

  it.each(['0', '0,00', '0.0', '000'])('rejects zero: %s', (input) => {
    expect(cents(input)).toBe(MONEY_ERRORS.zero);
  });

  it.each([
    'abc',
    '12a',
    '12 €',
    '€12',
    '1,2,3',
    '12,5,0',
    '1.2.3',
    '1..234',
    '1.23,4',
    '12.34.56',
    ',50',
    '.5',
    '1 234',
    '1e3',
    '+5',
    'NaN',
    'Infinity',
    '12,-5',
    '12,',
  ])('rejects non-numeric or malformed input: %s', (input) => {
    expect(cents(input)).toBe(MONEY_ERRORS.invalid);
  });

  it('rejects amounts beyond the safe integer range', () => {
    expect(cents('90071992547410')).toBe(MONEY_ERRORS.tooLarge);
    expect(cents('99999999999999999999')).toBe(MONEY_ERRORS.tooLarge);
  });
});

describe('formatCents', () => {
  it.each([
    [123456, '1.234,56\u00A0€'],
    [0, '0,00\u00A0€'],
    [5, '0,05\u00A0€'],
    [99, '0,99\u00A0€'],
    [100, '1,00\u00A0€'],
    [100000, '1.000,00\u00A0€'],
    [99999, '999,99\u00A0€'],
    [123456789, '1.234.567,89\u00A0€'],
    [-1250, '-12,50\u00A0€'],
    [-123456, '-1.234,56\u00A0€'],
  ])('%i → %s', (value, expected) => {
    expect(formatCents(value)).toBe(expected);
  });

  it('rejects non-integer cents', () => {
    expect(() => formatCents(12.5)).toThrow(RangeError);
    expect(() => formatCents(Number.NaN)).toThrow(RangeError);
  });

  it('round-trips with parseMoney through centsToInput', () => {
    for (const value of [1, 5, 99, 100, 1250, 123456, 100515, 9007199254740991]) {
      expect(cents(centsToInput(value))).toBe(value);
    }
  });
});

describe('parseMoney with allowZero', () => {
  it('accepts zero only when asked to, and still rejects the rest', () => {
    expect(parseMoney('0')).toEqual({ ok: false, error: MONEY_ERRORS.zero });
    expect(parseMoney('0', { allowZero: true })).toEqual({ ok: true, cents: 0 });
    expect(parseMoney('0,00', { allowZero: true })).toEqual({ ok: true, cents: 0 });
    expect(parseMoney('-1', { allowZero: true })).toEqual({
      ok: false,
      error: MONEY_ERRORS.negative,
    });
    expect(parseMoney('', { allowZero: true })).toEqual({ ok: false, error: MONEY_ERRORS.empty });
  });
});
