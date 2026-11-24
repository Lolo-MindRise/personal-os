import { sql, type AnyColumn } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';
import { KINDS, MILESTONE_STATUSES } from '../../shared/constants.js';

// Conventions (ADR-0002, docs/data-model.md):
// - Money: integer cents, always positive. The kind gives the direction.
// - Dates: YYYY-MM-DD. Months: YYYY-MM. Rates: integer basis points.
// - Timestamps: ISO 8601 UTC text.

const kindList = sql.raw(KINDS.map((k) => `'${k}'`).join(', '));
const statusList = sql.raw(MILESTONE_STATUSES.map((s) => `'${s}'`).join(', '));

const DATE_GLOB = sql.raw("'[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'");
const MONTH_GLOB = sql.raw("'[0-9][0-9][0-9][0-9]-[0-1][0-9]'");

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const isInteger = (column: AnyColumn) => sql`typeof(${column}) = 'integer'`;
const nowISO = () => new Date().toISOString();

const id = () => integer('id').primaryKey({ autoIncrement: true });
const createdAt = () => text('created_at').notNull().default(now);
const updatedAt = () => text('updated_at').notNull().default(now).$onUpdate(nowISO);

export const categories = sqliteTable(
  'categories',
  {
    id: id(),
    name: text('name').notNull().unique(),
    kind: text('kind', { enum: KINDS }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Target of the composite foreign key that ties a movement's kind to its category's kind.
    unique('categories_id_kind_unique').on(t.id, t.kind),
    check('categories_name_not_empty', sql`length(trim(${t.name})) > 0`),
    check('categories_kind_valid', sql`${t.kind} IN (${kindList})`),
  ],
);

export const debts = sqliteTable(
  'debts',
  {
    id: id(),
    name: text('name').notNull(),
    monthlyPaymentCents: integer('monthly_payment_cents').notNull(),
    balanceCents: integer('balance_cents').notNull(),
    balanceAsOf: text('balance_as_of').notNull(),
    remainingInstallments: integer('remaining_installments').notNull(),
    annualRateBps: integer('annual_rate_bps').notNull(),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('debts_name_not_empty', sql`length(trim(${t.name})) > 0`),
    check('debts_monthly_payment_integer', isInteger(t.monthlyPaymentCents)),
    check('debts_balance_integer', isInteger(t.balanceCents)),
    check('debts_installments_integer', isInteger(t.remainingInstallments)),
    check('debts_rate_integer', isInteger(t.annualRateBps)),
    check('debts_monthly_payment_positive', sql`${t.monthlyPaymentCents} > 0`),
    check('debts_balance_not_negative', sql`${t.balanceCents} >= 0`),
    check('debts_balance_as_of_date', sql`${t.balanceAsOf} GLOB ${DATE_GLOB}`),
    check('debts_installments_not_negative', sql`${t.remainingInstallments} >= 0`),
    check('debts_rate_not_negative', sql`${t.annualRateBps} >= 0`),
  ],
);

export const movements = sqliteTable(
  'movements',
  {
    id: id(),
    date: text('date').notNull(),
    kind: text('kind', { enum: KINDS }).notNull(),
    categoryId: integer('category_id').notNull(),
    concept: text('concept').notNull(),
    amountCents: integer('amount_cents').notNull(),
    notes: text('notes'),
    debtId: integer('debt_id').references(() => debts.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // A movement's kind must match its category's kind.
    foreignKey({
      columns: [t.categoryId, t.kind],
      foreignColumns: [categories.id, categories.kind],
      name: 'movements_category_kind_fk',
    }),
    check('movements_kind_valid', sql`${t.kind} IN (${kindList})`),
    check('movements_date_format', sql`${t.date} GLOB ${DATE_GLOB}`),
    check('movements_amount_integer', isInteger(t.amountCents)),
    check('movements_amount_positive', sql`${t.amountCents} > 0`),
    check('movements_concept_not_empty', sql`length(trim(${t.concept})) > 0`),
    // debt_id is only allowed on repayment movements.
    check('movements_debt_only_on_repayment', sql`${t.debtId} IS NULL OR ${t.kind} = 'repayment'`),
    index('movements_date_idx').on(t.date),
    index('movements_category_idx').on(t.categoryId),
  ],
);

export const budgetLines = sqliteTable(
  'budget_lines',
  {
    id: id(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    amountCents: integer('amount_cents').notNull(),
    validFrom: text('valid_from').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // History is append-only: one line per category and month, new lines supersede old ones.
    unique('budget_lines_category_valid_from_unique').on(t.categoryId, t.validFrom),
    check('budget_lines_amount_integer', isInteger(t.amountCents)),
    check('budget_lines_amount_positive', sql`${t.amountCents} > 0`),
    check('budget_lines_valid_from_month', sql`${t.validFrom} GLOB ${MONTH_GLOB}`),
  ],
);

export const goals = sqliteTable(
  'goals',
  {
    id: id(),
    name: text('name').notNull(),
    targetAmountCents: integer('target_amount_cents').notNull(),
    targetDate: text('target_date').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('goals_name_not_empty', sql`length(trim(${t.name})) > 0`),
    check('goals_target_amount_integer', isInteger(t.targetAmountCents)),
    check('goals_target_amount_positive', sql`${t.targetAmountCents} > 0`),
    check('goals_target_date_format', sql`${t.targetDate} GLOB ${DATE_GLOB}`),
  ],
);

export const milestones = sqliteTable(
  'milestones',
  {
    id: id(),
    title: text('title').notNull(),
    targetDate: text('target_date').notNull(),
    status: text('status', { enum: MILESTONE_STATUSES }).notNull().default('pending'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('milestones_status_valid', sql`${t.status} IN (${statusList})`),
    check('milestones_title_not_empty', sql`length(trim(${t.title})) > 0`),
    check('milestones_target_date_format', sql`${t.targetDate} GLOB ${DATE_GLOB}`),
  ],
);
