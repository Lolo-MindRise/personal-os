import { describe, expect, it } from 'vitest';
import { buildBudgetMonth, lineInEffect, type BudgetCategory } from './budget.js';

const cats: BudgetCategory[] = [
  { id: 1, name: 'Vivienda', kind: 'expense' },
  { id: 2, name: 'Ocio', kind: 'expense' },
  { id: 3, name: 'Nómina', kind: 'income' },
  { id: 4, name: 'Préstamo', kind: 'repayment' },
];

describe('lineInEffect', () => {
  const lines = [
    { categoryId: 1, amountCents: 100, validFrom: '2026-01' },
    { categoryId: 1, amountCents: 200, validFrom: '2026-04' },
    { categoryId: 2, amountCents: 50, validFrom: '2026-03' },
  ];

  it('picks the latest line that is not after the month', () => {
    expect(lineInEffect(lines, 1, '2026-03')?.amountCents).toBe(100);
    expect(lineInEffect(lines, 1, '2026-04')?.amountCents).toBe(200);
    expect(lineInEffect(lines, 1, '2027-01')?.amountCents).toBe(200);
  });

  it('has no line before the first one, nor for another category', () => {
    expect(lineInEffect(lines, 1, '2025-12')).toBeUndefined();
    expect(lineInEffect(lines, 2, '2026-02')).toBeUndefined();
    expect(lineInEffect(lines, 9, '2026-05')).toBeUndefined();
  });

  it('does not depend on the order of the lines', () => {
    expect(lineInEffect([...lines].reverse(), 1, '2026-06')?.amountCents).toBe(200);
  });
});

describe('buildBudgetMonth', () => {
  const lines = [
    { categoryId: 1, amountCents: 70_000, validFrom: '2026-01' },
    { categoryId: 1, amountCents: 80_000, validFrom: '2026-03' },
    { categoryId: 3, amountCents: 5_000, validFrom: '2026-01' },
  ];
  const actual = new Map([
    [1, 75_000],
    [2, 2_400],
  ]);

  it('has a row per expense category, ordered by name, with difference = budget − actual', () => {
    const month = buildBudgetMonth(
      '2026-02',
      [cats[0], cats[1]] as BudgetCategory[],
      lines,
      actual,
    );
    expect(month.rows.map((r) => r.categoryName)).toEqual(['Ocio', 'Vivienda']);
    expect(month.rows[1]).toMatchObject({
      budgetCents: 70_000,
      budgetFrom: '2026-01',
      actualCents: 75_000,
      differenceCents: -5_000,
    });
  });

  it('shows a category without a budget with its actual and no difference', () => {
    const ocio = buildBudgetMonth('2026-02', cats, lines, actual).rows.find(
      (r) => r.categoryName === 'Ocio',
    );
    expect(ocio).toEqual({
      categoryId: 2,
      categoryName: 'Ocio',
      kind: 'expense',
      budgetCents: null,
      budgetFrom: null,
      actualCents: 2_400,
      differenceCents: null,
    });
  });

  it('uses the budget in effect for the selected month; history is not rewritten', () => {
    const feb = buildBudgetMonth('2026-02', cats, lines, actual);
    const mar = buildBudgetMonth('2026-03', cats, lines, actual);
    expect(feb.rows.find((r) => r.categoryId === 1)?.budgetCents).toBe(70_000);
    expect(mar.rows.find((r) => r.categoryId === 1)).toMatchObject({
      budgetCents: 80_000,
      budgetFrom: '2026-03',
    });
  });

  it('includes non-expense categories only when they have a budget in effect', () => {
    const jan = buildBudgetMonth('2026-01', cats, lines, new Map());
    expect(jan.rows.map((r) => r.categoryName)).toEqual(['Nómina', 'Ocio', 'Vivienda']);
    const before = buildBudgetMonth('2025-12', cats, lines, new Map());
    expect(before.rows.map((r) => r.categoryName)).toEqual(['Ocio', 'Vivienda']);
  });

  it('totals only the expense rows: income and repayment amounts never mix into them', () => {
    const withOthers = new Map([...actual, [3, 200_000], [4, 9_000]]);
    const month = buildBudgetMonth('2026-02', cats, lines, withOthers);
    // The Nómina row (budget 5.000, actual 200.000) is listed but not added up.
    expect(month.rows.find((r) => r.categoryName === 'Nómina')).toMatchObject({
      budgetCents: 5_000,
      actualCents: 200_000,
    });
    expect(month.totals).toEqual({
      budgetCents: 70_000, // Vivienda only; Ocio has no budget
      actualCents: 77_400, // Vivienda 75.000 + Ocio 2.400
      differenceCents: -7_400,
    });
  });

  it('is empty with zero totals when there are no categories', () => {
    expect(buildBudgetMonth('2026-02', [], [], new Map())).toEqual({
      month: '2026-02',
      rows: [],
      totals: { budgetCents: 0, actualCents: 0, differenceCents: 0 },
    });
  });
});
