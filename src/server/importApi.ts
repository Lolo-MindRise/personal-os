import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { CategoryRuleDto, ImportPreviewRowDto, ImportSummaryDto } from '../shared/api.js';
import type { ImportMapping } from '../shared/csvImport.js';
import { classifyRows, normalizeText } from '../shared/importClassify.js';
import { isDueInMonth, monthOf } from '../shared/recurring.js';
import {
  categoryRuleCreateSchema,
  importCommitSchema,
  importMappingSchema,
  importPreviewSchema,
} from '../shared/schemas.js';
import {
  badRequest,
  categoryError,
  conflict,
  fieldErrors,
  MESSAGES as COMMON_MESSAGES,
  notFound,
  parseId,
} from './apiCommon.js';
import type { Db } from './db/index.js';
import { confirmedItemIds, dueEntries, getRecurringItem, skippedItemIds } from './db/recurring.js';
import { categories, categoryRules, importSettings, movements } from './db/schema.js';

const MESSAGES = {
  ...COMMON_MESSAGES,
  ruleNotFound: 'No se ha encontrado la regla.',
  ruleDuplicate: 'Ya existe una regla con ese texto.',
  rowProblem: (index: number, message: string) => `Fila ${String(index + 1)}: ${message}`,
} as const;

/** Imports may be a few thousand rows; the default 1 MB body limit would be tight. */
const IMPORT_BODY_LIMIT = 8 * 1024 * 1024;

/** Thrown inside the commit transaction to roll everything back with a readable message. */
class RowError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

function listRules(db: Db): CategoryRuleDto[] {
  return db
    .select({
      id: categoryRules.id,
      pattern: categoryRules.pattern,
      categoryId: categoryRules.categoryId,
      categoryName: categories.name,
      kind: categories.kind,
    })
    .from(categoryRules)
    .innerJoin(categories, eq(categories.id, categoryRules.categoryId))
    .orderBy(asc(categoryRules.id))
    .all();
}

function readMapping(db: Db): ImportMapping | null {
  const row = db.select().from(importSettings).where(eq(importSettings.id, 1)).get();
  if (row === undefined) {
    return null;
  }
  try {
    const parsed = importMappingSchema.safeParse(JSON.parse(row.mapping));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function preview(db: Db, rows: { date: string; concept: string; amountCents: number }[]) {
  if (rows.length === 0) {
    return [];
  }
  const dates = rows.map((r) => r.date).sort();
  // Whole months, not just the file's dates: a fixed item confirmed by hand sits at its own
  // expected day, which may be outside the range of the bank rows.
  const first = `${monthOf(dates[0] ?? '')}-01`;
  const last = `${monthOf(dates.at(-1) ?? '')}-31`;
  const existing = db
    .select({
      date: movements.date,
      kind: movements.kind,
      concept: movements.concept,
      amountCents: movements.amountCents,
      recurringItemId: movements.recurringItemId,
    })
    .from(movements)
    .where(and(gte(movements.date, first), lte(movements.date, last)))
    .all();
  const months = [...new Set(rows.map((r) => monthOf(r.date)))];
  const pending = months.flatMap((month) => dueEntries(db, month).pending);
  return classifyRows(rows, { rules: listRules(db), existing, pending });
}

export function registerImportApi(app: FastifyInstance, db: Db): void {
  // --- Category rules ---

  app.get('/api/category-rules', () => listRules(db));

  app.post('/api/category-rules', (request, reply) => {
    const parsed = categoryRuleCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    const category = db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, parsed.data.categoryId))
      .get();
    if (category === undefined) {
      return badRequest(reply, MESSAGES.noCategory, { categoryId: MESSAGES.noCategory });
    }
    const wanted = normalizeText(parsed.data.pattern);
    if (listRules(db).some((rule) => normalizeText(rule.pattern) === wanted)) {
      return conflict(reply, MESSAGES.ruleDuplicate);
    }
    const created = db
      .insert(categoryRules)
      .values({ pattern: parsed.data.pattern, categoryId: parsed.data.categoryId })
      .returning({ id: categoryRules.id })
      .get();
    return reply.code(201).send(listRules(db).find((rule) => rule.id === created.id));
  });

  app.delete('/api/category-rules/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    const removed =
      id === undefined
        ? []
        : db
            .delete(categoryRules)
            .where(eq(categoryRules.id, id))
            .returning({ id: categoryRules.id })
            .all();
    if (removed.length === 0) {
      return notFound(reply, MESSAGES.ruleNotFound);
    }
    return reply.code(204).send();
  });

  // --- The remembered column mapping ---

  app.get('/api/import/mapping', () => ({ mapping: readMapping(db) }));

  app.put('/api/import/mapping', (request, reply) => {
    const parsed = importMappingSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    const json = JSON.stringify(parsed.data);
    db.insert(importSettings)
      .values({ id: 1, mapping: json })
      .onConflictDoUpdate({
        target: importSettings.id,
        set: { mapping: json, updatedAt: new Date().toISOString() },
      })
      .run();
    return { mapping: parsed.data };
  });

  // --- Preview and commit ---

  app.post('/api/import/preview', { bodyLimit: IMPORT_BODY_LIMIT }, (request, reply) => {
    const parsed = importPreviewSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    const rows: ImportPreviewRowDto[] = preview(db, parsed.data.rows);
    return { rows };
  });

  app.post('/api/import/commit', { bodyLimit: IMPORT_BODY_LIMIT }, (request, reply) => {
    const parsed = importCommitSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    try {
      // One transaction: if any row is wrong, nothing is imported.
      const summary = db.transaction((tx): ImportSummaryDto => {
        const result: ImportSummaryDto = { created: 0, confirmedRecurring: 0 };
        parsed.data.rows.forEach((row, index) => {
          const fail = (message: string): never => {
            throw new RowError(MESSAGES.rowProblem(index, message));
          };
          const problem = categoryError(db, row.kind, row.categoryId);
          if (problem !== undefined) {
            fail(problem.error);
          }
          const itemId = row.recurringItemId ?? null;
          // Like the normal confirmation, a confirmed fixed item carries the item's notes.
          const notes = itemId === null ? null : (getRecurringItem(db, itemId)?.notes ?? null);
          if (itemId !== null) {
            const month = monthOf(row.date);
            const item = getRecurringItem(db, itemId);
            if (item === undefined) {
              fail('el fijo no existe.');
            } else if (
              item.kind !== row.kind ||
              item.categoryId !== row.categoryId ||
              !isDueInMonth(item, month)
            ) {
              fail('el fijo no corresponde a esta fila.');
            } else if (confirmedItemIds(db, month).has(itemId)) {
              fail('el fijo ya está confirmado en ese mes.');
            } else if (skippedItemIds(db, month).has(itemId)) {
              fail('el fijo está saltado en ese mes.');
            }
            result.confirmedRecurring++;
          } else {
            result.created++;
          }
          tx.insert(movements)
            .values({
              date: row.date,
              kind: row.kind,
              categoryId: row.categoryId,
              concept: row.concept,
              amountCents: row.amountCents,
              notes,
              recurringItemId: itemId,
            })
            .run();
        });
        return result;
      });
      return reply.code(201).send(summary);
    } catch (error) {
      if (error instanceof RowError) {
        return badRequest(reply, error.message);
      }
      throw error;
    }
  });
}
