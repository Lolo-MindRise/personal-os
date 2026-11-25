import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { TransferDto } from '../shared/api.js';
import { transferDateError } from '../shared/accountBalance.js';
import { transferCreateSchema, transferUpdateSchema } from '../shared/schemas.js';
import {
  badRequest,
  fieldErrors,
  MESSAGES as COMMON_MESSAGES,
  notFound,
  parseId,
} from './apiCommon.js';
import type { Db } from './db/index.js';
import { accounts, transfers } from './db/schema.js';

const MESSAGES = {
  ...COMMON_MESSAGES,
  notFound: 'No se ha encontrado la transferencia.',
  same: 'La cuenta de origen y la de destino deben ser distintas.',
} as const;

const columns = {
  id: transfers.id,
  date: transfers.date,
  amountCents: transfers.amountCents,
  fromAccountId: transfers.fromAccountId,
  toAccountId: transfers.toAccountId,
  notes: transfers.notes,
};

export function getTransfer(db: Db, id: number): TransferDto | undefined {
  return db.select(columns).from(transfers).where(eq(transfers.id, id)).get();
}

export function listTransfers(db: Db): TransferDto[] {
  return db.select(columns).from(transfers).orderBy(desc(transfers.date), desc(transfers.id)).all();
}

/** Both accounts must exist and the date must be after both opening dates. */
function checkTransfer(
  db: Db,
  from: number,
  to: number,
  date: string,
): { error: string; field: string } | undefined {
  const load = (id: number) => db.select().from(accounts).where(eq(accounts.id, id)).get();
  const origin = load(from);
  if (origin === undefined) {
    return { error: 'La cuenta no existe.', field: 'fromAccountId' };
  }
  const destination = load(to);
  if (destination === undefined) {
    return { error: 'La cuenta no existe.', field: 'toAccountId' };
  }
  const error = transferDateError(date, [origin, destination]);
  return error === undefined ? undefined : { error, field: 'date' };
}

/** Transfers are never movements: they appear in no income, expense, budget or savings total. */
export function registerTransfersApi(app: FastifyInstance, db: Db): void {
  app.get('/api/transfers', () => listTransfers(db));

  app.post('/api/transfers', (request, reply) => {
    const parsed = transferCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    const problem = checkTransfer(
      db,
      parsed.data.fromAccountId,
      parsed.data.toAccountId,
      parsed.data.date,
    );
    if (problem !== undefined) {
      return badRequest(reply, problem.error, { [problem.field]: problem.error });
    }
    const created = db.insert(transfers).values(parsed.data).returning({ id: transfers.id }).get();
    return reply.code(201).send(getTransfer(db, created.id));
  });

  app.patch('/api/transfers/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    const current = id === undefined ? undefined : getTransfer(db, id);
    if (id === undefined || current === undefined) {
      return notFound(reply, MESSAGES.notFound);
    }
    const parsed = transferUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    const from = parsed.data.fromAccountId ?? current.fromAccountId;
    const to = parsed.data.toAccountId ?? current.toAccountId;
    if (from === to) {
      return badRequest(reply, MESSAGES.same, { toAccountId: MESSAGES.same });
    }
    const problem = checkTransfer(db, from, to, parsed.data.date ?? current.date);
    if (problem !== undefined) {
      return badRequest(reply, problem.error, { [problem.field]: problem.error });
    }
    if (Object.keys(parsed.data).length > 0) {
      db.update(transfers).set(parsed.data).where(eq(transfers.id, id)).run();
    }
    return getTransfer(db, id);
  });

  app.delete('/api/transfers/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (id === undefined || getTransfer(db, id) === undefined) {
      return notFound(reply, MESSAGES.notFound);
    }
    db.delete(transfers).where(eq(transfers.id, id)).run();
    return reply.code(204).send();
  });
}
