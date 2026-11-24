// Money helpers shared by the API and the UI (ADR-0002: integer cents, never floats).

export type ParseMoneyResult = { ok: true; cents: number } | { ok: false; error: string };

export const MONEY_ERRORS = {
  empty: 'Introduce un importe.',
  negative: 'El importe no puede ser negativo.',
  invalid: 'Importe no válido. Ejemplos: 12,50 · 1.234,56 · 1234.',
  decimals: 'Usa como máximo dos decimales.',
  zero: 'El importe debe ser mayor que cero.',
  tooLarge: 'El importe es demasiado grande.',
} as const;

/** No-break space, as es-ES puts before the euro sign. */
const NBSP = '\u00A0';

const THOUSANDS = /^\d{1,3}(\.\d{3})+$/;

/**
 * Parses a user-typed amount in Spanish format into integer cents.
 *
 * Accepted: `12,50`, `12.5`, `1.234,56`, `1234`, with surrounding spaces.
 * With a comma, the comma is the decimal separator and dots must be
 * thousands separators. Without a comma, a dot followed by one or two digits
 * is a decimal point (`12.5`); a dot followed by groups of exactly three
 * digits is a thousands separator (`1.234` is 1234 €).
 * Rejected: empty, negative, zero (unless `allowZero`, for balances), more than two decimals, non-numeric.
 */
export function parseMoney(input: string, options: { allowZero?: boolean } = {}): ParseMoneyResult {
  const text = input.trim();
  if (text === '') {
    return { ok: false, error: MONEY_ERRORS.empty };
  }
  if (text.startsWith('-')) {
    return { ok: false, error: MONEY_ERRORS.negative };
  }

  let integerPart: string;
  let decimalPart = '';

  if (text.includes(',')) {
    const [whole, fraction, ...rest] = text.split(',');
    if (whole === undefined || fraction === undefined || rest.length > 0) {
      return { ok: false, error: MONEY_ERRORS.invalid };
    }
    if (!/^\d+$/.test(fraction)) {
      return { ok: false, error: MONEY_ERRORS.invalid };
    }
    if (!/^\d+$/.test(whole) && !THOUSANDS.test(whole)) {
      return { ok: false, error: MONEY_ERRORS.invalid };
    }
    integerPart = whole.replaceAll('.', '');
    decimalPart = fraction;
  } else if (THOUSANDS.test(text)) {
    integerPart = text.replaceAll('.', '');
  } else if (/^\d+$/.test(text)) {
    integerPart = text;
  } else if (/^\d+\.\d+$/.test(text)) {
    const [whole, fraction] = text.split('.');
    integerPart = whole ?? '';
    decimalPart = fraction ?? '';
  } else {
    return { ok: false, error: MONEY_ERRORS.invalid };
  }

  if (decimalPart.length > 2) {
    return { ok: false, error: MONEY_ERRORS.decimals };
  }

  const cents = Number(integerPart + decimalPart.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) {
    return { ok: false, error: MONEY_ERRORS.tooLarge };
  }
  if (cents === 0 && options.allowZero !== true) {
    return { ok: false, error: MONEY_ERRORS.zero };
  }
  return { ok: true, cents };
}

/**
 * Formats integer cents for display in es-ES: `123456` → `1.234,56 €`.
 * The space before the euro sign is a no-break space (U+00A0), as in es-ES.
 * Always groups thousands (Intl's es-ES skips grouping for 4-digit numbers).
 */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Expected integer cents, got ${String(cents)}`);
  }
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const euros = Math.trunc(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rest = (abs % 100).toString().padStart(2, '0');
  return `${sign}${euros},${rest}${NBSP}€`;
}

/** Formats cents as the text a user would type back into the form: `123456` → `1234,56`. */
export function centsToInput(cents: number): string {
  const abs = Math.abs(cents);
  return `${Math.trunc(abs / 100).toString()},${(abs % 100).toString().padStart(2, '0')}`;
}
