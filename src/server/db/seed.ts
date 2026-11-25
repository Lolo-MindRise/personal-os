import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  accountCreateSchema,
  budgetLineCreateSchema,
  categoryCreateSchema,
  debtCreateSchema,
  goalCreateSchema,
  milestoneCreateSchema,
  movementCreateSchema,
  recurringItemCreateSchema,
} from '../../shared/schemas.js';
import { openDatabaseFromEnv, type Db } from './index.js';
import {
  accounts,
  budgetLines,
  categories,
  debts,
  goals,
  milestones,
  movements,
  recurringItems,
} from './schema.js';

/**
 * Development seed: one INVENTED month. Nothing here comes from real figures
 * (the repository is public). Amounts are integer cents.
 */
export function seed(db: Db): void {
  db.transaction((tx) => {
    const cat = (name: string, kind: 'income' | 'expense' | 'repayment') => {
      const input = categoryCreateSchema.parse({ name, kind });
      return tx.insert(categories).values(input).returning().get().id;
    };
    const salary = cat('Nómina ficticia', 'income');
    const housing = cat('Vivienda', 'expense');
    const groceries = cat('Supermercado', 'expense');
    const leisure = cat('Ocio', 'expense');
    const utilities = cat('Suministros', 'expense');
    const loanRepayment = cat('Amortización extra', 'repayment');

    // "Principal" already exists (created by the migration); one more account for variety.
    const cashId = tx
      .insert(accounts)
      .values(
        accountCreateSchema.parse({
          name: 'Efectivo',
          type: 'cash',
          openingBalanceCents: 5_000,
          openingBalanceDate: '2026-01-01',
        }),
      )
      .returning()
      .get().id;

    const debtId = tx
      .insert(debts)
      .values(
        debtCreateSchema.parse({
          name: 'Préstamo personal de ejemplo',
          monthlyPaymentCents: 15_000,
          balanceCents: 300_000,
          balanceAsOf: '2026-01-31',
          remainingInstallments: 20,
          annualRateBps: 650,
          notes: 'Datos inventados para desarrollo.',
        }),
      )
      .returning()
      .get().id;

    // Fictional fixed items (ADR-0005), all starting in January 2026 with no end month.
    const item = (
      kind: 'income' | 'expense' | 'repayment',
      categoryId: number,
      concept: string,
      amountCents: number,
      expectedDay: number,
    ) =>
      tx
        .insert(recurringItems)
        .values(
          recurringItemCreateSchema.parse({
            kind,
            categoryId,
            concept,
            amountCents,
            expectedDay,
            startMonth: '2026-01',
          }),
        )
        .returning()
        .get().id;
    const salaryItem = item('income', salary, 'Nómina', 200_000, 1);
    const rentItem = item('expense', housing, 'Alquiler', 70_000, 2);
    item('expense', utilities, 'Internet', 3_500, 10);
    item('expense', utilities, 'Electricidad', 6_500, 12);
    item('expense', leisure, 'Gimnasio', 3_000, 15);

    const rows = [
      {
        date: '2026-01-01',
        kind: 'income',
        categoryId: salary,
        concept: 'Nómina',
        amountCents: 200_000,
      },
      {
        date: '2026-01-02',
        kind: 'expense',
        categoryId: housing,
        concept: 'Alquiler',
        amountCents: 70_000,
      },
      {
        date: '2026-01-10',
        kind: 'expense',
        categoryId: groceries,
        concept: 'Compra semanal',
        amountCents: 8_550,
      },
      {
        date: '2026-01-17',
        kind: 'expense',
        categoryId: groceries,
        concept: 'Compra semanal',
        amountCents: 9_120,
      },
      {
        date: '2026-01-20',
        kind: 'expense',
        categoryId: leisure,
        concept: 'Cine',
        amountCents: 2_400,
        notes: 'Entradas para dos',
        accountId: cashId,
      },
      {
        date: '2026-01-25',
        kind: 'repayment',
        categoryId: loanRepayment,
        concept: 'Amortización extra',
        amountCents: 10_000,
        debtId,
      },
    ] as const;
    // January's salary and rent are the confirmations of the matching recurring items;
    // the other fixed items are still pending in January and in every later month.
    const confirmed: Record<string, number> = { Nómina: salaryItem, Alquiler: rentItem };
    for (const row of rows) {
      tx.insert(movements)
        .values({
          ...movementCreateSchema.parse(row),
          recurringItemId: confirmed[row.concept] ?? null,
        })
        .run();
    }

    for (const [categoryId, amountCents] of [
      [housing, 70_000],
      [groceries, 35_000],
      [leisure, 10_000],
    ] as const) {
      tx.insert(budgetLines)
        .values(budgetLineCreateSchema.parse({ categoryId, amountCents, validFrom: '2026-01' }))
        .run();
    }

    tx.insert(goals)
      .values(
        goalCreateSchema.parse({
          name: 'Fondo de emergencia',
          targetAmountCents: 600_000,
          targetDate: '2026-12-31',
        }),
      )
      .run();

    for (const milestone of [
      { title: 'Revisar el presupuesto', targetDate: '2026-02-15', status: 'done' },
      {
        title: 'Liquidar el préstamo',
        targetDate: '2027-09-30',
        status: 'in_progress',
        notes: 'Fecha de ejemplo.',
      },
    ]) {
      tx.insert(milestones).values(milestoneCreateSchema.parse(milestone)).run();
    }
  });
}

// `npm run db:seed`: development only, never against the real data directory.
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The seed is for development only; refusing to run in production.');
  }
  const handle = openDatabaseFromEnv(process.env);
  try {
    seed(handle.db);
    console.log('Seed data inserted into the development database.');
  } finally {
    handle.close();
  }
}
