// Pure CSV parsing for the bank importer (task 0013, block 2). Runs in the browser; the server
// only sees the parsed rows. Spanish formats: `;` or `,` delimiter, `dd/mm/yyyy`, `1.234,56`.

import { parseMoney } from './money.js';

export type Delimiter = ';' | ',';

export interface CsvRecord {
  /** 1-based line of the file where the record starts. */
  line: number;
  fields: string[];
  /** True when a quoted field was never closed (the record ran to the end of the file). */
  malformed: boolean;
}

/**
 * Splits CSV text into records. Handles quoted fields (delimiters and line breaks inside quotes,
 * `""` as an escaped quote), `\n`, `\r\n` and `\r` line ends and a UTF-8 byte order mark.
 * Completely empty lines are skipped.
 */
export function parseCsv(input: string, delimiter: Delimiter): CsvRecord[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let quoted = false; // the current field started with a quote
  let line = 1;
  let startLine = 1;
  let sawContent = false;

  const endField = () => {
    fields.push(field);
    field = '';
    quoted = false;
  };
  const endRecord = (malformed: boolean) => {
    endField();
    const empty = fields.length === 1 && fields[0] === '' && !sawContent;
    if (!empty) {
      records.push({ line: startLine, fields, malformed });
    }
    fields = [];
    sawContent = false;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);
    if (inQuotes) {
      if (char === '"') {
        if (text.charAt(i + 1) === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === '\n') {
          line++;
        }
        field += char;
      }
      continue;
    }
    if (char === '"' && field === '' && !quoted) {
      inQuotes = true;
      quoted = true;
      sawContent = true;
    } else if (char === delimiter) {
      sawContent = true;
      endField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text.charAt(i + 1) === '\n') {
        i++;
      }
      endRecord(false);
      line++;
      startLine = line;
    } else {
      sawContent = true;
      field += char;
    }
  }
  if (inQuotes) {
    endRecord(true);
  } else if (sawContent || field !== '' || fields.length > 0) {
    endRecord(false);
  }
  return records;
}

/**
 * `;` or `,`: the one that splits the first lines into the same number (more than one) of
 * columns, preferring more columns. `;` wins ties, as Spanish exports use it with `,` decimals.
 */
export function detectDelimiter(text: string): Delimiter {
  const head = text
    .split(/\r\n|\n|\r/)
    .slice(0, 12)
    .join('\n');
  const score = (delimiter: Delimiter): number => {
    const records = parseCsv(head, delimiter);
    const columns = records[0]?.fields.length ?? 0;
    return columns > 1 && records.every((r) => r.fields.length === columns) ? columns : 0;
  };
  return score(',') > score(';') ? ',' : ';';
}

const AMOUNT_ERRORS = {
  empty: 'Importe vacío.',
  invalid: 'Importe no válido.',
  zero: 'Importe cero.',
} as const;

export type SignedAmountResult = { ok: true; cents: number } | { ok: false; error: string };

/**
 * A bank amount in Spanish format, signed: `-1.234,56`, `1.234,56-`, `+12,5`, `12,50 €`, `(12,50)`.
 * Negative amounts are expenses. Zero is rejected (a movement needs a positive amount).
 */
export function parseSignedAmount(input: string): SignedAmountResult {
  let text = input
    .replaceAll(' ', ' ')
    .replace(/\s*(€|eur)\s*$/i, '')
    .trim();
  if (text === '') {
    return { ok: false, error: AMOUNT_ERRORS.empty };
  }
  let negative = false;
  const parenthesised = /^\((.*)\)$/.exec(text);
  if (parenthesised !== null) {
    negative = true;
    text = (parenthesised[1] ?? '').trim();
  }
  if (text.startsWith('-') || text.endsWith('-')) {
    negative = !negative;
    text = text.startsWith('-') ? text.slice(1) : text.slice(0, -1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  text = text.replaceAll(' ', '');
  const parsed = parseMoney(text, { allowZero: true });
  if (!parsed.ok) {
    return { ok: false, error: AMOUNT_ERRORS.invalid };
  }
  if (parsed.cents === 0) {
    return { ok: false, error: AMOUNT_ERRORS.zero };
  }
  return { ok: true, cents: negative ? -parsed.cents : parsed.cents };
}

export type ImportDateResult = { ok: true; date: string } | { ok: false; error: string };

/**
 * `dd/mm/yyyy` (also `d/m/yyyy`, `dd-mm-yyyy`, `dd.mm.yyyy`, two-digit years as 20yy) or ISO
 * `yyyy-mm-dd`, optionally followed by a time. Returns an ISO date, or an error for malformed or
 * non-existent dates.
 */
export function parseImportDate(input: string): ImportDateResult {
  const text = input.trim().split(/[ T]/)[0] ?? '';
  let year: number;
  let month: number;
  let day: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const spanish = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
  if (iso !== null) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (spanish !== null) {
    const y = spanish[3] ?? '';
    [day, month, year] = [
      Number(spanish[1]),
      Number(spanish[2]),
      y.length === 2 ? 2000 + Number(y) : Number(y),
    ];
  } else {
    return { ok: false, error: 'Fecha no válida.' };
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return { ok: false, error: 'La fecha no existe en el calendario.' };
  }
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return { ok: true, date: `${pad(year, 4)}-${pad(month)}-${pad(day)}` };
}

/** Which columns hold what. Columns are 0-based indexes into each record. */
export interface ImportMapping {
  /** The first record is a header and is not imported. */
  hasHeader: boolean;
  dateColumn: number;
  conceptColumn: number;
  /** `signed`: one column, negative = expense. `split`: separate debit and credit columns. */
  amountMode: 'signed' | 'split';
  amountColumn: number | null;
  debitColumn: number | null;
  creditColumn: number | null;
}

/** One record read with a mapping. A row with an `error` cannot be imported. */
export interface ParsedImportRow {
  /** Line of the file, for messages. */
  line: number;
  date: string | null;
  concept: string;
  /** Signed: negative is an expense, positive an income. Null when the row has an error. */
  amountCents: number | null;
  error: string | null;
}

/** The mapping's problems that make it unusable, in Spanish; empty when it is complete. */
export function mappingProblems(mapping: ImportMapping, columnCount: number): string[] {
  const problems: string[] = [];
  const check = (column: number | null, label: string) => {
    if (column === null || column < 0 || column >= columnCount) {
      problems.push(`Elige la columna de ${label}.`);
    }
  };
  check(mapping.dateColumn, 'fecha');
  check(mapping.conceptColumn, 'concepto');
  if (mapping.amountMode === 'signed') {
    check(mapping.amountColumn, 'importe');
  } else {
    check(mapping.debitColumn, 'cargo');
    check(mapping.creditColumn, 'abono');
  }
  return problems;
}

const cell = (record: CsvRecord, column: number | null): string =>
  column === null ? '' : (record.fields[column] ?? '').trim();

function amountOf(record: CsvRecord, mapping: ImportMapping): SignedAmountResult {
  if (mapping.amountMode === 'signed') {
    return parseSignedAmount(cell(record, mapping.amountColumn));
  }
  const debit = cell(record, mapping.debitColumn);
  const credit = cell(record, mapping.creditColumn);
  if (debit !== '' && credit !== '') {
    const d = parseSignedAmount(debit);
    const c = parseSignedAmount(credit);
    // A column holding a zero next to the real one is common ("0,00"): ignore the zero.
    if (d.ok && !c.ok && c.error === AMOUNT_ERRORS.zero) {
      return { ok: true, cents: -Math.abs(d.cents) };
    }
    if (c.ok && !d.ok && d.error === AMOUNT_ERRORS.zero) {
      return { ok: true, cents: Math.abs(c.cents) };
    }
    return { ok: false, error: 'La fila tiene cargo y abono a la vez.' };
  }
  if (debit === '' && credit === '') {
    return { ok: false, error: AMOUNT_ERRORS.empty };
  }
  const parsed = parseSignedAmount(debit === '' ? credit : debit);
  if (!parsed.ok) {
    return parsed;
  }
  return { ok: true, cents: debit === '' ? Math.abs(parsed.cents) : -Math.abs(parsed.cents) };
}

/** Reads records with a mapping. The header row (if any) is dropped; every other row is kept. */
export function readRows(records: CsvRecord[], mapping: ImportMapping): ParsedImportRow[] {
  const data = mapping.hasHeader ? records.slice(1) : records;
  return data.map((record): ParsedImportRow => {
    const concept = cell(record, mapping.conceptColumn).replace(/\s+/g, ' ');
    const fail = (error: string): ParsedImportRow => ({
      line: record.line,
      date: null,
      concept,
      amountCents: null,
      error,
    });
    if (record.malformed) {
      return fail('Comillas sin cerrar: la fila está incompleta.');
    }
    const needed = Math.max(
      mapping.dateColumn,
      mapping.conceptColumn,
      mapping.amountColumn ?? 0,
      mapping.debitColumn ?? 0,
      mapping.creditColumn ?? 0,
    );
    if (record.fields.length <= needed) {
      return fail('Faltan columnas en la fila.');
    }
    const date = parseImportDate(cell(record, mapping.dateColumn));
    if (!date.ok) {
      return fail(date.error);
    }
    if (concept === '') {
      return fail('Concepto vacío.');
    }
    const amount = amountOf(record, mapping);
    if (!amount.ok) {
      return fail(amount.error);
    }
    return { line: record.line, date: date.date, concept, amountCents: amount.cents, error: null };
  });
}

/**
 * A first guess for the mapping from the header names (Spanish bank exports): "Fecha", "Concepto" or
 * "Descripción", "Importe", or "Cargo"/"Debe" and "Abono"/"Haber". Falls back to the first three
 * columns in the order date, concept, amount.
 */
export function guessMapping(records: CsvRecord[]): ImportMapping {
  const header = (records[0]?.fields ?? []).map((h) =>
    h.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim(),
  );
  const find = (...names: string[]) => {
    const index = header.findIndex((h) => names.some((n) => h.includes(n)));
    return index < 0 ? null : index;
  };
  const date = find('fecha', 'date');
  const concept = find('concepto', 'descripcion', 'detalle', 'movimiento', 'description');
  const amount = find('importe', 'cantidad', 'amount');
  const debit = find('cargo', 'debe', 'debit');
  const credit = find('abono', 'haber', 'credit');
  const hasHeader = date !== null || concept !== null || amount !== null;
  const split = amount === null && debit !== null && credit !== null;
  return {
    hasHeader,
    dateColumn: date ?? 0,
    conceptColumn: concept ?? 1,
    amountMode: split ? 'split' : 'signed',
    amountColumn: split ? null : (amount ?? 2),
    debitColumn: split ? debit : null,
    creditColumn: split ? credit : null,
  };
}
