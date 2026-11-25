import { asc, count, eq, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { accountBalance } from '../shared/accountBalance.js';
import type { AccountBalanceDto, AccountDto } from '../shared/api.js';
import { DEFAULT_ACCOUNT_ID } from '../shared/constants.js';
import { accountCreateSchema, accountUpdateSchema } from '../shared/schemas.js';
import {
  badRequest,
  conflict,
  fieldErrors,
  MESSAGES as COMMON_MESSAGES,
  notFound,
  parseId,
} from './apiCommon.js';
import type { Db } from './db/index.js';
import { accounts, movements, transfers } from './db/schema.js';
import { registerTransfersApi } from './transfersApi.js';

const MESSAGES = {
  ...COMMON_MESSAGES,
  notFound: 'No se ha encontrado la cuenta.',
  duplicate: 'Ya existe una cuenta con ese nombre.',
  inUse: 'La cuenta tiene movimientos o transferencias y no se puede eliminar.',
  isDefault: 'La cuenta Principal no se puede eliminar.',
} as const;

const columns = {
  id: accounts.id,
  name: accounts.name,
  type: accounts.type,
  openingBalanceCents: accounts.openingBalanceCents,
  openingBalanceDate: accounts.openingBalanceDate,
};

function getAccount(db: Db, id: number): AccountDto | undefined {
  return db.select(columns).from(accounts).where(eq(accounts.id, id)).get();
}

/** Names are unique ignoring case and surrounding spaces; `exceptId` skips the row being edited. */
function nameTaken(db: Db, name: string, exceptId?: number): boolean {
  const wanted = name.trim().toLowerCase();
  return db
    .select(columns)
    .from(accounts)
    .all()
    .some((a) => a.id !== exceptId && a.name.trim().toLowerCase() === wanted);
}

export function registerAccountsApi(app: FastifyInstance, db: Db): void {
  registerTransfersApi(app, db);

  app.get('/api/accounts/balances', () => {
    const all = db.select(columns).from(accounts).orderBy(asc(accounts.id)).all();
    const moves = db
      .select({
        accountId: movements.accountId,
        date: movements.date,
        kind: movements.kind,
        amountCents: movements.amountCents,
      })
      .from(movements)
      .all();
    const moved = db
      .select({
        date: transfers.date,
        amountCents: transfers.amountCents,
        fromAccountId: transfers.fromAccountId,
        toAccountId: transfers.toAccountId,
      })
      .from(transfers)
      .all();
    const rows: AccountBalanceDto[] = all.map((a) => ({
      accountId: a.id,
      balanceCents: accountBalance(a, moves, moved),
    }));
    return rows;
  });
  app.get('/api/accounts', () => {
    const rows: AccountDto[] = db.select(columns).from(accounts).orderBy(asc(accounts.id)).all();
    return rows;
  });

  app.post('/api/accounts', (request, reply) => {
    const parsed = accountCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    if (nameTaken(db, parsed.data.name)) {
      return conflict(reply, MESSAGES.duplicate);
    }
    const created = db.insert(accounts).values(parsed.data).returning({ id: accounts.id }).get();
    return reply.code(201).send(getAccount(db, created.id));
  });

  app.patch('/api/accounts/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (id === undefined || getAccount(db, id) === undefined) {
      return notFound(reply, MESSAGES.notFound);
    }
    const parsed = accountUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    if (parsed.data.name !== undefined && nameTaken(db, parsed.data.name, id)) {
      return conflict(reply, MESSAGES.duplicate);
    }
    if (Object.keys(parsed.data).length > 0) {
      db.update(accounts).set(parsed.data).where(eq(accounts.id, id)).run();
    }
    return getAccount(db, id);
  });

  app.delete('/api/accounts/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (id === undefined || getAccount(db, id) === undefined) {
      return notFound(reply, MESSAGES.notFound);
    }
    if (id === DEFAULT_ACCOUNT_ID) {
      return conflict(reply, MESSAGES.isDefault);
    }
    const usedByMovements = db
      .select({ n: count() })
      .from(movements)
      .where(eq(movements.accountId, id))
      .get();
    const usedByTransfers = db
      .select({ n: count() })
      .from(transfers)
      .where(or(eq(transfers.fromAccountId, id), eq(transfers.toAccountId, id)))
      .get();
    if ((usedByMovements?.n ?? 0) + (usedByTransfers?.n ?? 0) > 0) {
      return conflict(reply, MESSAGES.inUse);
    }
    db.delete(accounts).where(eq(accounts.id, id)).run();
    return reply.code(204).send();
  });
}
