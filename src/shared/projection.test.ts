import { describe, expect, it } from 'vitest';
import {
  addMonths,
  applyScenarios,
  firstMonthReaching,
  monthRange,
  projectMonths,
  type ProjectionCategory,
  type ProjectionInput,
  type ProjectionRecurring,
} from './projection.js';

// Invented figures, in cents. Categories: 1 Nómina (income), 2 Vivienda (expense), 3 Ocio
// (expense), 4 Supermercado (expense), 5 Préstamo (repayment).
const categories: ProjectionCategory[] = [
  { id: 1, name: 'Nómina', kind: 'income' },
  { id: 2, name: 'Vivienda', kind: 'expense' },
  { id: 3, name: 'Ocio', kind: 'expense' },
  { id: 4, name: 'Supermercado', kind: 'expense' },
  { id: 5, name: 'Préstamo', kind: 'repayment' },
];

const salary: ProjectionRecurring = {
  id: 1,
  kind: 'income',
  categoryId: 1,
  amountCents: 200_000,
  startMonth: '2026-01',
  endMonth: null,
};
const rent: ProjectionRecurring = {
  id: 2,
  kind: 'expense',
  categoryId: 2,
  amountCents: 70_000,
  startMonth: '2026-01',
  endMonth: '2027-01',
};

function input(over: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    currentMonth: '2026-11',
    endMonth: '2027-02',
    baselineCents: 100_000,
    categories,
    recurring: [salary, rent],
    budgetLines: [
      { categoryId: 3, amountCents: 10_000, validFrom: '2026-01' },
      { categoryId: 4, amountCents: 30_000, validFrom: '2027-01' },
    ],
    actualByCategory: new Map(),
    settled: [],
    ...over,
  };
}

const summary = (months: ReturnType<typeof projectMonths>) =>
  months.map((m) => [m.month, m.incomeCents, m.expenseCents, m.savingsCents, m.accumulatedCents]);

describe('addMonths and monthRange', () => {
  it('cross year boundaries in both directions', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
    expect(addMonths('2026-11', 14)).toBe('2028-01');
    expect(addMonths('2026-03', 0)).toBe('2026-03');
    expect(addMonths('2026-01', -13)).toBe('2024-12');
  });

  it('lists months inclusively, one for a single month, none when reversed', () => {
    expect(monthRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(monthRange('2026-11', '2026-11')).toEqual(['2026-11']);
    expect(monthRange('2026-11', '2026-10')).toEqual([]);
  });
});

describe('projectMonths', () => {
  it('projects recurring items and budgets across a year change, starting from the baseline', () => {
    // Nov and Dec 2026: salary 2.000 − rent 700 − Ocio budget 100 = 1.200 saved.
    // Jan 2027: rent still due (end month included), Supermercado budget 300 starts: 2.000 − 700 − 100 − 300 = 900.
    // Feb 2027: rent ended, so only the budgets are left: 2.000 − 100 − 300 = 1.600.
    const months = projectMonths(input());
    expect(summary(months)).toEqual([
      ['2026-11', 200_000, 80_000, 120_000, 220_000],
      ['2026-12', 200_000, 80_000, 120_000, 340_000],
      ['2027-01', 200_000, 110_000, 90_000, 430_000],
      ['2027-02', 200_000, 40_000, 160_000, 590_000],
    ]);
  });

  it('respects the start and end months of recurring items, both included', () => {
    const later: ProjectionRecurring = {
      id: 9,
      kind: 'expense',
      categoryId: 2,
      amountCents: 5_000,
      startMonth: '2026-12',
      endMonth: '2026-12',
    };
    const months = projectMonths(input({ recurring: [later], budgetLines: [] }));
    expect(months.map((m) => m.expenseCents)).toEqual([0, 5_000, 0, 0]);
    expect(months.map((m) => m.incomeCents)).toEqual([0, 0, 0, 0]);
  });

  it('a category with a recurring item never uses its budget, even a larger one', () => {
    const months = projectMonths(
      input({ budgetLines: [{ categoryId: 2, amountCents: 100_000, validFrom: '2026-01' }] }),
    );
    // Rent (70.000) is due Nov–Jan; the budget only fills the month it ended (Feb).
    expect(months.map((m) => m.expenseCents)).toEqual([70_000, 70_000, 70_000, 100_000]);
  });

  it('uses the budget in effect each month: the latest line not after the month', () => {
    const months = projectMonths(
      input({
        recurring: [],
        budgetLines: [
          { categoryId: 3, amountCents: 10_000, validFrom: '2026-01' },
          { categoryId: 3, amountCents: 25_000, validFrom: '2026-12' },
          { categoryId: 3, amountCents: 99_000, validFrom: '2027-03' }, // after the range
        ],
      }),
    );
    expect(months.map((m) => m.expenseCents)).toEqual([10_000, 25_000, 25_000, 25_000]);
  });

  it('ignores budgets of income and repayment categories', () => {
    const months = projectMonths(
      input({
        recurring: [],
        budgetLines: [
          { categoryId: 1, amountCents: 50_000, validFrom: '2026-01' },
          { categoryId: 5, amountCents: 50_000, validFrom: '2026-01' },
        ],
      }),
    );
    expect(months.every((m) => m.incomeCents === 0 && m.repaymentCents === 0)).toBe(true);
  });

  it('counts recurring repayments as money out', () => {
    const loan: ProjectionRecurring = {
      id: 7,
      kind: 'repayment',
      categoryId: 5,
      amountCents: 15_000,
      startMonth: '2026-11',
      endMonth: null,
    };
    const [first] = projectMonths(input({ recurring: [salary, loan], budgetLines: [] }));
    expect(first).toMatchObject({
      repaymentCents: 15_000,
      savingsCents: 185_000,
      accumulatedCents: 285_000,
    });
  });

  it('skipped items are not projected in their month only', () => {
    const months = projectMonths(
      input({ budgetLines: [], settled: [{ itemId: 2, month: '2026-12' }] }),
    );
    expect(months.map((m) => m.expenseCents)).toEqual([70_000, 0, 70_000, 0]);
  });

  it('in the current month, confirmed movements count as they are and budgets only fill the rest', () => {
    // Salary already confirmed (200.000 in the actuals, item settled): not counted twice.
    // Rent still pending: 700. Ocio: 40 spent of a 100 budget → 40 + 60 = 100.
    // Supermercado: 350 spent over a 300 budget → stays 350, no negative remainder.
    const months = projectMonths(
      input({
        endMonth: '2026-12',
        budgetLines: [
          { categoryId: 3, amountCents: 10_000, validFrom: '2026-01' },
          { categoryId: 4, amountCents: 30_000, validFrom: '2026-01' },
        ],
        actualByCategory: new Map([
          [1, 200_000],
          [3, 4_000],
          [4, 35_000],
        ]),
        settled: [{ itemId: 1, month: '2026-11' }],
      }),
    );
    const [current, next] = months;
    expect(current).toMatchObject({ incomeCents: 200_000, expenseCents: 70_000 + 10_000 + 35_000 });
    expect(current?.byCategory).toEqual(
      expect.arrayContaining([
        { categoryId: 1, cents: 200_000 },
        { categoryId: 2, cents: 70_000 },
        { categoryId: 3, cents: 10_000 },
        { categoryId: 4, cents: 35_000 },
      ]),
    );
    // The next month ignores the current month's actuals: salary, rent and both budgets.
    expect(next).toMatchObject({ incomeCents: 200_000, expenseCents: 70_000 + 10_000 + 30_000 });
  });

  it('a deficit month lowers the accumulated savings, which can go negative', () => {
    const months = projectMonths(
      input({
        baselineCents: 10_000,
        recurring: [rent],
        budgetLines: [],
        endMonth: '2026-12',
      }),
    );
    expect(months.map((m) => m.accumulatedCents)).toEqual([-60_000, -130_000]);
    expect(months.map((m) => m.savingsCents)).toEqual([-70_000, -70_000]);
  });

  it('covers a single month, and nothing when the end is before the current month', () => {
    expect(projectMonths(input({ endMonth: '2026-11' }))).toHaveLength(1);
    expect(projectMonths(input({ endMonth: '2026-10' }))).toEqual([]);
  });

  it('projects a long range across several years', () => {
    // 10 years: 120 months of salary only, 2.000 a month from a baseline of 0.
    const months = projectMonths(
      input({ baselineCents: 0, endMonth: '2036-10', recurring: [salary], budgetLines: [] }),
    );
    expect(months).toHaveLength(120);
    expect(months.at(-1)).toMatchObject({ month: '2036-10', accumulatedCents: 120 * 200_000 });
  });

  it('omits categories with nothing projected', () => {
    const [first] = projectMonths(input({ recurring: [salary], budgetLines: [] }));
    expect(first?.byCategory).toEqual([{ categoryId: 1, cents: 200_000 }]);
  });
});

describe('applyScenarios', () => {
  const base = () => projectMonths(input());
  const accumulated = (months: ReturnType<typeof projectMonths>) =>
    months.map((m) => m.accumulatedCents);

  it('without scenarios it equals the base', () => {
    expect(applyScenarios(base(), 100_000, [], categories)).toEqual(base());
  });

  it('extra income applies from its month on, never before', () => {
    // +500 a month from Jan 2027: Jan 2.500 − 1.100 = 1.400; Feb 2.500 − 400 = 2.100.
    const months = applyScenarios(
      base(),
      100_000,
      [{ type: 'income', fromMonth: '2027-01', amountCents: 50_000 }],
      categories,
    );
    expect(months.map((m) => m.incomeCents)).toEqual([200_000, 200_000, 250_000, 250_000]);
    expect(accumulated(months)).toEqual([220_000, 340_000, 480_000, 690_000]);
  });

  it('the first month of the scenario is included, also in the current month', () => {
    const months = applyScenarios(
      base(),
      100_000,
      [{ type: 'income', fromMonth: '2026-11', amountCents: 10_000 }],
      categories,
    );
    expect(months[0]?.incomeCents).toBe(210_000);
    expect(months[0]?.accumulatedCents).toBe(230_000);
  });

  it('negative income lowers it, and income adjustments add up', () => {
    const months = applyScenarios(
      base(),
      100_000,
      [
        { type: 'income', fromMonth: '2026-12', amountCents: -20_000 },
        { type: 'income', fromMonth: '2027-01', amountCents: 50_000 },
      ],
      categories,
    );
    expect(months.map((m) => m.incomeCents)).toEqual([200_000, 180_000, 230_000, 230_000]);
  });

  it('a category becomes the given amount from its month on', () => {
    // Ocio 100 → 200 from Dec 2026.
    const months = applyScenarios(
      base(),
      100_000,
      [{ type: 'category', fromMonth: '2026-12', categoryId: 3, amountCents: 20_000 }],
      categories,
    );
    expect(months.map((m) => m.expenseCents)).toEqual([80_000, 90_000, 120_000, 50_000]);
    expect(accumulated(months)).toEqual([220_000, 330_000, 410_000, 560_000]);
    expect(months[1]?.byCategory.find((c) => c.categoryId === 3)?.cents).toBe(20_000);
  });

  it('a category can become zero, or start from nothing', () => {
    const zero = applyScenarios(
      base(),
      100_000,
      [{ type: 'category', fromMonth: '2026-11', categoryId: 3, amountCents: 0 }],
      categories,
    );
    expect(zero.map((m) => m.expenseCents)).toEqual([70_000, 70_000, 100_000, 30_000]);
    expect(zero[0]?.byCategory.some((c) => c.categoryId === 3)).toBe(false);

    // Vivienda has no projected amount in Feb 2027 (rent ended): the scenario adds 800 there.
    const added = applyScenarios(
      base(),
      100_000,
      [{ type: 'category', fromMonth: '2027-02', categoryId: 2, amountCents: 80_000 }],
      categories,
    );
    expect(added[3]?.expenseCents).toBe(40_000 + 80_000);
    expect(added[2]?.expenseCents).toBe(110_000); // January unchanged
  });

  it('the last scenario that applies to a month sets a category, whatever the order given', () => {
    const months = applyScenarios(
      base(),
      100_000,
      [
        { type: 'category', fromMonth: '2027-01', categoryId: 3, amountCents: 5_000 },
        { type: 'category', fromMonth: '2026-12', categoryId: 3, amountCents: 20_000 },
      ],
      categories,
    );
    const ocio = months.map((m) => m.byCategory.find((c) => c.categoryId === 3)?.cents);
    expect(ocio).toEqual([10_000, 20_000, 5_000, 5_000]);
  });

  it('combines income and category scenarios', () => {
    const months = applyScenarios(
      base(),
      100_000,
      [
        { type: 'income', fromMonth: '2027-01', amountCents: 50_000 },
        { type: 'category', fromMonth: '2027-01', categoryId: 3, amountCents: 20_000 },
      ],
      categories,
    );
    // Jan: income 2.500; expense rent 700 + Ocio 200 + Super 300 = 1.200 → 1.300 saved.
    expect(months[2]).toMatchObject({
      incomeCents: 250_000,
      expenseCents: 120_000,
      savingsCents: 130_000,
    });
  });

  it('a repayment category keeps counting as a repayment', () => {
    const loan = {
      id: 7,
      kind: 'repayment' as const,
      categoryId: 5,
      amountCents: 15_000,
      startMonth: '2026-11',
      endMonth: null,
    };
    const withLoan = projectMonths(input({ recurring: [salary, loan], budgetLines: [] }));
    const months = applyScenarios(
      withLoan,
      100_000,
      [{ type: 'category', fromMonth: '2026-12', categoryId: 5, amountCents: 0 }],
      categories,
    );
    expect(months.map((m) => m.repaymentCents)).toEqual([15_000, 0, 0, 0]);
  });

  it('ignores a scenario for an unknown category, and does not change its input', () => {
    const before = base();
    const copy = JSON.parse(JSON.stringify(before)) as typeof before;
    const months = applyScenarios(
      before,
      100_000,
      [{ type: 'category', fromMonth: '2026-11', categoryId: 99, amountCents: 5 }],
      categories,
    );
    expect(months).toEqual(before);
    expect(before).toEqual(copy);
  });
});

describe('firstMonthReaching', () => {
  it('finds the first month at or above the target, or nothing', () => {
    const months = projectMonths(input());
    expect(firstMonthReaching(months, 340_000)).toBe('2026-12');
    expect(firstMonthReaching(months, 340_001)).toBe('2027-01');
    expect(firstMonthReaching(months, 1_000_000)).toBeUndefined();
    expect(firstMonthReaching(months, 0)).toBe('2026-11');
  });
});
