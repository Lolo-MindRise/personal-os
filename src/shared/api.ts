import type { Kind } from './constants.js';

// Response shapes of the HTTP API, shared with the frontend.

export interface CategoryDto {
  id: number;
  name: string;
  kind: Kind;
}

export interface MovementDto {
  id: number;
  date: string;
  kind: Kind;
  categoryId: number;
  categoryName: string;
  concept: string;
  amountCents: number;
  notes: string | null;
  debtId: number | null;
}

export interface MonthSummaryDto {
  month: string;
  incomeCents: number;
  expenseCents: number;
  repaymentCents: number;
  /** income − expenses − repayments; negative when the month is in deficit. */
  savingsCents: number;
}

/** Error body for every 4xx response. `fields` maps a field name to its message. */
export interface ApiErrorBody {
  error: string;
  fields?: Record<string, string>;
}
