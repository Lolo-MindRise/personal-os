import { describe, expect, it } from 'vitest';
import type { MovementDto } from '../shared/api.js';
import { csvText, formatCsvAmount, movementsToCsv } from './movementsCsv.js';

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
  });
});

describe('movementsToCsv', () => {
  it('has only the BOM and header for an empty list', () => {
    expect(movementsToCsv([])).toBe('﻿Fecha;Tipo;Categoría;Concepto;Importe;Notas\r\n');
  });

  it('writes one Spanish-formatted row per movement', () => {
    const csv = movementsToCsv([
      movement(),
      movement({ date: '2026-12-31', kind: 'income', concept: 'Pago; "extra"', notes: 'a\nb' }),
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.split('\r\n')).toEqual([
      '﻿Fecha;Tipo;Categoría;Concepto;Importe;Notas',
      '05/03/2026;Gasto;Supermercado;Compra;1.234,56;',
      '31/12/2026;Ingreso;Supermercado;"Pago; ""extra""";1.234,56;"a\nb"',
      '',
    ]);
  });
});
