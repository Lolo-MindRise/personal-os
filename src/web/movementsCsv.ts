import type { AccountDto, MovementDto, MovementSearchDto } from '../shared/api.js';
import { KIND_LABELS } from './labels.js';
import { formatDate } from './months.js';

// CSV export of movements for Spanish-locale Excel: `;` separator, `dd/mm/yyyy` dates, amounts as
// `1.234,56` built from integer cents without floats, UTF-8 with BOM (ADR-0002).

const SEPARATOR = ';';
const BOM = '﻿';

export const CSV_HEADER = [
  'Fecha',
  'Tipo',
  'Categoría',
  'Concepto',
  'Importe',
  'Notas',
  'Marcas',
  'Cuenta',
];

/** Integer cents as `1.234,56` (no currency sign). Negative amounts get a leading `-`. */
export function formatCsvAmount(cents: number): string {
  const abs = Math.abs(cents);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+$)/g, '.');
  const fraction = String(abs % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${whole},${fraction}`;
}

/**
 * Quotes a text cell when it holds `;`, `"` or a line break. Text starting with `=`, `+`, `-` or
 * `@` gets a leading apostrophe so Excel does not run it as a formula.
 */
export function csvText(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The whole file: BOM, header and one row per movement, lines ending in CRLF. */
export function movementsToCsv(
  movements: MovementDto[],
  accounts: Pick<AccountDto, 'id' | 'name'>[],
): string {
  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
  const rows = movements.map((m) =>
    [
      formatDate(m.date),
      KIND_LABELS[m.kind],
      csvText(m.categoryName),
      csvText(m.concept),
      formatCsvAmount(m.amountCents),
      csvText(m.notes ?? ''),
      csvText(m.tags.join(', ')),
      csvText(accountNames.get(m.accountId) ?? ''),
    ].join(SEPARATOR),
  );
  return BOM + [CSV_HEADER.join(SEPARATOR), ...rows].join('\r\n') + '\r\n';
}

/** Lowercase, accents stripped, anything but letters and digits turned into single `-`. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** File name of the month export; carries the category when a category filter is active. */
export function monthCsvFilename(month: string, categoryName?: string): string {
  if (categoryName === undefined) {
    return `movimientos-${month}.csv`;
  }
  const slug = slugify(categoryName);
  return `movimientos-${month}-${slug === '' ? 'categoria' : slug}.csv`;
}

/** The month export may only run when the rows on screen are those of `month` and loaded fine. */
export function canExportMonth(
  loadedMonth: string | undefined,
  month: string,
  loadError: string | undefined,
): boolean {
  return loadedMonth === month && loadError === undefined;
}

/** Fetches every page of a search, in order. Any failing page rejects the whole export. */
export async function fetchAllSearchRows(
  fetchPage: (page: number) => Promise<MovementSearchDto>,
): Promise<MovementDto[]> {
  const rows: MovementDto[] = [];
  let page = 1;
  let pageCount = 1;
  while (page <= pageCount) {
    const result = await fetchPage(page);
    rows.push(...result.rows);
    pageCount = result.pageCount;
    page += 1;
  }
  return rows;
}

/** Starts a browser download of `text` as a CSV file. Nothing goes to the server. */
export function downloadCsv(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
