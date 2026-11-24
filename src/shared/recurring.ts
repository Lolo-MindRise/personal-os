// Pure date logic for recurring items (ADR-0005). Shared by the API and the UI.

/** `'2026-02'` → 28 (29 in leap years). */
export function daysInMonth(month: string): number {
  const [year, mon] = month.split('-').map(Number);
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year ?? 0, mon ?? 1, 0)).getUTCDate();
}

/** The month (`YYYY-MM`) a `YYYY-MM-DD` date belongs to. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/**
 * The expected date of an item in a month: its day, clamped to the month's
 * length (day 31 in February becomes the 28th, or the 29th in a leap year).
 */
export function expectedDate(month: string, day: number): string {
  const clamped = Math.min(day, daysInMonth(month));
  return `${month}-${String(clamped).padStart(2, '0')}`;
}

/**
 * An item is due in every month from its start month to its end month, both
 * included. Without an end month it never stops. Months compare correctly as
 * text because they are zero-padded ISO.
 */
export function isDueInMonth(
  item: { startMonth: string; endMonth: string | null },
  month: string,
): boolean {
  return item.startMonth <= month && (item.endMonth === null || month <= item.endMonth);
}
