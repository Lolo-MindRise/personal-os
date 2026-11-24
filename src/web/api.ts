import type {
  ApiErrorBody,
  CategoryDto,
  MonthSummaryDto,
  MovementDto,
  PendingEntryDto,
  RecurringItemDto,
} from '../shared/api.js';
import type { ConfirmPayload, MovementPayload } from './movementForm.js';
import type { RecurringPayload } from './recurringForm.js';

/** An error answer from the API: a readable message plus per-field messages. */
export class ApiError extends Error {
  readonly fields: Record<string, string>;

  constructor(message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.fields = fields;
  }
}

export const NETWORK_ERROR = 'No se ha podido conectar con el servidor.';

async function request<T>(fetchFn: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch {
    throw new ApiError(NETWORK_ERROR);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(NETWORK_ERROR);
  }
  if (!response.ok) {
    const error = body as Partial<ApiErrorBody>;
    throw new ApiError(error.error ?? NETWORK_ERROR, error.fields);
  }
  return body as T;
}

const json = (method: string, payload: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});

const enc = encodeURIComponent;
const itemMonth = (itemId: number, month: string) =>
  `/api/recurring-items/${String(itemId)}/months/${enc(month)}`;

export function createApiClient(fetchFn: typeof fetch = fetch) {
  return {
    categories: () => request<CategoryDto[]>(fetchFn, '/api/categories'),
    movements: (month: string) =>
      request<MovementDto[]>(fetchFn, `/api/movements?month=${enc(month)}`),
    summary: (month: string) =>
      request<MonthSummaryDto>(fetchFn, `/api/months/${enc(month)}/summary`),
    createMovement: (payload: MovementPayload) =>
      request<MovementDto>(fetchFn, '/api/movements', json('POST', payload)),
    updateMovement: (id: number, payload: MovementPayload) =>
      request<MovementDto>(fetchFn, `/api/movements/${String(id)}`, json('PATCH', payload)),
    deleteMovement: (id: number) =>
      request<undefined>(fetchFn, `/api/movements/${String(id)}`, { method: 'DELETE' }),

    // Recurring items (ADR-0005)
    recurringItems: () => request<RecurringItemDto[]>(fetchFn, '/api/recurring-items'),
    createRecurring: (payload: RecurringPayload) =>
      request<RecurringItemDto>(fetchFn, '/api/recurring-items', json('POST', payload)),
    updateRecurring: (id: number, payload: Partial<RecurringPayload>) =>
      request<RecurringItemDto>(
        fetchFn,
        `/api/recurring-items/${String(id)}`,
        json('PATCH', payload),
      ),
    pending: (month: string) =>
      request<PendingEntryDto[]>(fetchFn, `/api/months/${enc(month)}/pending`),
    skipped: (month: string) =>
      request<PendingEntryDto[]>(fetchFn, `/api/months/${enc(month)}/skipped`),
    confirmRecurring: (itemId: number, month: string, overrides: ConfirmPayload) =>
      request<MovementDto>(fetchFn, `${itemMonth(itemId, month)}/confirm`, json('POST', overrides)),
    confirmAll: (month: string) =>
      request<MovementDto[]>(fetchFn, `/api/months/${enc(month)}/confirm-all`, { method: 'POST' }),
    skipRecurring: (itemId: number, month: string) =>
      request<undefined>(fetchFn, `${itemMonth(itemId, month)}/skip`, { method: 'POST' }),
    undoSkip: (itemId: number, month: string) =>
      request<undefined>(fetchFn, `${itemMonth(itemId, month)}/skip`, { method: 'DELETE' }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
