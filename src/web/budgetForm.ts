import { parseMoney } from '../shared/money.js';
import { isoMonth } from '../shared/schemas.js';

/** What the user typed. Everything is text until `validateBudgetForm`. */
export interface BudgetFormValues {
  categoryId: string;
  amount: string;
  /** `YYYY-MM`: the month the new amount starts to apply. */
  validFrom: string;
}

export type BudgetField = keyof BudgetFormValues;

export interface BudgetPayload {
  categoryId: number;
  amountCents: number;
  validFrom: string;
}

export type BudgetFormResult =
  | { ok: true; payload: BudgetPayload }
  | { ok: false; errors: Partial<Record<BudgetField, string>> };

export const BUDGET_ERRORS = {
  categoryId: 'Elige una categoría.',
  validFrom: 'Elige el mes desde el que se aplica.',
} as const;

export function emptyBudgetForm(month: string): BudgetFormValues {
  return { categoryId: '', amount: '', validFrom: month };
}

export function validateBudgetForm(values: BudgetFormValues): BudgetFormResult {
  const errors: Partial<Record<BudgetField, string>> = {};
  const categoryId = Number(values.categoryId);
  if (values.categoryId === '' || !Number.isInteger(categoryId) || categoryId < 1) {
    errors.categoryId = BUDGET_ERRORS.categoryId;
  }
  const amount = parseMoney(values.amount);
  if (!amount.ok) {
    errors.amount = amount.error;
  }
  if (!isoMonth.safeParse(values.validFrom).success) {
    errors.validFrom = BUDGET_ERRORS.validFrom;
  }
  if (Object.keys(errors).length > 0 || !amount.ok) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    payload: { categoryId, amountCents: amount.cents, validFrom: values.validFrom },
  };
}

const API_FIELD_TO_FORM: Record<string, BudgetField> = {
  categoryId: 'categoryId',
  amountCents: 'amount',
  validFrom: 'validFrom',
};

/** Maps the `fields` of an API error to form fields; unknown keys are dropped. */
export function mapBudgetApiErrors(
  fields: Record<string, string>,
): Partial<Record<BudgetField, string>> {
  const errors: Partial<Record<BudgetField, string>> = {};
  for (const [key, message] of Object.entries(fields)) {
    const field = API_FIELD_TO_FORM[key];
    if (field !== undefined) {
      errors[field] = message;
    }
  }
  return errors;
}

/** Difference wording for the table: positive is under budget, negative is over. */
export function differenceTone(differenceCents: number | null): 'over' | 'under' | 'none' {
  if (differenceCents === null) {
    return 'none';
  }
  return differenceCents < 0 ? 'over' : 'under';
}
