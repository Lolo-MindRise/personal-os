import { isNotNull, isNull, type SQL } from 'drizzle-orm';
import { movements, transfers } from './schema.js';

// Trash (plan 0003). A movement or a transfer with `deleted_at` set is "in the trash": it must be
// invisible to every reader (lists, totals, balances, budgets, reports, projections, dashboard,
// goals, debts, tags, search, import duplicate check, recurring logic).
//
// THE RULE: every query that reads `movements` or `transfers` for the app's figures puts
// `liveMovements()` / `liveTransfers()` in its WHERE (or in the ON/WHERE of the join). Only the
// trash code (trashApi.ts), the data export, the deletion-protection checks (a trashed row still
// "uses" its account or category) and the writes below read trashed rows on purpose.
// `src/server/trashGuard.test.ts` fails when a server file reads these tables without importing
// this module, and `trashEquivalence.test.ts` fails when an endpoint forgets the exclusion.

/** The movement is not in the trash. */
export function liveMovements(): SQL {
  return isNull(movements.deletedAt);
}

/** The transfer is not in the trash. */
export function liveTransfers(): SQL {
  return isNull(transfers.deletedAt);
}

/** The movement is in the trash. */
export function trashedMovements(): SQL {
  return isNotNull(movements.deletedAt);
}

/** The transfer is in the trash. */
export function trashedTransfers(): SQL {
  return isNotNull(transfers.deletedAt);
}

/** The deletion timestamp stored in `deleted_at` (ISO 8601, UTC, like `created_at`). */
export function deletionTimestamp(now: Date = new Date()): string {
  return now.toISOString();
}
