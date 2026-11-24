const pad = (n: number) => String(n).padStart(2, '0');

/** Local-time `YYYY-MM-DD` (not UTC, so the date matches the user's calendar). */
export function todayISO(now: Date = new Date()): string {
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function currentMonth(now: Date = new Date()): string {
  return todayISO(now).slice(0, 7);
}

/** `shiftMonth('2026-01', -1)` → `'2025-12'`. */
export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number);
  const index = (year ?? 0) * 12 + ((mon ?? 1) - 1) + delta;
  return `${String(Math.floor(index / 12))}-${pad((index % 12) + 1)}`;
}

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** `'2026-01'` → `'enero de 2026'`. */
export function monthLabel(month: string): string {
  const [year, mon] = month.split('-');
  return `${MONTH_NAMES[Number(mon) - 1] ?? month} de ${year ?? ''}`;
}

/** `'2026-06'` → `'06/2026'`. */
export function formatMonth(month: string): string {
  const [year, mon] = month.split('-');
  return `${mon ?? ''}/${year ?? ''}`;
}

/** `'2026-01-05'` → `'05/01/2026'`. */
export function formatDate(iso: string): string {
  const [year, mon, day] = iso.split('-');
  return `${day ?? ''}/${mon ?? ''}/${year ?? ''}`;
}
