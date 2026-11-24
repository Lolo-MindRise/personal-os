import type { GoalDto, SettingsDto } from '../shared/api.js';
import { centsToInput, parseMoney } from '../shared/money.js';
import { isoDate } from '../shared/schemas.js';

// Form helpers for the Resumen (settings) and Objetivos (goals) screens.

/** Width of a bar in whole percent: `value` against the largest value shown, 0 to 100. */
export function barPercent(value: number, max: number): number {
  if (max <= 0 || value <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(1, Math.round((value * 100) / max)));
}

// --- Initial savings (settings) ---

export interface SettingsFormValues {
  balance: string;
  date: string;
}
export type SettingsField = keyof SettingsFormValues;
export interface SettingsPayload {
  initialSavingsCents: number;
  initialSavingsDate: string;
}
export type SettingsFormResult =
  | { ok: true; payload: SettingsPayload }
  | { ok: false; errors: Partial<Record<SettingsField, string>> };

export const SETTINGS_ERRORS = { date: 'Introduce una fecha válida.' } as const;

export function formFromSettings(settings: SettingsDto): SettingsFormValues {
  return {
    balance: settings.initialSavingsDate === null ? '' : centsToInput(settings.initialSavingsCents),
    date: settings.initialSavingsDate ?? '',
  };
}

export function validateSettingsForm(values: SettingsFormValues): SettingsFormResult {
  const errors: Partial<Record<SettingsField, string>> = {};
  const balance = parseMoney(values.balance, { allowZero: true });
  if (!balance.ok) {
    errors.balance = balance.error;
  }
  if (!isoDate.safeParse(values.date).success) {
    errors.date = SETTINGS_ERRORS.date;
  }
  if (Object.keys(errors).length > 0 || !balance.ok) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    payload: { initialSavingsCents: balance.cents, initialSavingsDate: values.date },
  };
}

const SETTINGS_API_FIELDS: Record<string, SettingsField> = {
  initialSavingsCents: 'balance',
  initialSavingsDate: 'date',
};

export function mapSettingsApiErrors(
  fields: Record<string, string>,
): Partial<Record<SettingsField, string>> {
  const errors: Partial<Record<SettingsField, string>> = {};
  for (const [key, message] of Object.entries(fields)) {
    const field = SETTINGS_API_FIELDS[key];
    if (field !== undefined) {
      errors[field] = message;
    }
  }
  return errors;
}

// --- Goals ---

export interface GoalFormValues {
  name: string;
  target: string;
  targetDate: string;
}
export type GoalField = keyof GoalFormValues;
export interface GoalPayload {
  name: string;
  targetAmountCents: number;
  targetDate: string;
}
export type GoalFormResult =
  { ok: true; payload: GoalPayload } | { ok: false; errors: Partial<Record<GoalField, string>> };

export const GOAL_ERRORS = {
  name: 'Escribe un nombre.',
  targetDate: 'Introduce una fecha válida.',
} as const;

export function emptyGoalForm(): GoalFormValues {
  return { name: '', target: '', targetDate: '' };
}

export function formFromGoal(goal: GoalDto): GoalFormValues {
  return {
    name: goal.name,
    target: centsToInput(goal.targetAmountCents),
    targetDate: goal.targetDate,
  };
}

export function validateGoalForm(values: GoalFormValues): GoalFormResult {
  const errors: Partial<Record<GoalField, string>> = {};
  const name = values.name.trim();
  if (name === '') {
    errors.name = GOAL_ERRORS.name;
  }
  const target = parseMoney(values.target);
  if (!target.ok) {
    errors.target = target.error;
  }
  if (!isoDate.safeParse(values.targetDate).success) {
    errors.targetDate = GOAL_ERRORS.targetDate;
  }
  if (Object.keys(errors).length > 0 || !target.ok) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    payload: { name, targetAmountCents: target.cents, targetDate: values.targetDate },
  };
}

const GOAL_API_FIELDS: Record<string, GoalField> = {
  name: 'name',
  targetAmountCents: 'target',
  targetDate: 'targetDate',
};

export function mapGoalApiErrors(
  fields: Record<string, string>,
): Partial<Record<GoalField, string>> {
  const errors: Partial<Record<GoalField, string>> = {};
  for (const [key, message] of Object.entries(fields)) {
    const field = GOAL_API_FIELDS[key];
    if (field !== undefined) {
      errors[field] = message;
    }
  }
  return errors;
}
