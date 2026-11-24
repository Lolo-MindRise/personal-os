import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildHash,
  getSelectedMonth,
  hrefFor,
  isMonth,
  parseHash,
  resetSelectedMonth,
  setSelectedMonth,
} from './router.js';

beforeEach(() => {
  resetSelectedMonth();
});

describe('parseHash', () => {
  it('reads the screen and its parameters', () => {
    expect(parseHash('#/movements?month=2026-01&category=3')).toEqual({
      view: 'movements',
      params: { month: '2026-01', category: '3' },
    });
  });

  it('falls back to Inicio for an empty or unknown hash', () => {
    expect(parseHash('')).toEqual({ view: 'dashboard', params: {} });
    expect(parseHash('#/nope?x=1').view).toBe('dashboard');
  });

  it('ignores empty parameters', () => {
    expect(parseHash('#/budget?month=').params).toEqual({});
  });
});

describe('buildHash', () => {
  it('round-trips with parseHash', () => {
    const hash = buildHash('movements', { month: '2026-02', q: 'café y té' });
    expect(parseHash(hash)).toEqual({
      view: 'movements',
      params: { month: '2026-02', q: 'café y té' },
    });
  });

  it('has no query without parameters', () => {
    expect(buildHash('debts')).toBe('#/debts');
  });
});

describe('selected month', () => {
  it('is carried by links to monthly screens only', () => {
    setSelectedMonth('2025-12');
    expect(hrefFor('budget')).toBe('#/budget?month=2025-12');
    expect(hrefFor('movements')).toBe('#/movements?month=2025-12');
    expect(hrefFor('debts')).toBe('#/debts');
  });

  it('lets a link choose its own month', () => {
    setSelectedMonth('2025-12');
    expect(hrefFor('movements', { month: '2026-03' })).toBe('#/movements?month=2026-03');
  });

  it('defaults to this month', () => {
    expect(isMonth(getSelectedMonth())).toBe(true);
  });

  it('validates the month format', () => {
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth('2026-1')).toBe(false);
    expect(isMonth('2026-12')).toBe(true);
  });
});
