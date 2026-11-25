import type {
  AccountBalanceDto,
  AccountDto,
  TransferDto,
  ApiErrorBody,
  BackupStatusDto,
  BudgetMonthDto,
  CategoryDto,
  CategoryRuleDto,
  CategoryUsageDto,
  DashboardDto,
  DebtDto,
  GoalDto,
  ImportPreviewRowDto,
  ImportSummaryDto,
  MilestoneDto,
  SettingsDto,
  YearSummaryDto,
  MonthSummaryDto,
  MovementDto,
  MovementSearchDto,
  PendingEntryDto,
  ProjectionDto,
  RecurringItemDto,
  TagDto,
} from '../shared/api.js';
import type { Kind } from '../shared/constants.js';
import type { DataFile, DataImportResultDto } from '../shared/dataFile.js';
import type { ImportMapping } from '../shared/csvImport.js';
import type { ExpenseReportDto } from '../shared/reports.js';
import type { AccountPayload, TransferPayload } from './accountForms.js';
import type { BudgetPayload } from './budgetForm.js';
import type { CommitRow } from './importState.js';
import type { DebtPayload } from './debtForm.js';
import type { MilestonePayload } from './milestoneForm.js';
import type { ConfirmPayload, MovementPayload } from './movementForm.js';
import { searchParams, type SearchQuery } from './movementSearch.js';
import type { GoalPayload, SettingsPayload } from './summaryForms.js';
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

export const NETWORK_ERROR =
  'No se ha podido conectar con el servidor. Comprueba que Personal OS sigue en marcha y vuelve a intentarlo.';

/** `MESSAGES.invalid` of the server. */
const INVALID_DATA = 'Datos no válidos.';

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
    // The server's bare "invalid data" message says what happened but not what to do.
    const message =
      error.error === INVALID_DATA
        ? `${INVALID_DATA} Revisa lo escrito y vuelve a intentarlo.`
        : error.error;
    throw new ApiError(message ?? NETWORK_ERROR, error.fields);
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
    accounts: () => request<AccountDto[]>(fetchFn, '/api/accounts'),
    accountBalances: () => request<AccountBalanceDto[]>(fetchFn, '/api/accounts/balances'),
    createAccount: (payload: AccountPayload) =>
      request<AccountDto>(fetchFn, '/api/accounts', json('POST', payload)),
    updateAccount: (id: number, payload: Partial<AccountPayload>) =>
      request<AccountDto>(fetchFn, `/api/accounts/${String(id)}`, json('PATCH', payload)),
    deleteAccount: (id: number) =>
      request<undefined>(fetchFn, `/api/accounts/${String(id)}`, { method: 'DELETE' }),
    transfers: () => request<TransferDto[]>(fetchFn, '/api/transfers'),
    createTransfer: (payload: TransferPayload) =>
      request<TransferDto>(fetchFn, '/api/transfers', json('POST', payload)),
    updateTransfer: (id: number, payload: Partial<TransferPayload>) =>
      request<TransferDto>(fetchFn, `/api/transfers/${String(id)}`, json('PATCH', payload)),
    deleteTransfer: (id: number) =>
      request<undefined>(fetchFn, `/api/transfers/${String(id)}`, { method: 'DELETE' }),
    backupStatus: () => request<BackupStatusDto>(fetchFn, '/api/backups/status'),
    exportData: () => request<DataFile>(fetchFn, '/api/data/export'),
    importData: (file: unknown) =>
      request<DataImportResultDto>(fetchFn, '/api/data/import', json('POST', file)),
    dashboard: (month: string, today: string) =>
      request<DashboardDto>(fetchFn, `/api/dashboard?month=${enc(month)}&today=${enc(today)}`),
    expenseReport: (month: string, months: number) =>
      request<ExpenseReportDto>(
        fetchFn,
        `/api/reports/expenses?month=${enc(month)}&months=${String(months)}`,
      ),
    budget: (month: string) => request<BudgetMonthDto>(fetchFn, `/api/months/${enc(month)}/budget`),
    addBudgetLine: (payload: BudgetPayload) =>
      request<BudgetMonthDto>(fetchFn, '/api/budget-lines', json('POST', payload)),
    debts: () => request<DebtDto[]>(fetchFn, '/api/debts'),
    createDebt: (payload: DebtPayload) =>
      request<DebtDto>(fetchFn, '/api/debts', json('POST', payload)),
    updateDebt: (id: number, payload: Partial<DebtPayload>) =>
      request<DebtDto>(fetchFn, `/api/debts/${String(id)}`, json('PATCH', payload)),
    settings: () => request<SettingsDto>(fetchFn, '/api/settings'),
    saveSettings: (payload: SettingsPayload) =>
      request<SettingsDto>(fetchFn, '/api/settings', json('PUT', payload)),
    yearSummary: (year: number) =>
      request<YearSummaryDto>(fetchFn, `/api/years/${String(year)}/summary`),
    goals: () => request<GoalDto[]>(fetchFn, '/api/goals'),
    createGoal: (payload: GoalPayload) =>
      request<GoalDto>(fetchFn, '/api/goals', json('POST', payload)),
    updateGoal: (id: number, payload: Partial<GoalPayload>) =>
      request<GoalDto>(fetchFn, `/api/goals/${String(id)}`, json('PATCH', payload)),
    milestones: () => request<MilestoneDto[]>(fetchFn, '/api/milestones'),
    createMilestone: (payload: MilestonePayload) =>
      request<MilestoneDto>(fetchFn, '/api/milestones', json('POST', payload)),
    updateMilestone: (id: number, payload: Partial<MilestonePayload>) =>
      request<MilestoneDto>(fetchFn, `/api/milestones/${String(id)}`, json('PATCH', payload)),
    categoryUsage: () => request<CategoryUsageDto[]>(fetchFn, '/api/categories/usage'),
    createCategory: (payload: { name: string; kind: Kind }) =>
      request<CategoryDto>(fetchFn, '/api/categories', json('POST', payload)),
    renameCategory: (id: number, name: string) =>
      request<CategoryDto>(fetchFn, `/api/categories/${String(id)}`, json('PATCH', { name })),
    deleteCategory: (id: number) =>
      request<undefined>(fetchFn, `/api/categories/${String(id)}`, { method: 'DELETE' }),
    tags: () => request<TagDto[]>(fetchFn, '/api/tags'),
    renameTag: (id: number, name: string) =>
      request<TagDto>(fetchFn, `/api/tags/${String(id)}`, json('PATCH', { name })),
    deleteTag: (id: number) =>
      request<undefined>(fetchFn, `/api/tags/${String(id)}`, { method: 'DELETE' }),
    movements: (month: string) =>
      request<MovementDto[]>(fetchFn, `/api/movements?month=${enc(month)}`),
    projection: (to: string, today: string) =>
      request<ProjectionDto>(fetchFn, `/api/projection?to=${enc(to)}&today=${enc(today)}`),
    searchMovements: (query: SearchQuery, page: number) =>
      request<MovementSearchDto>(fetchFn, `/api/movements/search?${searchParams(query, page)}`),
    summary: (month: string) =>
      request<MonthSummaryDto>(fetchFn, `/api/months/${enc(month)}/summary`),
    createMovement: (payload: MovementPayload) =>
      request<MovementDto>(fetchFn, '/api/movements', json('POST', payload)),
    updateMovement: (id: number, payload: MovementPayload) =>
      request<MovementDto>(fetchFn, `/api/movements/${String(id)}`, json('PATCH', payload)),
    deleteMovement: (id: number) =>
      request<undefined>(fetchFn, `/api/movements/${String(id)}`, { method: 'DELETE' }),

    // CSV import (task 0013)
    categoryRules: () => request<CategoryRuleDto[]>(fetchFn, '/api/category-rules'),
    createCategoryRule: (payload: { pattern: string; categoryId: number }) =>
      request<CategoryRuleDto>(fetchFn, '/api/category-rules', json('POST', payload)),
    deleteCategoryRule: (id: number) =>
      request<undefined>(fetchFn, `/api/category-rules/${String(id)}`, { method: 'DELETE' }),
    importMapping: () => request<{ mapping: ImportMapping | null }>(fetchFn, '/api/import/mapping'),
    saveImportMapping: (mapping: ImportMapping) =>
      request<{ mapping: ImportMapping }>(fetchFn, '/api/import/mapping', json('PUT', mapping)),
    importPreview: (rows: { date: string; concept: string; amountCents: number }[]) =>
      request<{ rows: ImportPreviewRowDto[] }>(
        fetchFn,
        '/api/import/preview',
        json('POST', { rows }),
      ),
    importCommit: (rows: CommitRow[]) =>
      request<ImportSummaryDto>(fetchFn, '/api/import/commit', json('POST', { rows })),

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
