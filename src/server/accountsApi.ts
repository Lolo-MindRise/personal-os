import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AccountDto } from '../shared/api.js';
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
import { accounts } from './db/schema.js';

const MESSAGES = {
  ...COMMON_MESSAGES,
  notFound: 'No se ha encontrado la cuenta.',
  duplicate: 'Ya existe una cuenta con ese nombre.',
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
}
