// Pure debt logic, shared by the API and the UI.

export interface RepaymentInput {
  date: string;
  amountCents: number;
}

/** The extra repayments dated strictly after the balance's as-of date, in cents. */
export function repaidSince(balanceAsOf: string, repayments: RepaymentInput[]): number {
  return repayments.filter((r) => r.date > balanceAsOf).reduce((sum, r) => sum + r.amountCents, 0);
}

/**
 * Estimated current balance: the recorded balance minus the extra repayments
 * linked to the debt after its as-of date. Never below zero. Regular monthly
 * installments are NOT deducted (out of scope for now).
 */
export function estimateBalance(
  balanceCents: number,
  balanceAsOf: string,
  repayments: RepaymentInput[],
): number {
  return Math.max(0, balanceCents - repaidSince(balanceAsOf, repayments));
}

const RATE_ERRORS = {
  empty: 'Introduce un tipo de interés.',
  invalid: 'Tipo no válido. Ejemplos: 6,5 · 4,25 · 0.',
  decimals: 'Usa como máximo dos decimales.',
  tooLarge: 'El tipo no puede superar el 100 %.',
} as const;

export type ParseRateResult = { ok: true; bps: number } | { ok: false; error: string };

/**
 * Parses a typed annual rate in percent into basis points: `6,5` → 650,
 * `4.25` → 425, `0` → 0. A trailing `%` is allowed. Zero is allowed (interest-free debt).
 */
export function parseRate(input: string): ParseRateResult {
  const text = input.trim().replace(/\s*%$/, '').trim();
  if (text === '') {
    return { ok: false, error: RATE_ERRORS.empty };
  }
  const match = /^(\d{1,3})(?:[.,](\d+))?$/.exec(text);
  if (match === null) {
    return { ok: false, error: RATE_ERRORS.invalid };
  }
  const whole = match[1] ?? '0';
  const decimals = match[2] ?? '';
  if (decimals.length > 2) {
    return { ok: false, error: RATE_ERRORS.decimals };
  }
  const bps = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  if (bps > 10_000) {
    return { ok: false, error: RATE_ERRORS.tooLarge };
  }
  return { ok: true, bps };
}

/** No-break space, as es-ES puts before the percent sign. */
const NBSP = '\u00A0';

/** `650` → `6,50 %` (es-ES: comma decimal, a no-break space before the percent sign). */
export function formatRate(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const rest = String(bps % 100).padStart(2, '0');
  return `${String(whole)},${rest}${NBSP}%`;
}

/** `650` → `6,5`, `425` → `4,25`, `600` → `6`: what a user would type back into the form. */
export function rateToInput(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const rest = String(bps % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return rest === '' ? String(whole) : `${String(whole)},${rest}`;
}
