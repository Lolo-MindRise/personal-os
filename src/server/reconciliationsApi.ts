import { and, asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  accountBalanceAt,
  inReconcilePeriod,
  type BalanceMovement,
  type BalanceTransfer,
} from '../shared/accountBalance.js';
import type {
  AccountDto,
  ReconcileMovementDto,
  ReconciliationDto,
  ReconciliationPreviewDto,
  TransferDto,
} from '../shared/api.js';
import { isoDate, reconciliationCreateSchema } from '../shared/schemas.js';
import {
  badRequest,
  fieldErrors,
  MESSAGES as COMMON_MESSAGES,
  notFound,
  parseId,
} from './apiCommon.js';
import type { Db } from './db/index.js';
import { liveMovements, liveTransfers } from './db/live.js';
import { accounts, movements, reconciliations, transfers } from './db/schema.js';

// Reconciliation (plan 0003, task 06): compare an account with the bank at a date and keep a
// record. It NEVER creates or edits a movement: differences are fixed by the user.

const MESSAGES = {
  ...COMMON_MESSAGES,
  notFound: 'No se ha encontrado la cuenta.',
} as const;

const columns = {
  id: reconciliations.id,
  accountId: reconciliations.accountId,
  date: reconciliations.date,
  bankBalanceCents: reconciliations.bankBalanceCents,
  appBalanceCents: reconciliations.appBalanceCents,
  differenceCents: reconciliations.differenceCents,
  createdAt: reconciliations.createdAt,
};

function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d ?? ''}/${m ?? ''}/${y ?? ''}`;
}

/** A date before the account's opening date has no defined balance: refused with this message. */
export function reconcileDateError(
  account: Pick<AccountDto, 'name' | 'openingBalanceDate'>,
  date: string,
): string | undefined {
  return date < account.openingBalanceDate
    ? `La fecha no puede ser anterior a la fecha del saldo inicial de la cuenta «${account.name}» (${dateLabel(account.openingBalanceDate)}).`
    : undefined;
}

function lastReconciliation(db: Db, accountId: number): ReconciliationDto | undefined {
  return db
    .select(columns)
    .from(reconciliations)
    .where(eq(reconciliations.accountId, accountId))
    .orderBy(desc(reconciliations.date), desc(reconciliations.id))
    .limit(1)
    .get();
}

/** Everything the screen shows about an account at a date (nothing is written). */
export function reconciliationPreview(
  db: Db,
  account: AccountDto,
  date: string,
): ReconciliationPreviewDto {
  const moves: (BalanceMovement & ReconcileMovementDto)[] = db
    .select({
      id: movements.id,
      accountId: movements.accountId,
      date: movements.date,
      kind: movements.kind,
      concept: movements.concept,
      amountCents: movements.amountCents,
    })
    .from(movements)
    .where(and(liveMovements(), eq(movements.accountId, account.id)))
    .orderBy(asc(movements.date), asc(movements.id))
    .all();
  const moved: (BalanceTransfer & TransferDto)[] = db
    .select({
      id: transfers.id,
      date: transfers.date,
      amountCents: transfers.amountCents,
      fromAccountId: transfers.fromAccountId,
      toAccountId: transfers.toAccountId,
      notes: transfers.notes,
    })
    .from(transfers)
    .where(liveTransfers())
    .orderBy(asc(transfers.date), asc(transfers.id))
    .all()
    .filter((t) => t.fromAccountId === account.id || t.toAccountId === account.id);

  const last = lastReconciliation(db, account.id);
  const since = (rowDate: string) =>
    inReconcilePeriod(rowDate, account.openingBalanceDate, last?.date, date);
  return {
    accountId: account.id,
    date,
    appBalanceCents: accountBalanceAt(account, moves, moved, date),
    last: last ?? null,
    movements: moves
      .filter((m) => since(m.date))
      .map((m) => ({
        id: m.id,
        date: m.date,
        kind: m.kind,
        concept: m.concept,
        amountCents: m.amountCents,
      })),
    transfers: moved.filter((t) => since(t.date)),
  };
}

export function registerReconciliationsApi(app: FastifyInstance, db: Db): void {
  const load = (raw: string): AccountDto | undefined => {
    const id = parseId(raw);
    return id === undefined
      ? undefined
      : db
          .select({
            id: accounts.id,
            name: accounts.name,
            type: accounts.type,
            openingBalanceCents: accounts.openingBalanceCents,
            openingBalanceDate: accounts.openingBalanceDate,
          })
          .from(accounts)
          .where(eq(accounts.id, id))
          .get();
  };

  // Every saved reconciliation, most recent first (the screen shows the last one per account).
  app.get('/api/reconciliations', () => {
    const rows: ReconciliationDto[] = db
      .select(columns)
      .from(reconciliations)
      .orderBy(desc(reconciliations.date), desc(reconciliations.id))
      .all();
    return rows;
  });

  app.get('/api/accounts/:id/reconciliation-preview', (request, reply) => {
    const account = load((request.params as { id: string }).id);
    if (account === undefined) {
      return notFound(reply, MESSAGES.notFound);
    }
    const parsed = isoDate.safeParse((request.query as { date?: unknown }).date);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, {
        date: parsed.error.issues[0]?.message ?? MESSAGES.invalid,
      });
    }
    const problem = reconcileDateError(account, parsed.data);
    if (problem !== undefined) {
      return badRequest(reply, problem, { date: problem });
    }
    return reconciliationPreview(db, account, parsed.data);
  });

  app.post('/api/accounts/:id/reconciliations', (request, reply) => {
    const account = load((request.params as { id: string }).id);
    if (account === undefined) {
      return notFound(reply, MESSAGES.notFound);
    }
    const parsed = reconciliationCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    const problem = reconcileDateError(account, parsed.data.date);
    if (problem !== undefined) {
      return badRequest(reply, problem, { date: problem });
    }
    const { appBalanceCents } = reconciliationPreview(db, account, parsed.data.date);
    const created = db
      .insert(reconciliations)
      .values({
        accountId: account.id,
        date: parsed.data.date,
        bankBalanceCents: parsed.data.bankBalanceCents,
        appBalanceCents,
        differenceCents: parsed.data.bankBalanceCents - appBalanceCents,
      })
      .returning(columns)
      .get();
    return reply.code(201).send(created);
  });
}
