import { describe, expect, it } from 'vitest';
import type { MovementDto, MovementSearchDto } from '../shared/api.js';
import {
  canExportMonth,
  csvText,
  fetchAllSearchRows,
  formatCsvAmount,
  monthCsvFilename,
  movementsToCsv,
  slugify,
} from './movementsCsv.js';

const movement = (over: Partial<MovementDto> = {}): MovementDto => ({
  id: 1,
  date: '2026-03-05',
  kind: 'expense',
  categoryId: 2,
  categoryName: 'Supermercado',
  concept: 'Compra',
  amountCents: 123_456,
  notes: null,
  debtId: null,
  accountId: 1,
  tags: [],
  recurringItemId: null,
  ...over,
});

describe('formatCsvAmount', () => {
  it('formats cents with thousands dots and a decimal comma', () => {
    expect(formatCsvAmount(0)).toBe('0,00');
    expect(formatCsvAmount(5)).toBe('0,05');
    expect(formatCsvAmount(100)).toBe('1,00');
    expect(formatCsvAmount(123_456)).toBe('1.234,56');
    expect(formatCsvAmount(100_000_000)).toBe('1.000.000,00');
  });

  it('keeps the sign of negatives', () => {
    expect(formatCsvAmount(-5)).toBe('-0,05');
    expect(formatCsvAmount(-123_456)).toBe('-1.234,56');
  });
});

describe('csvText', () => {
  it('leaves plain text alone', () => {
    expect(csvText('Compra en el súper')).toBe('Compra en el súper');
  });

  it('quotes ; and newlines, and doubles quotes', () => {
    expect(csvText('a;b')).toBe('"a;b"');
    expect(csvText('a\nb')).toBe('"a\nb"');
    expect(csvText('dijo "hola"')).toBe('"dijo ""hola"""');
  });

  it('defuses formulas', () => {
    expect(csvText('=SUMA(A1)')).toBe("'=SUMA(A1)");
    expect(csvText('@x;y')).toBe('"\'@x;y"');
    expect(csvText('+34 600')).toBe("'+34 600");
    expect(csvText('-cheque')).toBe("'-cheque");
  });
});

describe('movementsToCsv', () => {
  it('has only the BOM and header for an empty list', () => {
    expect(movementsToCsv([])).toBe(
      '﻿Fecha;Tipo;Categoría;Concepto;Importe;Notas;Marcas;Cuenta\r\n',
    );
  });

  it('writes the account name last, escaped, and empty for an unknown account', () => {
    const accounts = [
      { id: 1, name: 'Efectivo' },
      { id: 2, name: '=Banco' },
      { id: 3, name: 'Caja; ahorro' },
    ];
    const rows = movementsToCsv(
      [
        movement({ accountId: 1 }),
        movement({ accountId: 2 }),
        movement({ accountId: 3 }),
        movement({ accountId: 99 }),
      ],
      accounts,
    ).split('\r\n');
    expect(rows.slice(1, 5)).toEqual([
      '05/03/2026;Gasto;Supermercado;Compra;1.234,56;;;Efectivo',
      "05/03/2026;Gasto;Supermercado;Compra;1.234,56;;;'=Banco",
      '05/03/2026;Gasto;Supermercado;Compra;1.234,56;;;"Caja; ahorro"',
      '05/03/2026;Gasto;Supermercado;Compra;1.234,56;;;',
    ]);
  });

  it('writes one Spanish-formatted row per movement, marcas last', () => {
    const csv = movementsToCsv([
      movement(),
      movement({
        date: '2026-12-31',
        kind: 'income',
        concept: 'Pago; "extra"',
        notes: 'a\nb',
        tags: ['viaje', 'casa'],
      }),
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.split('\r\n')).toEqual([
      '﻿Fecha;Tipo;Categoría;Concepto;Importe;Notas;Marcas;Cuenta',
      '05/03/2026;Gasto;Supermercado;Compra;1.234,56;;;',
      '31/12/2026;Ingreso;Supermercado;"Pago; ""extra""";1.234,56;"a\nb";viaje, casa;',
      '',
    ]);
  });

  it('defuses only text cells, never the date or the amount', () => {
    const row = movementsToCsv([movement({ concept: '-cheque', amountCents: 5 })]).split('\r\n')[1];
    expect(row).toBe("05/03/2026;Gasto;Supermercado;'-cheque;0,05;;;");
    expect(row?.split(';')[0]).not.toContain("'");
    expect(row?.split(';')[4]).not.toContain("'");
  });
});

describe('slugify and monthCsvFilename', () => {
  it('slugifies safely', () => {
    expect(slugify('Supermercado')).toBe('supermercado');
    expect(slugify('Ocio y Cultura / Ñandú')).toBe('ocio-y-cultura-nandu');
    expect(slugify('../..')).toBe('');
  });

  it('names the month file, with the category when filtered', () => {
    expect(monthCsvFilename('2027-11')).toBe('movimientos-2027-11.csv');
    expect(monthCsvFilename('2027-11', 'Supermercado')).toBe(
      'movimientos-2027-11-supermercado.csv',
    );
    expect(monthCsvFilename('2027-11', '¿¿')).toBe('movimientos-2027-11-categoria.csv');
  });
});

describe('canExportMonth', () => {
  it('needs the loaded month to match and no load error', () => {
    expect(canExportMonth('2027-11', '2027-11', undefined)).toBe(true);
    expect(canExportMonth(undefined, '2027-11', undefined)).toBe(false);
    expect(canExportMonth('2027-10', '2027-11', undefined)).toBe(false);
    expect(canExportMonth('2027-11', '2027-11', 'Sin conexión')).toBe(false);
  });
});

describe('fetchAllSearchRows', () => {
  const page = (n: number, pageCount: number): MovementSearchDto => ({
    rows: [movement({ id: n })],
    page: n,
    pageSize: 1,
    count: pageCount,
    pageCount,
    totals: { incomeCents: 0, expenseCents: 0, repaymentCents: 0, netCents: 0 },
  });

  it('pages until the last page', async () => {
    const rows = await fetchAllSearchRows((n) => Promise.resolve(page(n, 3)));
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('rejects when a page fails', async () => {
    await expect(
      fetchAllSearchRows((n) =>
        n === 2 ? Promise.reject(new Error('boom')) : Promise.resolve(page(n, 3)),
      ),
    ).rejects.toThrow('boom');
  });
});
