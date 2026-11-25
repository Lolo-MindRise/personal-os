import { DATA_MESSAGES, MAX_IMPORT_BYTES, type DataImportResultDto } from '../shared/dataFile.js';

// Client side of the full-data export and import (plan 0002, task 06).

/** `personal-os-datos-2026-03-01.json` */
export function dataFileName(today: string): string {
  return `personal-os-datos-${today}.json`;
}

/** Starts a browser download of `text` as a JSON file. Nothing goes to the server. */
export function downloadJson(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Reads the text of a chosen file: a Spanish problem, or the parsed JSON to send. */
export function readImportText(
  text: string,
  sizeBytes: number,
): { ok: true; data: unknown } | { ok: false; error: string } {
  if (sizeBytes > MAX_IMPORT_BYTES) {
    return { ok: false, error: DATA_MESSAGES.tooBig };
  }
  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: DATA_MESSAGES.notJson };
  }
}

const COUNT_LABELS: [string, string][] = [
  ['movements', 'movimientos'],
  ['categories', 'categorías'],
  ['accounts', 'cuentas'],
  ['transfers', 'transferencias'],
  ['tags', 'marcas'],
  ['recurring_items', 'fijos'],
];

/** `Datos importados: 120 movimientos, 8 categorías, …` */
export function importSummary(result: DataImportResultDto): string {
  const parts = COUNT_LABELS.map(
    ([table, label]) => `${String(result.imported[table] ?? 0)} ${label}`,
  );
  return `Datos importados: ${parts.join(', ')}.`;
}
