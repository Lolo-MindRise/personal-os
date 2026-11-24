import type { MilestoneDto } from '../shared/api.js';
import { MILESTONE_STATUSES, type MilestoneStatus } from '../shared/constants.js';
import { isoDate } from '../shared/schemas.js';

/** What the user typed. */
export interface MilestoneFormValues {
  title: string;
  targetDate: string;
  status: MilestoneStatus;
  notes: string;
}

export type MilestoneField = keyof MilestoneFormValues;

export interface MilestonePayload {
  title: string;
  targetDate: string;
  status: MilestoneStatus;
  notes: string | null;
}

export type MilestoneFormResult =
  | { ok: true; payload: MilestonePayload }
  | { ok: false; errors: Partial<Record<MilestoneField, string>> };

export const MILESTONE_ERRORS = {
  title: 'Escribe un título.',
  targetDate: 'Introduce una fecha válida.',
  status: 'Elige un estado.',
} as const;

export function emptyMilestoneForm(): MilestoneFormValues {
  return { title: '', targetDate: '', status: 'pending', notes: '' };
}

export function formFromMilestone(milestone: MilestoneDto): MilestoneFormValues {
  return {
    title: milestone.title,
    targetDate: milestone.targetDate,
    status: milestone.status,
    notes: milestone.notes ?? '',
  };
}

export function validateMilestoneForm(values: MilestoneFormValues): MilestoneFormResult {
  const errors: Partial<Record<MilestoneField, string>> = {};
  const title = values.title.trim();
  if (title === '') {
    errors.title = MILESTONE_ERRORS.title;
  }
  if (!isoDate.safeParse(values.targetDate).success) {
    errors.targetDate = MILESTONE_ERRORS.targetDate;
  }
  if (!(MILESTONE_STATUSES as readonly string[]).includes(values.status)) {
    errors.status = MILESTONE_ERRORS.status;
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  const notes = values.notes.trim();
  return {
    ok: true,
    payload: {
      title,
      targetDate: values.targetDate,
      status: values.status,
      notes: notes === '' ? null : notes,
    },
  };
}

const API_FIELD_TO_FORM: Record<string, MilestoneField> = {
  title: 'title',
  targetDate: 'targetDate',
  status: 'status',
  notes: 'notes',
};

/** Maps the `fields` of an API error to form fields; unknown keys are dropped. */
export function mapMilestoneApiErrors(
  fields: Record<string, string>,
): Partial<Record<MilestoneField, string>> {
  const errors: Partial<Record<MilestoneField, string>> = {};
  for (const [key, message] of Object.entries(fields)) {
    const field = API_FIELD_TO_FORM[key];
    if (field !== undefined) {
      errors[field] = message;
    }
  }
  return errors;
}
