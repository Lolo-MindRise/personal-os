// Pure debt logic, shared by the API and the UI.

export interface RepaymentInput {
  date: string;
  amountCents: number;
}

/** The extra repayments dated strictly after the balance's as-of date, in cents. */
export function repaidSince(balanceAsOf: string, repayments: RepaymentInput[]): number {
  return repayments.filter((r) => r.date > balanceAsOf).reduce((sum, r) => sum + r.amountCents, 0);
}

/** A confirmed installment of a recurring item linked to the debt, as actually paid. */
export interface InstallmentInput {
  movementId: number;
  date: string;
  amountCents: number;
}

/** An extra repayment with the id of its movement (for a stable order on equal dates). */
export interface ExtraRepaymentInput extends RepaymentInput {
  movementId: number;
}

/** How one confirmed installment split into interest and principal. */
export interface InstallmentBreakdown {
  movementId: number;
  date: string;
  paidCents: number;
  interestCents: number;
  principalCents: number;
  balanceAfterCents: number;
}

export interface DebtEstimate {
  /** Recorded balance minus principal of installments and extra repayments after the as-of date. */
  estimatedBalanceCents: number;
  /** Principal repaid by the confirmed installments. */
  principalPaidCents: number;
  /** Interest paid inside those installments (not part of the balance reduction). */
  interestPaidCents: number;
  /** Extra repayments that actually reduced the balance (capped by what was left). */
  extraRepaidCents: number;
  /** The installments in date order, each with its split. */
  installments: InstallmentBreakdown[];
}

/**
 * Interest of one month on a balance: balance × annual rate / 12, rounded half up to the cent.
 * Pure integer arithmetic: basis points are 1/10 000, so interest = balance × bps / 120 000.
 */
export function monthlyInterest(balanceCents: number, annualRateBps: number): number {
  return Math.floor((2 * balanceCents * annualRateBps + 120_000) / 240_000);
}

/**
 * Estimated current balance (French amortization, task 0013). Starting from the recorded balance
 * on its as-of date, every event dated strictly after it is applied in date order, whatever
 * order the installments were confirmed in:
 * - A confirmed installment of a linked recurring item: interest = monthlyInterest(balance, rate);
 *   principal = amount paid − interest, never below 0 and never above the balance. When the
 *   payment does not even cover the interest the whole payment counts as interest (the unpaid
 *   interest is not capitalised). Only the principal reduces the balance.
 * - An extra repayment: reduces the balance by its full amount, capped at the balance.
 * On the same date an installment is applied before an extra repayment (interest accrues on the
 * opening balance); remaining ties follow the movement id. The balance never goes below zero.
 */
export function estimateDebt(
  balanceCents: number,
  balanceAsOf: string,
  annualRateBps: number,
  installments: InstallmentInput[],
  extras: ExtraRepaymentInput[],
): DebtEstimate {
  type Event =
    { type: 'installment'; item: InstallmentInput } | { type: 'extra'; item: ExtraRepaymentInput };
  const events: Event[] = [
    ...installments
      .filter((i) => i.date > balanceAsOf)
      .map((item): Event => ({ type: 'installment', item })),
    ...extras.filter((e) => e.date > balanceAsOf).map((item): Event => ({ type: 'extra', item })),
  ].sort(
    (a, b) =>
      a.item.date.localeCompare(b.item.date) ||
      (a.type === b.type ? 0 : a.type === 'installment' ? -1 : 1) ||
      a.item.movementId - b.item.movementId,
  );

  let balance = balanceCents;
  let principalPaid = 0;
  let interestPaid = 0;
  let extraRepaid = 0;
  const breakdown: InstallmentBreakdown[] = [];
  for (const event of events) {
    if (event.type === 'extra') {
      const applied = Math.min(balance, event.item.amountCents);
      balance -= applied;
      extraRepaid += applied;
      continue;
    }
    const { movementId, date, amountCents } = event.item;
    const interest = Math.min(amountCents, monthlyInterest(balance, annualRateBps));
    const principal = Math.min(balance, amountCents - interest);
    balance -= principal;
    principalPaid += principal;
    interestPaid += interest;
    breakdown.push({
      movementId,
      date,
      paidCents: amountCents,
      interestCents: interest,
      principalCents: principal,
      balanceAfterCents: balance,
    });
  }
  return {
    estimatedBalanceCents: balance,
    principalPaidCents: principalPaid,
    interestPaidCents: interestPaid,
    extraRepaidCents: extraRepaid,
    installments: breakdown,
  };
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
