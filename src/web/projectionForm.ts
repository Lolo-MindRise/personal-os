import type { CategoryDto, ProjectionMonthDto } from '../shared/api.js';
import { parseSignedAmount } from '../shared/csvImport.js';
import { formatCents, parseMoney } from '../shared/money.js';
import { firstMonthReaching, type Scenario } from '../shared/projection.js';
import { isoMonth } from '../shared/schemas.js';
import { formatMonth } from './months.js';

/** What the user typed for a scenario. Everything is text until `validateScenarioForm`. */
export interface ScenarioFormValues {
  type: Scenario['type'];
  fromMonth: string;
  /** Only for the category type. */
  categoryId: string;
  /** Euros in Spanish format; income may be signed (`+200`, `-50`). */
  amount: string;
}

export type ScenarioField = keyof ScenarioFormValues;

export type ScenarioFormResult =
  { ok: true; scenario: Scenario } | { ok: false; errors: Partial<Record<ScenarioField, string>> };

export const SCENARIO_ERRORS = {
  month: 'Elige un mes.',
  category: 'Elige una categoría de gasto.',
} as const;

export const monthOutsideRange = (from: string, to: string) =>
  `El mes debe estar entre ${formatMonth(from)} y ${formatMonth(to)}.`;

export function emptyScenarioForm(month: string): ScenarioFormValues {
  return { type: 'income', fromMonth: month, categoryId: '', amount: '' };
}

/** Validates a scenario in Spanish, field by field. It must start inside the projected range. */
export function validateScenarioForm(
  values: ScenarioFormValues,
  range: { currentMonth: string; endMonth: string },
  categories: CategoryDto[],
): ScenarioFormResult {
  const errors: Partial<Record<ScenarioField, string>> = {};

  if (!isoMonth.safeParse(values.fromMonth).success) {
    errors.fromMonth = SCENARIO_ERRORS.month;
  } else if (values.fromMonth < range.currentMonth || values.fromMonth > range.endMonth) {
    errors.fromMonth = monthOutsideRange(range.currentMonth, range.endMonth);
  }

  if (values.type === 'income') {
    const amount = parseSignedAmount(values.amount);
    if (!amount.ok) {
      errors.amount = amount.error;
    }
    if (Object.keys(errors).length > 0 || !amount.ok) {
      return { ok: false, errors };
    }
    return {
      ok: true,
      scenario: { type: 'income', fromMonth: values.fromMonth, amountCents: amount.cents },
    };
  }

  const categoryId = Number(values.categoryId);
  if (!categories.some((c) => c.id === categoryId && c.kind === 'expense')) {
    errors.categoryId = SCENARIO_ERRORS.category;
  }
  // The new monthly amount may be zero ("I stop spending on this").
  const amount = parseMoney(values.amount, { allowZero: true });
  if (!amount.ok) {
    errors.amount = amount.error;
  }
  if (Object.keys(errors).length > 0 || !amount.ok) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    scenario: {
      type: 'category',
      fromMonth: values.fromMonth,
      categoryId,
      amountCents: amount.cents,
    },
  };
}

/** A scenario in words, for the list of adjustments. */
export function describeScenario(scenario: Scenario, categories: CategoryDto[]): string {
  const from = `Desde ${formatMonth(scenario.fromMonth)}`;
  if (scenario.type === 'income') {
    const sign = scenario.amountCents > 0 ? '+' : '';
    return `${from}: ingresos ${sign}${formatCents(scenario.amountCents)} al mes`;
  }
  const name = categories.find((c) => c.id === scenario.categoryId)?.name ?? 'categoría';
  return `${from}: «${name}» pasa a ${formatCents(scenario.amountCents)} al mes`;
}

/** When a goal is reached in one projection, in words. */
export function goalReachedText(
  months: ProjectionMonthDto[],
  targetCents: number,
  targetMonth: string,
): string {
  const reached = firstMonthReaching(months, targetCents);
  const last = months.at(-1)?.month;
  if (reached !== undefined) {
    const late = reached > targetMonth ? ' (después de la fecha objetivo)' : '';
    return `se alcanza en ${formatMonth(reached)}${late}`;
  }
  return last === undefined
    ? 'sin datos'
    : `no se alcanza hasta ${formatMonth(last)}, el final del periodo proyectado`;
}
