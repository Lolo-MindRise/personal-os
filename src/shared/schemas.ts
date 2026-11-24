import { z } from 'zod';
import { KINDS, MILESTONE_STATUSES } from './constants.js';

// Messages reach the UI, which is in Spanish (es-ES): Zod's Spanish locale covers the defaults.
z.config(z.locales.es());

// Creation schemas shared by the API and the frontend (task 0004).
// Money is integer cents and always positive; the kind gives the direction.
// Dates are YYYY-MM-DD, months YYYY-MM, rates integer basis points (12.5 % = 1250).
// "A movement's kind matches its category's kind" needs the category, so the
// database enforces it (composite foreign key); see docs/data-model.md.

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato AAAA-MM-DD.')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }, 'La fecha no existe en el calendario.');

export const isoMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'El mes debe tener el formato AAAA-MM.');

export const cents = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const text = z.string().trim().min(1);
const optionalNotes = z.string().trim().min(1).nullish();

export const kindSchema = z.enum(KINDS);

export const categoryCreateSchema = z.strictObject({
  name: text,
  kind: kindSchema,
});

/** Renaming a category: the kind is fixed once movements may depend on it. */
export const categoryUpdateSchema = z.strictObject({
  name: text,
});

/** Base object of a movement, without the cross-field rule (so it can be made partial). */
export const movementFieldsSchema = z.strictObject({
  date: isoDate,
  kind: kindSchema,
  categoryId: z.number().int().positive(),
  concept: text,
  amountCents: cents,
  notes: optionalNotes,
  debtId: z.number().int().positive().nullish(),
});

export const movementCreateSchema = movementFieldsSchema.refine(
  (m) => m.debtId == null || m.kind === 'repayment',
  {
    path: ['debtId'],
    error: 'Solo las amortizaciones pueden estar vinculadas a una deuda.',
  },
);

/** PATCH body: any subset of the fields. The merged result is re-validated with movementCreateSchema. */
export const movementUpdateSchema = movementFieldsSchema.partial();

/** Base object of a recurring item (ADR-0005), without the cross-field rule. */
export const recurringItemFieldsSchema = z.strictObject({
  kind: kindSchema,
  categoryId: z.number().int().positive(),
  concept: text,
  amountCents: cents,
  expectedDay: z.number().int().min(1).max(31),
  startMonth: isoMonth,
  endMonth: isoMonth.nullish(),
  notes: optionalNotes,
  /** The debt whose installments this item pays (task 0013); only for repayments. */
  debtId: z.number().int().positive().nullish(),
});

export const recurringItemCreateSchema = recurringItemFieldsSchema
  .refine((item) => item.endMonth == null || item.endMonth >= item.startMonth, {
    path: ['endMonth'],
    error: 'El mes final no puede ser anterior al mes inicial.',
  })
  .refine((item) => item.debtId == null || item.kind === 'repayment', {
    path: ['debtId'],
    error: 'Solo las amortizaciones pueden estar vinculadas a una deuda.',
  });

/** PATCH body: any subset. The merged result is re-validated with recurringItemCreateSchema. */
export const recurringItemUpdateSchema = recurringItemFieldsSchema.partial();

/** Optional overrides when confirming a pending entry. Kind and category are not overridable. */
export const confirmOverridesSchema = z.strictObject({
  date: isoDate.optional(),
  amountCents: cents.optional(),
  concept: text.optional(),
  notes: optionalNotes,
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
  remainingInstallments: z.number().int().nonnegative().max(9_999),
  // 0 to 100 %, as the form allows.
  annualRateBps: z.number().int().nonnegative().max(10_000),
  notes: optionalNotes,
});

/** PATCH body: any subset. The API re-checks the balance and its as-of date together. */
export const debtUpdateSchema = debtCreateSchema.partial();

export const goalCreateSchema = z.strictObject({
  name: text,
  targetAmountCents: cents,
  targetDate: isoDate,
});

/** PATCH body: any subset of the goal's fields. */
export const goalUpdateSchema = goalCreateSchema.partial();

/** The initial savings balance and the date it is valid on; replaces any previous value. */
export const settingsSchema = z.strictObject({
  initialSavingsCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  initialSavingsDate: isoDate,
});

export const categoryRuleCreateSchema = z.strictObject({
  pattern: z.string().trim().min(1).max(100),
  categoryId: z.number().int().positive(),
});

const columnIndex = z.number().int().min(0).max(200);

/** The remembered CSV column mapping (task 0013, block 2). */
export const importMappingSchema = z.strictObject({
  hasHeader: z.boolean(),
  dateColumn: columnIndex,
  conceptColumn: columnIndex,
  amountMode: z.enum(['signed', 'split']),
  amountColumn: columnIndex.nullable(),
  debitColumn: columnIndex.nullable(),
  creditColumn: columnIndex.nullable(),
});

/** Largest import the API accepts in one request. */
export const MAX_IMPORT_ROWS = 5_000;

const signedCents = z
  .number()
  .int()
  .refine(
    (n) => n !== 0 && Math.abs(n) <= Number.MAX_SAFE_INTEGER,
    'El importe no puede ser cero.',
  );

export const importPreviewSchema = z.strictObject({
  rows: z
    .array(z.strictObject({ date: isoDate, concept: text, amountCents: signedCents }))
    .max(MAX_IMPORT_ROWS),
});

/** The checked rows of the preview: each becomes a movement, or confirms a pending fixed item. */
export const importCommitSchema = z.strictObject({
  rows: z
    .array(
      z.strictObject({
        date: isoDate,
        concept: text,
        amountCents: cents,
        kind: kindSchema,
        categoryId: z.number().int().positive(),
        recurringItemId: z.number().int().positive().nullish(),
      }),
    )
    .min(1)
    .max(MAX_IMPORT_ROWS),
});

/** Page sizes of the movement search (task 0013, block 3). */
export const SEARCH_DEFAULT_PAGE_SIZE = 50;
export const SEARCH_MAX_PAGE_SIZE = 200;

/** Query strings send empty fields as ''; treat them as "not given". */
const queryOptional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const queryInt = (min: number, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce.number().int().min(min).max(max);

/**
 * Filters of `GET /api/movements/search`, across all months. Amounts are stored cents (always
 * positive), so the range compares absolute amounts. Text matches concept or notes ignoring case
 * and accents.
 */
export const movementSearchSchema = z
  .strictObject({
    q: queryOptional(z.string().trim().max(100)),
    categoryId: queryOptional(queryInt(1)),
    kind: queryOptional(kindSchema),
    from: queryOptional(isoDate),
    to: queryOptional(isoDate),
    minAmountCents: queryOptional(queryInt(0)),
    maxAmountCents: queryOptional(queryInt(0)),
    page: queryOptional(queryInt(1)),
    pageSize: queryOptional(queryInt(1, SEARCH_MAX_PAGE_SIZE)),
  })
  .refine((f) => f.from === undefined || f.to === undefined || f.from <= f.to, {
    path: ['to'],
    error: 'La fecha final no puede ser anterior a la inicial.',
  })
  .refine(
    (f) =>
      f.minAmountCents === undefined ||
      f.maxAmountCents === undefined ||
      f.minAmountCents <= f.maxAmountCents,
    { path: ['maxAmountCents'], error: 'El importe máximo no puede ser menor que el mínimo.' },
  );

export type MovementSearch = z.infer<typeof movementSearchSchema>;

/** `GET /api/projection`: the end month (default: 11 months after today's) and, for tests, today. */
export const projectionQuerySchema = z.strictObject({
  to: queryOptional(isoMonth),
  today: queryOptional(isoDate),
});

export const milestoneCreateSchema = z.strictObject({
  title: text,
  targetDate: isoDate,
  status: z.enum(MILESTONE_STATUSES).default('pending'),
  notes: optionalNotes,
});

/** PATCH body: any subset of the milestone's fields (status has no default here). */
export const milestoneUpdateSchema = z.strictObject({
  title: text.optional(),
  targetDate: isoDate.optional(),
  status: z.enum(MILESTONE_STATUSES).optional(),
  notes: optionalNotes,
});

export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
export type MovementUpdate = z.infer<typeof movementUpdateSchema>;
export type MovementCreate = z.infer<typeof movementCreateSchema>;
export type RecurringItemCreate = z.infer<typeof recurringItemCreateSchema>;
export type RecurringItemUpdate = z.infer<typeof recurringItemUpdateSchema>;
export type ConfirmOverrides = z.infer<typeof confirmOverridesSchema>;
export type BudgetLineCreate = z.infer<typeof budgetLineCreateSchema>;
export type DebtCreate = z.infer<typeof debtCreateSchema>;
export type DebtUpdate = z.infer<typeof debtUpdateSchema>;
export type GoalCreate = z.infer<typeof goalCreateSchema>;
export type GoalUpdate = z.infer<typeof goalUpdateSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type MilestoneCreate = z.infer<typeof milestoneCreateSchema>;
export type MilestoneUpdate = z.infer<typeof milestoneUpdateSchema>;
