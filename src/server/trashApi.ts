import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type {
  MovementDto,
  TrashDto,
  TrashedMovementDto,
  TrashedTransferDto,
} from '../shared/api.js';
import { monthOf } from '../shared/recurring.js';
import {
  accountError,
  categoryError,
  conflict,
  getMovement,
  movementColumns,
  notFound,
  parseId,
  withTags,
  type MovementRow,
} from './apiCommon.js';
import type { Db } from './db/index.js';
import { trashedMovements, trashedTransfers } from './db/live.js';
import { categories, debts, movements, recurringSkips, transfers } from './db/schema.js';
import { checkTransfer, getTransfer } from './transfersApi.js';

// The trash (plan 0003, task 01): deleting a movement or a transfer only sets `deleted_at`
// (api.ts, transfersApi.ts). Here the trash is listed, a row is restored, or deleted for good, one
// at a time. Nothing is ever removed automatically.

const MESSAGES = {
  movementNotFound: 'No se ha encontrado el movimiento en la papelera.',
  transferNotFound: 'No se ha encontrado la transferencia en la papelera.',
  noDebt: 'No se puede restaurar: la deuda ya no existe.',
  skipped:
    'No se puede restaurar: ese fijo está saltado en el mes. Deshaz el salto o borra definitivamente este.',
} as const;

/** "No se puede restaurar: la categoría no existe." from the message of the ordinary check. */
const restoreRefused = (problem: string): string =>
  `No se puede restaurar: ${problem.charAt(0).toLowerCase()}${problem.slice(1)}`;

const transferColumns = {
  id: transfers.id,
  date: transfers.date,
  amountCents: transfers.amountCents,
  fromAccountId: transfers.fromAccountId,
  toAccountId: transfers.toAccountId,
  notes: transfers.notes,
  deletedAt: transfers.deletedAt,
};

/** Why a trashed movement cannot come back right now, or undefined when it can. */
function movementRestoreProblem(
  db: Db,
  m: typeof movements.$inferSelect,
): { error: string } | undefined {
  const problem = categoryError(db, m.kind, m.categoryId) ?? accountError(db, m.accountId);
  if (problem !== undefined) {
    return { error: restoreRefused(problem.error) };
  }
  if (
    m.debtId !== null &&
    db.select({ id: debts.id }).from(debts).where(eq(debts.id, m.debtId)).get() === undefined
  ) {
    return { error: MESSAGES.noDebt };
  }
  if (m.recurringItemId !== null) {
    // No live movement can hold the slot (the unique index is not partial and the confirm paths
    // refuse while this one is trashed), so only a skip can block the restore.
    const skipped = db
      .select({ id: recurringSkips.id })
      .from(recurringSkips)
      .where(
        and(
          eq(recurringSkips.recurringItemId, m.recurringItemId),
          eq(recurringSkips.month, monthOf(m.date)),
        ),
      )
      .get();
    if (skipped !== undefined) {
      return { error: MESSAGES.skipped };
    }
  }
  return undefined;
}

export function listTrash(db: Db): TrashDto {
  const movementRows = db
    .select({ ...movementColumns, deletedAt: movements.deletedAt })
    .from(movements)
    .innerJoin(categories, eq(categories.id, movements.categoryId))
    .where(trashedMovements())
    .orderBy(desc(movements.deletedAt), desc(movements.id))
    .all();
  const trashedMovementDtos: TrashedMovementDto[] = withTags(
    db,
    movementRows as unknown as MovementRow[],
  ).map((m, i) => ({ ...m, deletedAt: movementRows[i]?.deletedAt ?? '' }));
  const trashedTransferDtos: TrashedTransferDto[] = db
    .select(transferColumns)
    .from(transfers)
    .where(trashedTransfers())
    .orderBy(desc(transfers.deletedAt), desc(transfers.id))
    .all()
    .map((t) => ({ ...t, deletedAt: t.deletedAt ?? '' }));
  return { movements: trashedMovementDtos, transfers: trashedTransferDtos };
}

export function registerTrashApi(app: FastifyInstance, db: Db): void {
  app.get('/api/trash', () => listTrash(db));

  app.post('/api/trash/movements/:id/restore', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    const row =
      id === undefined
        ? undefined
        : db
            .select()
            .from(movements)
            .where(and(trashedMovements(), eq(movements.id, id)))
            .get();
    if (id === undefined || row === undefined) {
      return notFound(reply, MESSAGES.movementNotFound);
    }
    // All checks first, then one update: a restore is never half done.
    const problem = movementRestoreProblem(db, row);
    if (problem !== undefined) {
      return conflict(reply, problem.error);
    }
    db.update(movements)
      .set({ deletedAt: null })
      .where(and(trashedMovements(), eq(movements.id, id)))
      .run();
    const restored: MovementDto | undefined = getMovement(db, id);
    return restored;
  });

  app.post('/api/trash/transfers/:id/restore', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    const row =
      id === undefined
        ? undefined
        : db
            .select()
            .from(transfers)
            .where(and(trashedTransfers(), eq(transfers.id, id)))
            .get();
    if (id === undefined || row === undefined) {
      return notFound(reply, MESSAGES.transferNotFound);
    }
    const problem = checkTransfer(db, row.fromAccountId, row.toAccountId, row.date);
    if (problem !== undefined) {
      return conflict(reply, restoreRefused(problem.error));
    }
    db.update(transfers)
      .set({ deletedAt: null })
      .where(and(trashedTransfers(), eq(transfers.id, id)))
      .run();
    return getTransfer(db, id);
  });

  // Permanent deletion: one row at a time, and only rows already in the trash.
  app.delete('/api/trash/movements/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    const removed =
      id === undefined
        ? []
        : db
            .delete(movements)
            .where(and(trashedMovements(), eq(movements.id, id)))
            .returning({ id: movements.id })
            .all();
    if (removed.length === 0) {
      return notFound(reply, MESSAGES.movementNotFound);
    }
    return reply.code(204).send();
  });

  app.delete('/api/trash/transfers/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    const removed =
      id === undefined
        ? []
        : db
            .delete(transfers)
            .where(and(trashedTransfers(), eq(transfers.id, id)))
            .returning({ id: transfers.id })
            .all();
    if (removed.length === 0) {
      return notFound(reply, MESSAGES.transferNotFound);
    }
    return reply.code(204).send();
  });
}
