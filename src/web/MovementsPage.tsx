import { useCallback, useEffect, useState } from 'react';
import type {
  CategoryDto,
  DebtDto,
  MonthSummaryDto,
  MovementDto,
  MovementSearchDto,
  PendingEntryDto,
} from '../shared/api.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import { MovementForm, type FieldErrors, type FormMode } from './MovementForm.js';
import { MovementList } from './MovementList.js';
import { MovementFilters, SearchResults, type FilterErrors } from './MovementSearch.js';
import {
  emptyFilters,
  validateFilters,
  type FilterValues,
  type SearchQuery,
} from './movementSearch.js';
import {
  emptyForm,
  formFromEntry,
  formFromMovement,
  mapApiFieldErrors,
  payloadForUpdate,
  toConfirmPayload,
  unmappedApiMessage,
  type MovementFormValues,
  type MovementPayload,
} from './movementForm.js';
import { currentMonth, monthLabel, shiftMonth } from './months.js';
import { PendingList } from './PendingList.js';
import { SummaryBar } from './SummaryBar.js';

const defaultApi = createApiClient();

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

export const CONFIRMATION_CANCELLED =
  'Se ha cancelado la confirmación: ese fijo ya no está pendiente.';

export function MovementsPage({ api = defaultApi }: { api?: ApiClient }) {
  const [month, setMonth] = useState(currentMonth);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [debts, setDebts] = useState<DebtDto[]>([]);
  const [movements, setMovements] = useState<MovementDto[]>([]);
  const [pending, setPending] = useState<PendingEntryDto[]>([]);
  const [skipped, setSkipped] = useState<PendingEntryDto[]>([]);
  const [summary, setSummary] = useState<MonthSummaryDto | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  /** Why a pending-section action failed or a confirmation was cancelled. Not cleared by reloads. */
  const [actionError, setActionError] = useState<string | undefined>();
  const [reloads, setReloads] = useState(0);

  const [form, setForm] = useState<MovementFormValues>(() => emptyForm());
  const [editingId, setEditingId] = useState<number | undefined>();
  /** The recurring item being confirmed through the form, if any. */
  const [confirmingId, setConfirmingId] = useState<number | undefined>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const [filters, setFilters] = useState<FilterValues>(() => emptyFilters());
  const [filterErrors, setFilterErrors] = useState<FilterErrors>({});
  const [showFilters, setShowFilters] = useState(false);
  /** The active search, or undefined in the monthly view. */
  const [search, setSearch] = useState<{ query: SearchQuery; page: number } | undefined>();
  const [searchResult, setSearchResult] = useState<MovementSearchDto | undefined>();
  const [searchError, setSearchError] = useState<string | undefined>();
  const [searchBusy, setSearchBusy] = useState(false);

  const mode: FormMode =
    confirmingId !== undefined ? 'confirm' : editingId !== undefined ? 'edit' : 'add';

  useEffect(() => {
    api.categories().then(setCategories, (error: unknown) => {
      setLoadError(messageOf(error));
    });
    api.debts().then(setDebts, (error: unknown) => {
      setLoadError(messageOf(error));
    });
  }, [api]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.movements(month),
      api.summary(month),
      api.pending(month),
      api.skipped(month),
    ]).then(
      ([rows, totals, due, skippedEntries]) => {
        if (active) {
          setMovements(rows);
          setSummary(totals);
          setPending(due);
          setSkipped(skippedEntries);
          setLoadError(undefined);
        }
      },
      (error: unknown) => {
        if (active) {
          setLoadError(messageOf(error));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [api, month, reloads]);

  const reload = useCallback(() => {
    setReloads((n) => n + 1);
  }, []);

  // The search across all months (task 0013, block 3). While a search is active, the monthly
  // view (pending entries, form, list) is hidden; "Volver a la vista mensual" restores it.
  useEffect(() => {
    if (search === undefined) {
      return;
    }
    let active = true;
    api.searchMovements(search.query, search.page).then(
      (result) => {
        if (active) {
          setSearchResult(result);
          setSearchError(undefined);
          setSearchBusy(false);
        }
      },
      (error: unknown) => {
        if (active) {
          setSearchError(messageOf(error));
          setSearchBusy(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [api, search]);

  const runSearch = () => {
    const result = validateFilters(filters);
    if (!result.ok) {
      setFilterErrors(result.errors);
      return;
    }
    // A new search starts on page 1 and drops the previous results while it loads.
    setSearchResult(undefined);
    setSearchError(undefined);
    setSearchBusy(true);
    setSearch({ query: result.query, page: 1 });
  };

  const leaveSearch = () => {
    setSearch(undefined);
    setSearchResult(undefined);
    setSearchError(undefined);
    setShowFilters(false);
  };

  // If the entry being confirmed is no longer pending (skipped, or confirmed by
  // "Confirmar todos" or elsewhere), a later submit would fail with a 409: cancel
  // the confirmation and say so. State is adjusted while rendering, as React
  // recommends for state derived from other state (not in an effect).
  if (confirmingId !== undefined && !pending.some((e) => e.recurringItemId === confirmingId)) {
    setForm(emptyForm());
    setEditingId(undefined);
    setConfirmingId(undefined);
    setFieldErrors({});
    setFormError(undefined);
    setActionError(CONFIRMATION_CANCELLED);
  }

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(undefined);
    setConfirmingId(undefined);
    setFieldErrors({});
    setFormError(undefined);
  };

  const changeMonth = (next: string) => {
    // A pending entry belongs to its month: leaving the month cancels the confirmation.
    if (confirmingId !== undefined) {
      resetForm();
    }
    setActionError(undefined);
    setMonth(next);
  };

  const save = async (payload: MovementPayload) => {
    setBusy(true);
    setFormError(undefined);
    setFieldErrors({});
    try {
      if (confirmingId !== undefined) {
        await api.confirmRecurring(confirmingId, month, toConfirmPayload(payload));
      } else if (editingId === undefined) {
        await api.createMovement(payload);
      } else {
        const stored = movements.find((m) => m.id === editingId)?.debtId ?? null;
        await api.updateMovement(editingId, payloadForUpdate(payload, stored));
      }
      resetForm();
      setActionError(undefined);
      reload();
    } catch (error) {
      setFieldErrors(error instanceof ApiError ? mapApiFieldErrors(error.fields) : {});
      setFormError(
        (error instanceof ApiError ? unmappedApiMessage(error.fields) : undefined) ??
          messageOf(error),
      );
      if (error instanceof ApiError && error.fields.date === undefined) {
        // The list may be out of date (for example confirmed elsewhere): refresh it.
        reload();
      }
    } finally {
      setBusy(false);
    }
  };

  const edit = (movement: MovementDto) => {
    setForm(formFromMovement(movement));
    setEditingId(movement.id);
    setConfirmingId(undefined);
    setFieldErrors({});
    setFormError(undefined);
  };

  const confirm = (entry: PendingEntryDto) => {
    setForm(formFromEntry(entry));
    setConfirmingId(entry.recurringItemId);
    setEditingId(undefined);
    setFieldErrors({});
    setFormError(undefined);
    setActionError(undefined);
  };

  const remove = async (movement: MovementDto) => {
    if (!window.confirm(`¿Eliminar «${movement.concept}»? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await api.deleteMovement(movement.id);
      if (editingId === movement.id) {
        resetForm();
      }
      reload();
    } catch (error) {
      setLoadError(messageOf(error));
    }
  };

  /**
   * Runs a pending-section action, then refreshes everything. A failure is kept
   * in `actionError`, which a reload does not clear (unlike `loadError`), so the
   * user always sees why the action did not work.
   */
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(undefined);
    try {
      await action();
    } catch (error) {
      setActionError(messageOf(error));
    } finally {
      setBusy(false);
      reload();
    }
  };

  return (
    <main className="page">
      <h1>Movimientos</h1>

      {!showFilters && search === undefined && (
        <div className="form-actions">
          <button
            type="button"
            onClick={() => {
              setShowFilters(true);
            }}
          >
            Buscar y filtrar
          </button>
        </div>
      )}

      {(showFilters || search !== undefined) && (
        <MovementFilters
          values={filters}
          categories={categories}
          errors={filterErrors}
          busy={searchBusy}
          onChange={(values) => {
            setFilters(values);
            setFilterErrors({});
          }}
          onSearch={runSearch}
          onClear={() => {
            setFilters(emptyFilters());
            setFilterErrors({});
          }}
        />
      )}

      {searchError !== undefined && (
        <p className="form-error" role="alert">
          {searchError}
        </p>
      )}

      {search !== undefined && searchResult !== undefined && (
        <SearchResults
          result={searchResult}
          query={search.query}
          categories={categories}
          onPage={(page) => {
            setSearchBusy(true);
            setSearch({ query: search.query, page });
          }}
          onGoToMonth={(movement) => {
            leaveSearch();
            changeMonth(movement.date.slice(0, 7));
          }}
          onBack={leaveSearch}
        />
      )}
      {search !== undefined && searchResult === undefined && searchError === undefined && (
        <p className="empty">Buscando…</p>
      )}

      {search === undefined && (
        <>
          <nav className="month-picker" aria-label="Mes">
            <button
              type="button"
              aria-label="Mes anterior"
              onClick={() => {
                changeMonth(shiftMonth(month, -1));
              }}
            >
              ←
            </button>
            <input
              type="month"
              aria-label="Mes"
              value={month}
              onChange={(e) => {
                if (e.target.value !== '') {
                  changeMonth(e.target.value);
                }
              }}
            />
            <button
              type="button"
              aria-label="Mes siguiente"
              onClick={() => {
                changeMonth(shiftMonth(month, 1));
              }}
            >
              →
            </button>
            <span className="month-label">{monthLabel(month)}</span>
          </nav>

          {loadError !== undefined && (
            <p className="form-error" role="alert">
              {loadError}
            </p>
          )}

          {actionError !== undefined && (
            <p className="form-error" role="alert">
              {actionError}
            </p>
          )}

          {summary !== undefined && <SummaryBar summary={summary} />}

          <PendingList
            pending={pending}
            skipped={skipped}
            busy={busy}
            onConfirm={confirm}
            onSkip={(entry) => void act(() => api.skipRecurring(entry.recurringItemId, month))}
            onUndo={(entry) => void act(() => api.undoSkip(entry.recurringItemId, month))}
            onConfirmAll={() => void act(() => api.confirmAll(month))}
          />

          <MovementForm
            values={form}
            categories={categories}
            debts={debts}
            errors={fieldErrors}
            formError={formError}
            mode={mode}
            busy={busy}
            onChange={(values) => {
              setForm(values);
              setFieldErrors({});
            }}
            onSubmit={(payload) => void save(payload)}
            onInvalid={setFieldErrors}
            onCancel={resetForm}
          />

          <MovementList
            movements={movements}
            onEdit={edit}
            onDelete={(movement) => void remove(movement)}
          />
        </>
      )}
    </main>
  );
}
