import { describe, expect, it } from 'vitest';
import type { CategoryRuleDto, PendingEntryDto } from './api.js';
import {
  classifyRows,
  kindsForAmount,
  normalizeText,
  type ClassifyContext,
} from './importClassify.js';

const rule = (
  id: number,
  pattern: string,
  categoryId: number,
  kind: CategoryRuleDto['kind'],
  name = `Cat ${String(categoryId)}`,
): CategoryRuleDto => ({
  id,
  pattern,
  categoryId,
  categoryName: name,
  kind,
});

const pending = (over: Partial<PendingEntryDto>): PendingEntryDto => ({
  recurringItemId: 1,
  month: '2026-02',
  date: '2026-02-05',
  kind: 'expense',
  categoryId: 10,
  categoryName: 'Vivienda',
  concept: 'Alquiler',
  amountCents: 70_000,
  notes: null,
  ...over,
});

const context = (over: Partial<ClassifyContext> = {}): ClassifyContext => ({
  rules: [],
  existing: [],
  pending: [],
  ...over,
});

describe('normalizeText and kindsForAmount', () => {
  it('ignores case, accents and spacing', () => {
    expect(normalizeText('  COMPRA   Electrónica  ')).toBe('compra electronica');
  });

  it('money out is an expense or a repayment, money in is income', () => {
    expect(kindsForAmount(-1)).toEqual(['expense', 'repayment']);
    expect(kindsForAmount(1)).toEqual(['income']);
  });
});

describe('category rules', () => {
  const rules = [
    rule(1, 'mercadona', 20, 'expense', 'Supermercado'),
    rule(2, 'nomina', 30, 'income', 'Nómina'),
    rule(3, 'prestamo', 40, 'repayment', 'Préstamos'),
  ];

  it('proposes the category of the first matching rule, ignoring case and accents', () => {
    const [a, b] = classifyRows(
      [
        { date: '2026-02-01', concept: 'COMPRA MERCADONA 1234', amountCents: -2_550 },
        { date: '2026-02-02', concept: 'Nómina febrero', amountCents: 180_000 },
      ],
      context({ rules }),
    );
    expect(a).toMatchObject({
      status: 'new',
      categoryId: 20,
      categoryName: 'Supermercado',
      kind: 'expense',
      ruleId: 1,
    });
    expect(b).toMatchObject({ status: 'new', categoryId: 30, kind: 'income', ruleId: 2 });
  });

  it('a repayment category is proposed for money out, and the row takes its kind', () => {
    const [row] = classifyRows(
      [{ date: '2026-02-03', concept: 'Cuota PRESTAMO 77', amountCents: -15_000 }],
      context({ rules }),
    );
    expect(row).toMatchObject({ kind: 'repayment', categoryId: 40, status: 'new' });
  });

  it('skips a rule whose category kind does not fit the sign, and tries the next one', () => {
    const conflicting = [
      rule(1, 'abono', 20, 'expense'),
      rule(2, 'abono', 30, 'income', 'Otros ingresos'),
    ];
    const [row] = classifyRows(
      [{ date: '2026-02-03', concept: 'Abono recibido', amountCents: 5_000 }],
      context({ rules: conflicting }),
    );
    expect(row).toMatchObject({ categoryId: 30, kind: 'income', ruleId: 2 });
  });

  it('the first rule wins when several match', () => {
    const [row] = classifyRows(
      [{ date: '2026-02-03', concept: 'Mercadona online', amountCents: -100 }],
      context({ rules: [rule(1, 'mercadona', 20, 'expense'), rule(2, 'online', 21, 'expense')] }),
    );
    expect(row?.categoryId).toBe(20);
  });

  it('without a rule the row needs a category, with a kind from the sign', () => {
    const rows = classifyRows(
      [
        { date: '2026-02-03', concept: 'Algo raro', amountCents: -100 },
        { date: '2026-02-03', concept: 'Algo raro', amountCents: 100 },
      ],
      context({ rules }),
    );
    expect(rows.map((r) => [r.status, r.kind, r.categoryId, r.ruleId])).toEqual([
      ['noCategory', 'expense', null, null],
      ['noCategory', 'income', null, null],
    ]);
  });

  it('an empty pattern never matches', () => {
    const [row] = classifyRows(
      [{ date: '2026-02-03', concept: 'x', amountCents: -1 }],
      context({ rules: [rule(1, '  ', 20, 'expense')] }),
    );
    expect(row?.status).toBe('noCategory');
  });
});

describe('duplicates', () => {
  const existing = [
    {
      date: '2026-02-01',
      kind: 'expense' as const,
      concept: 'Compra Mercadona',
      amountCents: 2_550,
      recurringItemId: null,
    },
  ];

  it('flags a row with the same date, amount and concept (ignoring case and accents)', () => {
    const [row] = classifyRows(
      [{ date: '2026-02-01', concept: 'COMPRA  MERCADONA', amountCents: -2_550 }],
      context({ existing }),
    );
    expect(row?.status).toBe('duplicate');
  });

  it('a different date, amount or concept is not a duplicate', () => {
    const rows = classifyRows(
      [
        { date: '2026-02-02', concept: 'Compra Mercadona', amountCents: -2_550 },
        { date: '2026-02-01', concept: 'Compra Mercadona', amountCents: -2_551 },
        { date: '2026-02-01', concept: 'Compra Lidl', amountCents: -2_550 },
      ],
      context({ existing }),
    );
    expect(rows.map((r) => r.status)).toEqual(['noCategory', 'noCategory', 'noCategory']);
  });

  it('does not mix an income with an expense of the same date, concept and amount', () => {
    const [row] = classifyRows(
      [{ date: '2026-02-01', concept: 'Compra Mercadona', amountCents: 2_550 }], // money in
      context({ existing }), // the stored one is an expense
    );
    expect(row?.status).toBe('noCategory');
  });

  it('each stored movement covers one row: two identical rows against one stored flag only one', () => {
    const rows = classifyRows(
      [
        { date: '2026-02-01', concept: 'Compra Mercadona', amountCents: -2_550 },
        { date: '2026-02-01', concept: 'Compra Mercadona', amountCents: -2_550 },
      ],
      context({ existing }),
    );
    expect(rows.map((r) => r.status)).toEqual(['duplicate', 'noCategory']);
  });

  it('identical rows inside the file are not duplicates of each other', () => {
    const rows = classifyRows(
      [
        { date: '2026-02-01', concept: 'Café', amountCents: -150 },
        { date: '2026-02-01', concept: 'Café', amountCents: -150 },
      ],
      context(),
    );
    expect(rows.map((r) => r.status)).toEqual(['noCategory', 'noCategory']);
  });

  it('a duplicate still shows the category a rule would give it', () => {
    const [row] = classifyRows(
      [{ date: '2026-02-01', concept: 'Compra Mercadona', amountCents: -2_550 }],
      context({ existing, rules: [rule(1, 'mercadona', 20, 'expense', 'Supermercado')] }),
    );
    expect(row).toMatchObject({ status: 'duplicate', categoryName: 'Supermercado' });
  });
});

describe('recurring matches', () => {
  it('proposes confirming a pending item with the same amount in the same month', () => {
    const [row] = classifyRows(
      [{ date: '2026-02-04', concept: 'RECIBO ALQUILER FEB', amountCents: -70_000 }],
      context({ pending: [pending({})] }),
    );
    expect(row).toMatchObject({
      status: 'recurring',
      kind: 'expense',
      categoryId: 10,
      categoryName: 'Vivienda',
      recurringItemId: 1,
      recurringConcept: 'Alquiler',
      concept: 'RECIBO ALQUILER FEB', // the bank's concept is kept, so a re-import finds the duplicate
    });
  });

  it('needs the same amount, the same month and a kind that fits the sign', () => {
    const rows = classifyRows(
      [
        { date: '2026-02-04', concept: 'a', amountCents: -69_999 },
        { date: '2026-03-04', concept: 'b', amountCents: -70_000 },
        { date: '2026-02-04', concept: 'c', amountCents: 70_000 }, // income, item is an expense
      ],
      context({ pending: [pending({})] }),
    );
    expect(rows.map((r) => r.status)).toEqual(['noCategory', 'noCategory', 'noCategory']);
  });

  it('matches income items for positive amounts and repayment items for money out', () => {
    const rows = classifyRows(
      [
        { date: '2026-02-01', concept: 'nomina', amountCents: 180_000 },
        { date: '2026-02-05', concept: 'cuota', amountCents: -15_000 },
      ],
      context({
        pending: [
          pending({
            recurringItemId: 5,
            kind: 'income',
            amountCents: 180_000,
            concept: 'Nómina',
            categoryId: 30,
            categoryName: 'Nómina',
          }),
          pending({
            recurringItemId: 6,
            kind: 'repayment',
            amountCents: 15_000,
            concept: 'Cuota',
            categoryId: 40,
            categoryName: 'Préstamos',
          }),
        ],
      }),
    );
    expect(rows.map((r) => [r.status, r.kind, r.recurringItemId])).toEqual([
      ['recurring', 'income', 5],
      ['recurring', 'repayment', 6],
    ]);
  });

  it('when a rule matched, the item must have the rule category kind', () => {
    const [row] = classifyRows(
      [{ date: '2026-02-05', concept: 'Cuota prestamo', amountCents: -15_000 }],
      context({
        rules: [rule(1, 'prestamo', 20, 'expense')],
        pending: [pending({ kind: 'repayment', amountCents: 15_000 })],
      }),
    );
    expect(row?.status).toBe('new');
  });

  it('uses each pending entry once, closest expected day first', () => {
    const rows = classifyRows(
      [
        { date: '2026-02-20', concept: 'a', amountCents: -1_000 },
        { date: '2026-02-04', concept: 'b', amountCents: -1_000 },
        { date: '2026-02-05', concept: 'c', amountCents: -1_000 },
      ],
      context({
        pending: [
          pending({ recurringItemId: 1, date: '2026-02-05', amountCents: 1_000, concept: 'Uno' }),
          pending({ recurringItemId: 2, date: '2026-02-19', amountCents: 1_000, concept: 'Dos' }),
        ],
      }),
    );
    // a (20th) takes the item of the 19th; b (4th) the item of the 5th; c finds none left.
    expect(rows.map((r) => [r.status, r.recurringItemId])).toEqual([
      ['recurring', 2],
      ['recurring', 1],
      ['noCategory', null],
    ]);
  });

  it('a duplicate never also confirms an item', () => {
    const [row] = classifyRows(
      [{ date: '2026-02-04', concept: 'Alquiler', amountCents: -70_000 }],
      context({
        existing: [
          {
            date: '2026-02-04',
            kind: 'expense' as const,
            concept: 'Alquiler',
            amountCents: 70_000,
            recurringItemId: null,
          },
        ],
        pending: [pending({})],
      }),
    );
    expect(row).toMatchObject({ status: 'duplicate', recurringItemId: null });
  });
});

describe('already confirmed as a fixed item (task 0014)', () => {
  // The rent was confirmed by hand in Fijos: the item's own concept, on its expected day.
  const confirmedRent = {
    date: '2026-02-02',
    kind: 'expense' as const,
    concept: 'Alquiler',
    amountCents: 70_000,
    recurringItemId: 5,
  };
  const bankRent = { date: '2026-02-05', concept: 'RECIBO PISO FEB', amountCents: -70_000 };

  it('flags a bank row for a fixed item already confirmed in the month, with the reason', () => {
    const [row] = classifyRows([bankRent], context({ existing: [confirmedRent] }));
    expect(row).toMatchObject({
      status: 'duplicate',
      reason: 'ya confirmado como fijo',
      recurringItemId: null,
    });
  });

  it('the reason of an exact duplicate is its own, and other rows have none', () => {
    const rows = classifyRows(
      [
        { date: '2026-02-02', concept: 'Alquiler', amountCents: -70_000 }, // identical to the stored one
        { date: '2026-02-09', concept: 'Algo', amountCents: -1_000 },
      ],
      context({ existing: [confirmedRent] }),
    );
    expect(rows[0]).toMatchObject({ status: 'duplicate', reason: 'ya existe un movimiento igual' });
    expect(rows[1]?.reason).toBeNull();
  });

  it('needs the same month, the same amount and a fitting kind', () => {
    const rows = classifyRows(
      [
        { date: '2026-03-05', concept: 'x', amountCents: -70_000 }, // another month
        { date: '2026-02-05', concept: 'x', amountCents: -69_999 }, // another amount
        { date: '2026-02-05', concept: 'x', amountCents: 70_000 }, // money in; the stored one is an expense
      ],
      context({ existing: [confirmedRent] }),
    );
    expect(rows.map((r) => r.status)).toEqual(['noCategory', 'noCategory', 'noCategory']);
  });

  it('an ordinary movement with the same amount does not count: only confirmed fixed items do', () => {
    const [row] = classifyRows(
      [bankRent],
      context({ existing: [{ ...confirmedRent, recurringItemId: null, concept: 'Otra cosa' }] }),
    );
    expect(row?.status).toBe('noCategory');
  });

  it('a pending item with the same amount still wins and is proposed for confirmation', () => {
    // Two fixed items cost 700: one confirmed by hand, one still pending.
    const [row] = classifyRows(
      [bankRent],
      context({
        existing: [confirmedRent],
        pending: [
          pending({ recurringItemId: 6, concept: 'Alquiler del trastero', amountCents: 70_000 }),
        ],
      }),
    );
    expect(row).toMatchObject({ status: 'recurring', recurringItemId: 6, reason: null });
  });

  it('each confirmed fixed movement covers one row: a second identical bank row is not flagged', () => {
    const rows = classifyRows(
      [bankRent, { ...bankRent, concept: 'OTRO RECIBO' }],
      context({ existing: [confirmedRent] }),
    );
    expect(rows.map((r) => r.status)).toEqual(['duplicate', 'noCategory']);
  });

  it('one stored movement is never claimed by two rules for two rows', () => {
    // The first row is an exact duplicate of the stored movement; the second has the same amount
    // in the same month but must not be flagged by that already-used movement.
    const rows = classifyRows(
      [
        { date: '2026-02-02', concept: 'Alquiler', amountCents: -70_000 },
        { date: '2026-02-06', concept: 'Otro recibo', amountCents: -70_000 },
      ],
      context({ existing: [confirmedRent] }),
    );
    expect(rows.map((r) => r.status)).toEqual(['duplicate', 'noCategory']);
  });

  it('when a rule matched, the stored fixed item must have that rule’s category kind', () => {
    const loanRule = rule(1, 'prestamo', 40, 'repayment', 'Préstamos');
    const bank = { date: '2026-02-05', concept: 'Cuota PRESTAMO', amountCents: -15_000 };
    const [asExpense] = classifyRows(
      [bank],
      context({
        rules: [loanRule],
        existing: [{ ...confirmedRent, amountCents: 15_000, kind: 'expense' as const }],
      }),
    );
    expect(asExpense?.status).toBe('new');
    const [asRepayment] = classifyRows(
      [bank],
      context({
        rules: [loanRule],
        existing: [{ ...confirmedRent, amountCents: 15_000, kind: 'repayment' as const }],
      }),
    );
    expect(asRepayment).toMatchObject({ status: 'duplicate', reason: 'ya confirmado como fijo' });
  });

  it('an exact duplicate later in the file still gets its stored movement (no double count)', () => {
    // The stored rent was confirmed with the very concept and date the bank uses. An earlier row
    // with the same amount must not use it up before the row that exactly duplicates it.
    const stored = { ...confirmedRent, date: '2026-02-20', concept: 'RECIBO PISO' };
    const rows = classifyRows(
      [
        { date: '2026-02-06', concept: 'Otro recibo', amountCents: -70_000 },
        { date: '2026-02-20', concept: 'RECIBO PISO', amountCents: -70_000 },
      ],
      context({ existing: [stored] }),
    );
    expect(rows[1]).toMatchObject({ status: 'duplicate', reason: 'ya existe un movimiento igual' });
    // The stored movement went to the exact match, so the other row is a genuinely new payment.
    expect(rows[0]?.status).toBe('noCategory');
    expect(rows[0]?.reason).toBeNull();
  });

  it('results keep the order of the file', () => {
    const rows = classifyRows(
      [
        { date: '2026-02-06', concept: 'a', amountCents: -1_000 },
        { date: '2026-02-20', concept: 'RECIBO PISO', amountCents: -70_000 },
        { date: '2026-02-07', concept: 'b', amountCents: -2_000 },
      ],
      context({ existing: [{ ...confirmedRent, date: '2026-02-20', concept: 'RECIBO PISO' }] }),
    );
    expect(rows.map((r) => r.concept)).toEqual(['a', 'RECIBO PISO', 'b']);
    expect(rows.map((r) => r.status)).toEqual(['noCategory', 'duplicate', 'noCategory']);
  });

  it('works for income items too', () => {
    const [row] = classifyRows(
      [{ date: '2026-02-03', concept: 'INGRESO EMPRESA', amountCents: 200_000 }],
      context({
        existing: [
          {
            date: '2026-02-01',
            kind: 'income',
            concept: 'Nómina',
            amountCents: 200_000,
            recurringItemId: 1,
          },
        ],
      }),
    );
    expect(row).toMatchObject({ status: 'duplicate', reason: 'ya confirmado como fijo' });
  });
});
