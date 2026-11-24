import { asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { DebtDto, DebtRepaymentDto } from '../shared/api.js';
import { estimateDebt, repaidSince, type InstallmentInput } from '../shared/debts.js';
import { debtCreateSchema, debtUpdateSchema } from '../shared/schemas.js';
import {
  badRequest,
  fieldErrors,
  MESSAGES as COMMON_MESSAGES,
  notFound,
  parseId,
} from './apiCommon.js';
import type { Db } from './db/index.js';
import { debts, movements, recurringItems } from './db/schema.js';

const MESSAGES = {
  ...COMMON_MESSAGES,
  notFound: 'No se ha encontrado la deuda.',
  asOfRequired: 'Si cambias el saldo, indica la fecha a la que corresponde.',
  asOfBackwards: 'La fecha del saldo no puede ser anterior a la del saldo actual.',
} as const;

type DebtRow = typeof debts.$inferSelect;

/** Confirmed installments (movements of recurring items linked to the debt), by date. */
function installmentsOf(db: Db, debtId: number): InstallmentInput[] {
  return db
    .select({ movementId: movements.id, date: movements.date, amountCents: movements.amountCents })
    .from(movements)
    .innerJoin(recurringItems, eq(recurringItems.id, movements.recurringItemId))
    .where(eq(recurringItems.debtId, debtId))
    .orderBy(asc(movements.date), asc(movements.id))
    .all();
}

/**
 * Extra repayments: movements linked to the debt that are not installments (an installment
 * movement is never counted twice, even if it also carries the debt id).
 */
function repaymentsOf(db: Db, debtId: number, installmentIds: Set<number>): DebtRepaymentDto[] {
  return db
    .select({
      movementId: movements.id,
      date: movements.date,
      concept: movements.concept,
      amountCents: movements.amountCents,
    })
    .from(movements)
    .where(eq(movements.debtId, debtId))
    .orderBy(desc(movements.date), desc(movements.id))
    .all()
    .filter((r) => !installmentIds.has(r.movementId));
}

function toDto(db: Db, row: DebtRow): DebtDto {
  const installments = installmentsOf(db, row.id);
  const repayments = repaymentsOf(db, row.id, new Set(installments.map((i) => i.movementId)));
  const estimate = estimateDebt(
    row.balanceCents,
    row.balanceAsOf,
    row.annualRateBps,
    installments,
    repayments,
  );
  return {
    id: row.id,
    name: row.name,
    monthlyPaymentCents: row.monthlyPaymentCents,
    balanceCents: row.balanceCents,
    balanceAsOf: row.balanceAsOf,
    remainingInstallments: row.remainingInstallments,
    annualRateBps: row.annualRateBps,
    notes: row.notes,
    repayments,
    repaidSinceCents: repaidSince(row.balanceAsOf, repayments),
    estimatedBalanceCents: estimate.estimatedBalanceCents,
    principalPaidCents: estimate.principalPaidCents,
    interestPaidCents: estimate.interestPaidCents,
    installments: estimate.installments,
  };
}

export function listDebts(db: Db): DebtDto[] {
  return db
    .select()
    .from(debts)
    .orderBy(asc(debts.name), asc(debts.id))
    .all()
    .map((row) => toDto(db, row));
}

export function registerDebtsApi(app: FastifyInstance, db: Db): void {
  app.get('/api/debts', () => listDebts(db));

  app.post('/api/debts', (request, reply) => {
    const parsed = debtCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    const created = db.insert(debts).values(parsed.data).returning().get();
    return reply.code(201).send(toDto(db, created));
  });

  app.patch('/api/debts/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    const current =
      id === undefined ? undefined : db.select().from(debts).where(eq(debts.id, id)).get();
    if (id === undefined || current === undefined) {
      return notFound(reply, MESSAGES.notFound);
    }
    const patch = debtUpdateSchema.safeParse(request.body);
    if (!patch.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(patch.error));
    }
    // Updating the balance records a new as-of date: a changed balance needs its date, and the
    // date never moves back (the linked repayments counted from the old date would be wrong).
    const { balanceCents, balanceAsOf } = patch.data;
    if (
      balanceCents !== undefined &&
      balanceCents !== current.balanceCents &&
      balanceAsOf === undefined
    ) {
      return badRequest(reply, MESSAGES.asOfRequired, { balanceAsOf: MESSAGES.asOfRequired });
    }
    if (balanceAsOf !== undefined && balanceAsOf < current.balanceAsOf) {
      return badRequest(reply, MESSAGES.asOfBackwards, { balanceAsOf: MESSAGES.asOfBackwards });
    }
    const merged = debtCreateSchema.safeParse({
      name: current.name,
      monthlyPaymentCents: current.monthlyPaymentCents,
      balanceCents: current.balanceCents,
      balanceAsOf: current.balanceAsOf,
      remainingInstallments: current.remainingInstallments,
      annualRateBps: current.annualRateBps,
      notes: current.notes,
      ...patch.data,
    });
    if (!merged.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(merged.error));
    }
    db.update(debts)
      .set({ ...merged.data, notes: merged.data.notes ?? null })
      .where(eq(debts.id, id))
      .run();
    const updated = db.select().from(debts).where(eq(debts.id, id)).get();
    return updated === undefined ? notFound(reply, MESSAGES.notFound) : toDto(db, updated);
  });
}
