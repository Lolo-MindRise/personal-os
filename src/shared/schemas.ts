import { z } from 'zod';
import { KINDS, MILESTONE_STATUSES } from './constants.js';

// Creation schemas shared by the API and the frontend (task 0004).
// Money is integer cents and always positive; the kind gives the direction.
// Dates are YYYY-MM-DD, months YYYY-MM, rates integer basis points (12.5 % = 1250).
// "A movement's kind matches its category's kind" needs the category, so the
// database enforces it (composite foreign key); see docs/data-model.md.

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }, 'Not a real calendar date');

export const isoMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');

export const cents = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const text = z.string().trim().min(1);
const optionalNotes = z.string().trim().min(1).nullish();

export const kindSchema = z.enum(KINDS);

export const categoryCreateSchema = z.strictObject({
  name: text,
  kind: kindSchema,
});

export const movementCreateSchema = z
  .strictObject({
    date: isoDate,
    kind: kindSchema,
    categoryId: z.number().int().positive(),
    concept: text,
    amountCents: cents,
    notes: optionalNotes,
    debtId: z.number().int().positive().nullish(),
  })
  .refine((m) => m.debtId == null || m.kind === 'repayment', {
    path: ['debtId'],
    error: 'debtId is only allowed on repayment movements',
  });

export const budgetLineCreateSchema = z.strictObject({
  categoryId: z.number().int().positive(),
  amountCents: cents,
  validFrom: isoMonth,
});

export const debtCreateSchema = z.strictObject({
  name: text,
  monthlyPaymentCents: cents,
  balanceCents: z.number().int().nonnegative(),
  balanceAsOf: isoDate,
  remainingInstallments: z.number().int().nonnegative(),
  annualRateBps: z.number().int().nonnegative(),
  notes: optionalNotes,
});

export const goalCreateSchema = z.strictObject({
  name: text,
  targetAmountCents: cents,
  targetDate: isoDate,
});

export const milestoneCreateSchema = z.strictObject({
  title: text,
  targetDate: isoDate,
  status: z.enum(MILESTONE_STATUSES).default('pending'),
  notes: optionalNotes,
});

export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type MovementCreate = z.infer<typeof movementCreateSchema>;
export type BudgetLineCreate = z.infer<typeof budgetLineCreateSchema>;
export type DebtCreate = z.infer<typeof debtCreateSchema>;
export type GoalCreate = z.infer<typeof goalCreateSchema>;
export type MilestoneCreate = z.infer<typeof milestoneCreateSchema>;
