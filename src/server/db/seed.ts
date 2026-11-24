import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  budgetLineCreateSchema,
  categoryCreateSchema,
  debtCreateSchema,
  goalCreateSchema,
  milestoneCreateSchema,
  movementCreateSchema,
} from '../../shared/schemas.js';
import { openDatabaseFromEnv, type Db } from './index.js';
import { budgetLines, categories, debts, goals, milestones, movements } from './schema.js';

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
    const loanRepayment = cat('Amortización extra', 'repayment');

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
    for (const row of rows) {
      tx.insert(movements).values(movementCreateSchema.parse(row)).run();
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
