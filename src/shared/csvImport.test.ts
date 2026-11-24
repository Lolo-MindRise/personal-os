import { describe, expect, it } from 'vitest';
import {
  detectDelimiter,
  guessMapping,
  mappingProblems,
  parseCsv,
  parseImportDate,
  parseSignedAmount,
  readRows,
  type ImportMapping,
} from './csvImport.js';

// All fixtures are invented.

describe('parseCsv', () => {
  it('splits on the delimiter and keeps line numbers', () => {
    const records = parseCsv('a;b;c\n1;2;3\n', ';');
    expect(records.map((r) => r.fields)).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
    expect(records.map((r) => r.line)).toEqual([1, 2]);
  });

  it('handles quoted fields: delimiters, escaped quotes and line breaks inside', () => {
    const text =
      'fecha;concepto;importe\n01/02/2026;"Pago; con ""tarjeta""";-12,50\n02/02/2026;"dos\nlíneas";-1,00\n03/02/2026;x;-2,00';
    const records = parseCsv(text, ';');
    expect(records[1]?.fields).toEqual(['01/02/2026', 'Pago; con "tarjeta"', '-12,50']);
    expect(records[2]?.fields[1]).toBe('dos\nlíneas');
    // The record after a quoted line break reports its real line.
    expect(records[3]?.line).toBe(5);
    expect(records).toHaveLength(4);
  });

  it('handles CRLF, lone CR, a BOM, a missing final newline and blank lines', () => {
    expect(parseCsv('﻿a,b\r\n\r\n1,2\r\n3,4', ',').map((r) => r.fields)).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(parseCsv('a,b\r1,2\r', ',').map((r) => r.fields)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps empty fields, including a trailing one', () => {
    expect(parseCsv('a;;c;\n', ';')[0]?.fields).toEqual(['a', '', 'c', '']);
    expect(parseCsv('"";x', ';')[0]?.fields).toEqual(['', 'x']);
  });

  it('flags an unterminated quote as malformed instead of throwing', () => {
    const records = parseCsv('a;b\n1;"sin cerrar;2\n3;4', ';');
    expect(records).toHaveLength(2);
    expect(records[1]?.malformed).toBe(true);
    expect(records[0]?.malformed).toBe(false);
  });

  it('returns nothing for empty input', () => {
    expect(parseCsv('', ';')).toEqual([]);
    expect(parseCsv('\n\n', ';')).toEqual([]);
  });
});

describe('detectDelimiter', () => {
  it('prefers the delimiter that gives the same number of columns on every line', () => {
    expect(detectDelimiter('Fecha;Concepto;Importe\n01/02/2026;Pan;-1,20\n')).toBe(';');
    expect(detectDelimiter('Fecha,Concepto,Importe\n01/02/2026,Pan,-1.20\n')).toBe(',');
  });

  it('ignores delimiters inside quotes', () => {
    expect(detectDelimiter('Fecha,Concepto,Importe\n01/02/2026,"Pan, leche",-1.20\n')).toBe(',');
    // Decimal commas inside a semicolon file must not win.
    expect(
      detectDelimiter('Fecha;Concepto;Importe\n01/02/2026;Pan;-1,20\n02/02/2026;Leche;-2,30'),
    ).toBe(';');
  });

  it('falls back to the semicolon', () => {
    expect(detectDelimiter('solo una columna\notra')).toBe(';');
    expect(detectDelimiter('')).toBe(';');
  });
});

describe('parseSignedAmount', () => {
  it.each([
    ['-1.234,56', -123_456],
    ['1.234,56', 123_456],
    ['12,5', 1_250],
    ['-12', -1_200],
    ['+7,00', 700],
    ['12,50 €', 1_250],
    ['12,50 €', 1_250],
    ['-12,50EUR', -1_250],
    ['1.234,56-', -123_456],
    ['(12,50)', -1_250],
    ['- 12,50', -1_250],
    ['0,01', 1],
  ])('reads %s as %i cents', (input, cents) => {
    expect(parseSignedAmount(input)).toEqual({ ok: true, cents });
  });

  it.each(['', '   ', 'abc', '1,2,3', '12,345', '--5', '1.2.3,4'])('rejects %j', (input) => {
    expect(parseSignedAmount(input).ok).toBe(false);
  });

  it('rejects zero with its own message', () => {
    expect(parseSignedAmount('0,00')).toEqual({ ok: false, error: 'Importe cero.' });
    expect(parseSignedAmount('-0')).toEqual({ ok: false, error: 'Importe cero.' });
  });
});

describe('parseImportDate', () => {
  it.each([
    ['25/11/2026', '2026-11-25'],
    ['5/1/2026', '2026-01-05'],
    ['05-01-2026', '2026-01-05'],
    ['05.01.2026', '2026-01-05'],
    ['05/01/26', '2026-01-05'],
    ['2026-01-05', '2026-01-05'],
    ['2026-1-5', '2026-01-05'],
    ['05/01/2026 13:45', '2026-01-05'],
    ['29/02/2028', '2028-02-29'],
  ])('reads %s as %s', (input, date) => {
    expect(parseImportDate(input)).toEqual({ ok: true, date });
  });

  it.each([
    '',
    'ayer',
    '31/02/2026',
    '29/02/2027',
    '13/13/2026',
    '2026/01/05',
    '1/2',
    '00/01/2026',
  ])('rejects %j', (input) => {
    expect(parseImportDate(input).ok).toBe(false);
  });
});

const signed: ImportMapping = {
  hasHeader: true,
  dateColumn: 0,
  conceptColumn: 1,
  amountMode: 'signed',
  amountColumn: 2,
  debitColumn: null,
  creditColumn: null,
};

describe('readRows', () => {
  it('reads a signed-amount file, dropping the header and normalising the concept', () => {
    const records = parseCsv(
      'Fecha;Concepto;Importe\n01/02/2026;  COMPRA   SUPERMERCADO  ;-45,30\n02/02/2026;Nómina ficticia;1.800,00\n',
      ';',
    );
    expect(readRows(records, signed)).toEqual([
      {
        line: 2,
        date: '2026-02-01',
        concept: 'COMPRA SUPERMERCADO',
        amountCents: -4_530,
        error: null,
      },
      {
        line: 3,
        date: '2026-02-02',
        concept: 'Nómina ficticia',
        amountCents: 180_000,
        error: null,
      },
    ]);
  });

  it('reads a file without header, with the columns in another order', () => {
    const records = parseCsv('-9,99,Suscripción,2026-03-01\n', ',');
    // Comma delimiter and decimal comma clash: the amount is quoted in real exports.
    expect(records[0]?.fields).toHaveLength(4);
    const quoted = parseCsv('"-9,99",Suscripción,2026-03-01\n', ',');
    const mapping: ImportMapping = {
      ...signed,
      hasHeader: false,
      dateColumn: 2,
      conceptColumn: 1,
      amountColumn: 0,
    };
    expect(readRows(quoted, mapping)).toEqual([
      { line: 1, date: '2026-03-01', concept: 'Suscripción', amountCents: -999, error: null },
    ]);
  });

  it('reads separate debit and credit columns: debit is an expense, credit an income', () => {
    const records = parseCsv(
      'Fecha;Concepto;Cargo;Abono\n01/02/2026;Alquiler;700,00;\n02/02/2026;Nómina;;1.800,00\n03/02/2026;Cajero;-20,00;\n04/02/2026;Devolución;0,00;15,00\n',
      ';',
    );
    const mapping: ImportMapping = {
      ...signed,
      amountMode: 'split',
      amountColumn: null,
      debitColumn: 2,
      creditColumn: 3,
    };
    expect(readRows(records, mapping).map((r) => r.amountCents)).toEqual([
      -70_000, 180_000, -2_000, 1_500,
    ]);
  });

  it('reports each problem on its own row and keeps the good rows', () => {
    const records = parseCsv(
      [
        'Fecha;Concepto;Importe',
        '31/02/2026;Fecha imposible;-1,00',
        '01/02/2026;;-1,00',
        '01/02/2026;Sin importe;',
        '01/02/2026;Importe raro;abc',
        '01/02/2026;Importe cero;0,00',
        '01/02/2026;Corta',
        '01/02/2026;Buena;-1,00',
        '01/02/2026;"Sin cerrar;-1,00',
      ].join('\n'),
      ';',
    );
    const rows = readRows(records, signed);
    expect(rows.map((r) => r.error)).toEqual([
      'La fecha no existe en el calendario.',
      'Concepto vacío.',
      'Importe vacío.',
      'Importe no válido.',
      'Importe cero.',
      'Faltan columnas en la fila.',
      null,
      'Comillas sin cerrar: la fila está incompleta.',
    ]);
    expect(rows[6]).toMatchObject({ line: 8, date: '2026-02-01', amountCents: -100 });
  });

  it('says a row with zero in both debit and credit has a zero amount', () => {
    const mapping: ImportMapping = {
      ...signed,
      hasHeader: false,
      amountMode: 'split',
      amountColumn: null,
      debitColumn: 2,
      creditColumn: 3,
    };
    const rows = readRows(parseCsv('01/02/2026;Cero;0,00;0,00', ';'), mapping);
    expect(rows[0]?.error).toBe('Importe cero.');
  });

  it('flags a row with both debit and credit', () => {
    const mapping: ImportMapping = {
      ...signed,
      hasHeader: false,
      amountMode: 'split',
      amountColumn: null,
      debitColumn: 2,
      creditColumn: 3,
    };
    const rows = readRows(parseCsv('01/02/2026;Raro;5,00;6,00', ';'), mapping);
    expect(rows[0]?.error).toBe('La fila tiene cargo y abono a la vez.');
  });
});

describe('guessMapping and mappingProblems', () => {
  it('finds the columns from Spanish header names', () => {
    const records = parseCsv('Fecha operación;Descripción;Importe;Saldo\n', ';');
    expect(guessMapping(records)).toMatchObject({
      hasHeader: true,
      dateColumn: 0,
      conceptColumn: 1,
      amountMode: 'signed',
      amountColumn: 2,
    });
  });

  it('detects a debit/credit layout', () => {
    const records = parseCsv('Fecha;Concepto;Cargo;Abono\n', ';');
    expect(guessMapping(records)).toMatchObject({
      amountMode: 'split',
      amountColumn: null,
      debitColumn: 2,
      creditColumn: 3,
    });
  });

  it('falls back to date, concept, amount without a recognisable header', () => {
    const records = parseCsv('01/02/2026;Pan;-1,20\n', ';');
    expect(guessMapping(records)).toMatchObject({
      hasHeader: false,
      dateColumn: 0,
      conceptColumn: 1,
      amountColumn: 2,
    });
  });

  it('lists what is missing or out of range', () => {
    expect(mappingProblems(signed, 3)).toEqual([]);
    expect(mappingProblems({ ...signed, amountColumn: 5 }, 3)).toEqual([
      'Elige la columna de importe.',
    ]);
    expect(
      mappingProblems(
        { ...signed, amountMode: 'split', amountColumn: null, debitColumn: 2, creditColumn: null },
        4,
      ),
    ).toEqual(['Elige la columna de abono.']);
  });
});
