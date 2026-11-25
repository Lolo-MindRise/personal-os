import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CategorySuggestionDto } from '../shared/api.js';
import { SUGGEST_SCAN_LIMIT, suggestCategory } from '../shared/suggestCategory.js';
import { badRequest, fieldErrors, MESSAGES } from './apiCommon.js';
import type { Db } from './db/index.js';
import { liveMovements } from './db/live.js';
import { movements } from './db/schema.js';

const suggestQuerySchema = z.object({
  kind: z.enum(['income', 'expense']),
  concept: z.string().max(200),
});

/**
 * The category most often used with similar concepts (task 0003-07). Only past movements of the
 * same kind, never trashed ones, at most SUGGEST_SCAN_LIMIT of them (newest first).
 */
export function registerSuggestApi(app: FastifyInstance, db: Db): void {
  app.get('/api/movements/suggest-category', (request, reply) => {
    const parsed = suggestQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    const past = db
      .select({
        id: movements.id,
        date: movements.date,
        concept: movements.concept,
        categoryId: movements.categoryId,
      })
      .from(movements)
      .where(and(liveMovements(), eq(movements.kind, parsed.data.kind)))
      .orderBy(desc(movements.date), desc(movements.id))
      .limit(SUGGEST_SCAN_LIMIT)
      .all();
    const result: CategorySuggestionDto = {
      categoryId: suggestCategory(parsed.data.concept, past) ?? null,
    };
    return result;
  });
}
