import { describe, expect, it } from 'vitest';
import {
  estimateDebt,
  formatRate,
  monthlyInterest,
  parseRate,
  rateToInput,
  repaidSince,
  type ExtraRepaymentInput,
  type InstallmentInput,
} from './debts.js';

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

const extras = (rows: { date: string; amountCents: number }[]): ExtraRepaymentInput[] =>
  rows.map((r, i) => ({ ...r, movementId: 100 + i }));

/** Monthly installments of a 10.000,00 € loan at 6 %: 860,66 € on the 1st of each month. */
const schedule = (count: number, firstMonth = 2): InstallmentInput[] =>
  Array.from({ length: count }, (_, i) => ({
    movementId: i + 1,
    date: `2026-${String(firstMonth + i).padStart(2, '0')}-01`,
    amountCents: 86_066,
  }));

describe('monthlyInterest', () => {
  it('is balance × rate / 12 rounded half up to the cent', () => {
    expect(monthlyInterest(1_000_000, 600)).toBe(5_000); // 50,00
    expect(monthlyInterest(918_934, 600)).toBe(4_595); // 45,9467 → 45,95
    expect(monthlyInterest(755_584, 600)).toBe(3_778); // 37,7792 → 37,78
  });

  it('rounds exact halves up, and is zero without rate or balance', () => {
    // 1 cent × 6 % / 12 is far below half a cent; 100 cents at 6 % = 0,5 cent → rounds up to 1.
    expect(monthlyInterest(100, 600)).toBe(1);
    expect(monthlyInterest(99, 600)).toBe(0);
    expect(monthlyInterest(1_000_000, 0)).toBe(0);
    expect(monthlyInterest(0, 600)).toBe(0);
  });
});

describe('estimateDebt', () => {
  it('is the recorded balance when nothing happened after the as-of date', () => {
    const estimate = estimateDebt(300_000, '2026-03-15', 650, [], extras(repayments));
    expect(estimate).toMatchObject({
      estimatedBalanceCents: 300_000,
      principalPaidCents: 0,
      interestPaidCents: 0,
      extraRepaidCents: 0,
      installments: [],
    });
  });

  it('without installments it is the balance minus the extra repayments after the as-of date', () => {
    expect(estimateDebt(300_000, '2026-01-31', 650, [], extras(repayments))).toMatchObject({
      estimatedBalanceCents: 265_000,
      extraRepaidCents: 35_000,
    });
  });

  it('follows a known French amortization schedule to the cent', () => {
    // 10.000,00 € at 6 % over 12 months, payment 860,66 €. Hand-computed table (cents):
    //  1: interest 50,00  principal 810,66 balance 9.189,34
    //  2: interest 45,95  principal 814,71 balance 8.374,63
    //  3: interest 41,87  principal 818,79 balance 7.555,84
    // 12: interest  4,28  principal 856,38 balance     0,04 (the payment is rounded to the cent)
    const estimate = estimateDebt(1_000_000, '2026-01-01', 600, schedule(12), []);
    const rows = estimate.installments;
    expect(rows).toHaveLength(12);
    expect(
      rows.slice(0, 3).map((r) => [r.interestCents, r.principalCents, r.balanceAfterCents]),
    ).toEqual([
      [5_000, 81_066, 918_934],
      [4_595, 81_471, 837_463],
      [4_187, 81_879, 755_584],
    ]);
    expect(rows[11]).toMatchObject({
      interestCents: 428,
      principalCents: 85_638,
      balanceAfterCents: 4,
    });
    expect(estimate.estimatedBalanceCents).toBe(4);
    // Every installment splits exactly into interest + principal.
    for (const row of rows) {
      expect(row.interestCents + row.principalCents).toBe(row.paidCents);
    }
    expect(estimate.principalPaidCents + estimate.estimatedBalanceCents).toBe(1_000_000);
    expect(estimate.interestPaidCents).toBe(rows.reduce((s, r) => s + r.interestCents, 0));
  });

  it('applies installments and extra repayments together, in date order', () => {
    // 1st installment on 2026-02-01, an extra of 1.000,00 on 2026-02-15, 2nd installment on 03-01.
    const estimate = estimateDebt(
      1_000_000,
      '2026-01-01',
      600,
      schedule(2),
      extras([{ date: '2026-02-15', amountCents: 100_000 }]),
    );
    // After 1st: 9.189,34. After the extra: 8.189,34. 2nd interest: 8.189,34 × 0,5 % = 40,9467 → 40,95;
    // principal 819,71; balance 7.369,63.
    expect(estimate.installments.map((i) => i.balanceAfterCents)).toEqual([918_934, 736_963]);
    expect(estimate.estimatedBalanceCents).toBe(736_963);
    expect(estimate.extraRepaidCents).toBe(100_000);
    expect(estimate.installments[1]).toMatchObject({
      interestCents: 4_095,
      principalCents: 81_971,
    });
  });

  it('gives the same result whatever order the installments were confirmed in', () => {
    const inOrder = estimateDebt(1_000_000, '2026-01-01', 600, schedule(4), []);
    const shuffled = estimateDebt(
      1_000_000,
      '2026-01-01',
      600,
      [...schedule(4)].reverse().sort((a, b) => (a.movementId % 2) - (b.movementId % 2)),
      [],
    );
    expect(shuffled).toEqual(inOrder);
    // A later month confirmed first, an earlier one afterwards: still computed by date, not by id.
    const lateFirst = estimateDebt(
      1_000_000,
      '2026-01-01',
      600,
      [
        { movementId: 1, date: '2026-03-01', amountCents: 86_066 },
        { movementId: 2, date: '2026-02-01', amountCents: 86_066 },
      ],
      [],
    );
    expect(lateFirst.installments.map((i) => i.date)).toEqual(['2026-02-01', '2026-03-01']);
    expect(lateFirst.installments[0]?.balanceAfterCents).toBe(918_934);
  });

  it('ignores events on or before the as-of date', () => {
    const estimate = estimateDebt(
      500_000,
      '2026-03-01',
      600,
      [{ movementId: 1, date: '2026-03-01', amountCents: 86_066 }],
      extras([{ date: '2026-02-20', amountCents: 50_000 }]),
    );
    expect(estimate.estimatedBalanceCents).toBe(500_000);
    expect(estimate.installments).toEqual([]);
  });

  it('applies an installment before an extra repayment on the same date', () => {
    const estimate = estimateDebt(
      1_000_000,
      '2026-01-01',
      600,
      [{ movementId: 9, date: '2026-02-01', amountCents: 86_066 }],
      extras([{ date: '2026-02-01', amountCents: 100_000 }]),
    );
    // Interest is charged on the opening balance 10.000,00 (50,00), not on 9.000,00.
    expect(estimate.installments[0]?.interestCents).toBe(5_000);
    expect(estimate.estimatedBalanceCents).toBe(1_000_000 - 81_066 - 100_000);
  });

  it('never goes below zero: the last installment and extra repayments are capped', () => {
    const paidOff = estimateDebt(
      50_000,
      '2026-01-01',
      600,
      [
        { movementId: 1, date: '2026-02-01', amountCents: 86_066 },
        { movementId: 2, date: '2026-03-01', amountCents: 86_066 },
      ],
      extras([{ date: '2026-03-05', amountCents: 10_000 }]),
    );
    // 1st: interest 2,50, principal capped at the 500,00 balance (the payment exceeds it).
    expect(paidOff.installments[0]).toMatchObject({
      interestCents: 250,
      principalCents: 50_000,
      balanceAfterCents: 0,
    });
    // Afterwards nothing is owed: no interest, no principal, no extra applied.
    expect(paidOff.installments[1]).toMatchObject({
      interestCents: 0,
      principalCents: 0,
      balanceAfterCents: 0,
    });
    expect(paidOff.estimatedBalanceCents).toBe(0);
    expect(paidOff.extraRepaidCents).toBe(0);
    expect(paidOff.principalPaidCents).toBe(50_000);
  });

  it('treats a payment below the interest as all interest, with no principal', () => {
    const estimate = estimateDebt(
      1_000_000,
      '2026-01-01',
      600,
      [{ movementId: 1, date: '2026-02-01', amountCents: 3_000 }],
      [],
    );
    expect(estimate.installments[0]).toMatchObject({ interestCents: 3_000, principalCents: 0 });
    expect(estimate.estimatedBalanceCents).toBe(1_000_000);
  });

  it('a zero-rate debt reduces by the full installment', () => {
    const estimate = estimateDebt(
      120_000,
      '2026-01-01',
      0,
      schedule(2).map((i) => ({ ...i, amountCents: 10_000 })),
      [],
    );
    expect(estimate.estimatedBalanceCents).toBe(100_000);
    expect(estimate.interestPaidCents).toBe(0);
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
