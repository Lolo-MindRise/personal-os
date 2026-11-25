import { describe, expect, it } from 'vitest';
import type { CategoryDto, ImportPreviewRowDto } from '../shared/api.js';
import type { ParsedImportRow } from '../shared/csvImport.js';
import {
  applyOpeningDate,
  buildLines,
  categoriesFor,
  commitRows,
  countLines,
  decodeCsvBytes,
  kindOf,
  withCategory,
  withChecked,
} from './importState.js';

const categories: CategoryDto[] = [
  { id: 1, name: 'Nómina', kind: 'income' },
  { id: 2, name: 'Supermercado', kind: 'expense' },
  { id: 3, name: 'Préstamos', kind: 'repayment' },
];

const parsed = (over: Partial<ParsedImportRow> = {}): ParsedImportRow => ({
  line: 2,
  date: '2026-02-01',
  concept: 'COMPRA',
  amountCents: -1_000,
  error: null,
  ...over,
});

const proposal = (over: Partial<ImportPreviewRowDto> = {}): ImportPreviewRowDto => ({
  date: '2026-02-01',
  concept: 'COMPRA',
  amountCents: -1_000,
  kind: 'expense',
  categoryId: 2,
  categoryName: 'Supermercado',
  ruleId: 1,
  status: 'new',
  recurringItemId: null,
  recurringConcept: null,
  reason: null,
  ...over,
});

describe('buildLines', () => {
  it('pairs readable rows with proposals in order and keeps unreadable rows in place', () => {
    const lines = buildLines(
      [
        parsed({ line: 2 }),
        parsed({ line: 3, date: null, amountCents: null, error: 'Fecha no válida.' }),
        parsed({ line: 4, concept: 'OTRA' }),
      ],
      [proposal(), proposal({ concept: 'OTRA' })],
    );
    expect(lines.map((l) => [l.line, l.error, l.proposal?.concept])).toEqual([
      [2, null, 'COMPRA'],
      [3, 'Fecha no válida.', undefined],
      [4, null, 'OTRA'],
    ]);
    expect(lines[1]).toMatchObject({ checked: false, categoryId: null });
  });

  it('checks new rows with a category and fixed items; not duplicates or rows without category', () => {
    const lines = buildLines(
      [parsed({ line: 1 }), parsed({ line: 2 }), parsed({ line: 3 }), parsed({ line: 4 })],
      [
        proposal(),
        proposal({ status: 'duplicate' }),
        proposal({ status: 'noCategory', categoryId: null, categoryName: null, ruleId: null }),
        proposal({ status: 'recurring', recurringItemId: 9, recurringConcept: 'Alquiler' }),
      ],
    );
    expect(lines.map((l) => l.checked)).toEqual([true, false, false, true]);
  });

  it('flags a readable row that got no proposal', () => {
    const [line] = buildLines([parsed()], []);
    expect(line?.error).toBe('No se pudo clasificar la fila.');
    expect(line?.checked).toBe(false);
  });
});

describe('editing a line', () => {
  const noCategory = () =>
    buildLines(
      [parsed()],
      [proposal({ status: 'noCategory', categoryId: null, categoryName: null, ruleId: null })],
    )[0];

  it('offers the categories the sign allows', () => {
    const expense = buildLines([parsed()], [proposal()])[0];
    const income = buildLines(
      [parsed({ amountCents: 5_000 })],
      [proposal({ amountCents: 5_000, kind: 'income' })],
    )[0];
    expect(categoriesFor(expense ?? ({} as never), categories).map((c) => c.name)).toEqual([
      'Supermercado',
      'Préstamos',
    ]);
    expect(categoriesFor(income ?? ({} as never), categories).map((c) => c.name)).toEqual([
      'Nómina',
    ]);
  });

  it('picking a category checks a row that was waiting for one, and the kind follows the category', () => {
    const line = noCategory();
    expect(line?.checked).toBe(false);
    const picked = withCategory(line ?? ({} as never), 3);
    expect(picked).toMatchObject({ categoryId: 3, checked: true });
    expect(kindOf(picked, categories)).toBe('repayment');
  });

  it('clearing the category unchecks it; a row without category cannot be checked', () => {
    const picked = withCategory(noCategory() ?? ({} as never), 2);
    expect(withCategory(picked, null)).toMatchObject({ categoryId: null, checked: false });
    expect(withChecked(noCategory() ?? ({} as never), true).checked).toBe(false);
  });

  it('changing the category of a row the user unchecked keeps it unchecked', () => {
    const line = withChecked(buildLines([parsed()], [proposal()])[0] ?? ({} as never), false);
    expect(withCategory(line, 3).checked).toBe(false);
  });

  it('a fixed-item row is locked to its item', () => {
    const line = buildLines(
      [parsed()],
      [proposal({ status: 'recurring', kind: 'repayment', categoryId: 3, recurringItemId: 4 })],
    )[0];
    expect(withCategory(line ?? ({} as never), 2)).toBe(line);
    expect(kindOf(line ?? ({} as never), categories)).toBe('repayment');
  });

  it('unreadable rows cannot be edited', () => {
    const [line] = buildLines([parsed({ date: null, amountCents: null, error: 'x' })], []);
    expect(withChecked(line ?? ({} as never), true)).toBe(line);
    expect(withCategory(line ?? ({} as never), 2)).toBe(line);
  });
});

describe('commitRows and countLines', () => {
  it('sends only checked, importable rows with positive amounts', () => {
    const lines = buildLines(
      [
        parsed({ line: 1 }),
        parsed({ line: 2, concept: 'DUP' }),
        parsed({ line: 3, date: null, amountCents: null, error: 'x' }),
        parsed({ line: 4, concept: 'FIJO', amountCents: -70_000 }),
        parsed({ line: 5, concept: 'COBRO', amountCents: 5_000 }),
      ],
      [
        proposal(),
        proposal({ concept: 'DUP', status: 'duplicate' }),
        proposal({
          concept: 'FIJO',
          amountCents: -70_000,
          status: 'recurring',
          categoryId: 3,
          kind: 'repayment',
          recurringItemId: 7,
          recurringConcept: 'Cuota',
        }),
        proposal({
          concept: 'COBRO',
          amountCents: 5_000,
          kind: 'income',
          categoryId: 1,
          categoryName: 'Nómina',
        }),
      ],
    );
    expect(commitRows(lines, categories)).toEqual([
      {
        date: '2026-02-01',
        concept: 'COMPRA',
        amountCents: 1_000,
        kind: 'expense',
        categoryId: 2,
        recurringItemId: null,
      },
      {
        date: '2026-02-01',
        concept: 'FIJO',
        amountCents: 70_000,
        kind: 'repayment',
        categoryId: 3,
        recurringItemId: 7,
      },
      {
        date: '2026-02-01',
        concept: 'COBRO',
        amountCents: 5_000,
        kind: 'income',
        categoryId: 1,
        recurringItemId: null,
      },
    ]);
    expect(countLines(lines, categories)).toEqual({
      total: 5,
      errors: 1,
      new: 2,
      duplicate: 1,
      recurring: 1,
      noCategory: 0,
      selected: 3,
      outOfBalance: 0,
    });
  });

  it('a duplicate the user checks is imported', () => {
    const [line] = buildLines([parsed()], [proposal({ status: 'duplicate' })]);
    const checked = withChecked(line ?? ({} as never), true);
    expect(commitRows([checked], categories)).toHaveLength(1);
  });

  it('never sends a category whose kind does not fit the sign', () => {
    const [line] = buildLines([parsed()], [proposal({ status: 'noCategory', categoryId: null })]);
    // An income category forced onto money out (not reachable from the UI) is dropped.
    const forced = { ...(line ?? ({} as never)), categoryId: 1, checked: true };
    expect(commitRows([forced], categories)).toEqual([]);
  });
});

describe('opening date flags', () => {
  const rows = [
    parsed({ line: 1, date: '2026-01-09' }),
    parsed({ line: 2, date: '2026-01-10' }),
    parsed({ line: 3, date: '2026-01-11' }),
  ];
  const proposals = [proposal(), proposal(), proposal()];

  it('flags and unchecks the opening date itself and earlier days, not the next day', () => {
    const lines = buildLines(rows, proposals, '2026-01-10');
    expect(lines.map((l) => l.outOfBalance)).toEqual([true, true, false]);
    expect(lines.map((l) => l.checked)).toEqual([false, false, true]);
    expect(countLines(lines, categories)).toMatchObject({ outOfBalance: 2, selected: 1 });
  });

  it('flags nothing without a known account', () => {
    expect(buildLines(rows, proposals).some((l) => l.outOfBalance)).toBe(false);
  });

  it('re-evaluates when the account changes and keeps the manual choices', () => {
    let lines = buildLines(rows, proposals, '2026-01-10');
    // The user checks a flagged row and unchecks a normal one.
    lines = lines.map((l, i) => (i === 0 ? withChecked(l, true) : l));
    lines = lines.map((l, i) => (i === 2 ? withChecked(l, false) : l));
    const later = applyOpeningDate(lines, '2026-01-11');
    expect(later.map((l) => l.outOfBalance)).toEqual([true, true, true]);
    expect(later.map((l) => l.checked)).toEqual([true, false, false]);
    const earlier = applyOpeningDate(later, '2025-12-31');
    expect(earlier.map((l) => l.outOfBalance)).toEqual([false, false, false]);
    // Untouched row 2 becomes checked again; the touched ones stay as the user left them.
    expect(earlier.map((l) => l.checked)).toEqual([true, true, false]);
  });

  it('does not check a row picked a category for when the account will not count it', () => {
    const [waiting] = buildLines(
      [parsed({ date: '2026-01-10' })],
      [proposal({ status: 'noCategory', categoryId: null })],
      '2026-01-10',
    );
    const picked = withCategory(waiting ?? ({} as never), 2);
    expect(picked.checked).toBe(false);
    expect(picked.outOfBalance).toBe(true);
  });
});

describe('decodeCsvBytes', () => {
  it('reads UTF-8', () => {
    const bytes = new TextEncoder().encode('Nómina;Ñandú');
    expect(decodeCsvBytes(bytes.buffer.slice(0))).toBe('Nómina;Ñandú');
  });

  it('falls back to Windows-1252 when the bytes are not valid UTF-8', () => {
    // "Nómina" in Latin-1: ó is the single byte 0xF3.
    const latin1 = Uint8Array.from([0x4e, 0xf3, 0x6d, 0x69, 0x6e, 0x61]);
    expect(decodeCsvBytes(latin1.buffer)).toBe('Nómina');
  });
});
