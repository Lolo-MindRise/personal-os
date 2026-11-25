import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  AccountDto,
  CategoryDto,
  DebtDto,
  MonthSummaryDto,
  MovementDto,
  PendingEntryDto,
  TagDto,
} from '../shared/api.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import { MovementForm, type FieldErrors, type FormMode } from './MovementForm.js';
import { MovementList } from './MovementList.js';
import { MovementFilters, SearchResults, type FilterErrors } from './MovementSearch.js';
import {
  emptyFilters,
  paramsToQuery,
  queryToFilters,
  queryToParams,
  SEARCH_URL_KEYS,
  searchAction,
  validateFilters,
  type FilterValues,
} from './movementSearch.js';
import { initialSearchState, searchReducer } from './searchState.js';
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
import { LinkedMovements } from './LinkedMovements.js';
import { SidePanel, usePanel } from './SidePanel.js';
import { monthLabel } from './months.js';
import { FilterBar, PageHeader } from './PageHeader.js';
import { hrefFor, navigate, useMonth, useRoute } from './router.js';
import type { SearchQuery } from './movementSearch.js';
import {
  canExportMonth,
  downloadCsv,
  fetchAllSearchRows,
  monthCsvFilename,
  movementsToCsv,
} from './movementsCsv.js';
import { PendingList } from './PendingList.js';
import { SummaryBar } from './SummaryBar.js';
import { UndoToast } from './UndoToast.js';
import { useUndo } from './useUndo.js';

const defaultApi = createApiClient();

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

export const CONFIRMATION_CANCELLED =
  'Se ha cancelado la confirmación: ese fijo ya no está pendiente.';

export function MovementsPage({ api = defaultApi }: { api?: ApiClient }) {
  const [month, setMonth] = useMonth();
  // Filters that links put in the URL: a category (within the month), or the movements behind
  // a debt or a fixed item (across months).
  const { params } = useRoute();
  const categoryFilter = /^\d+$/.test(params.category ?? '') ? Number(params.category) : undefined;
  const debtParam = /^\d+$/.test(params.debt ?? '') ? Number(params.debt) : undefined;
  const fixedParam = /^\d+$/.test(params.fixed ?? '') ? Number(params.fixed) : undefined;
  const [fixedName, setFixedName] = useState<string | undefined>();
  useEffect(() => {
    if (fixedParam === undefined) {
      return;
    }
    let active = true;
    api.recurringItems().then(
      (items) => {
        if (active) {
          setFixedName(items.find((i) => i.id === fixedParam)?.concept);
        }
      },
      // The name is a nicety: the filter works without it.
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [api, fixedParam]);
  const linkedQuery = useMemo<SearchQuery | undefined>(
    () =>
      debtParam !== undefined
        ? { debtId: debtParam }
        : fixedParam !== undefined
          ? { recurringItemId: fixedParam }
          : undefined,
    [debtParam, fixedParam],
  );
  // The panel's own filters, also from the URL. Links to debts or fixed items take precedence.
  const searchKey = JSON.stringify(SEARCH_URL_KEYS.map((key) => `${key}=${params[key] ?? ''}`));
  const urlQuery = useMemo(
    () => (linkedQuery === undefined ? paramsToQuery(params) : undefined),
    // `params` changes identity with every route read; the filter values are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchKey, linkedQuery],
  );
  const panel = usePanel();
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [debts, setDebts] = useState<DebtDto[]>([]);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [movements, setMovements] = useState<MovementDto[]>([]);
  /** The month `movements` belongs to; it lags `month` while a new month loads or fails to. */
  const [loadedMonth, setLoadedMonth] = useState<string | undefined>();
  const [pending, setPending] = useState<PendingEntryDto[]>([]);
  const [skipped, setSkipped] = useState<PendingEntryDto[]>([]);
  const [summary, setSummary] = useState<MonthSummaryDto | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  /** Why a pending-section action failed or a confirmation was cancelled. Not cleared by reloads. */
  const [actionError, setActionError] = useState<string | undefined>();
  const [reloads, setReloads] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | undefined>();

  const [form, setForm] = useState<MovementFormValues>(() => emptyForm());
  const [editingId, setEditingId] = useState<number | undefined>();
  /** The recurring item being confirmed through the form, if any. */
  const [confirmingId, setConfirmingId] = useState<number | undefined>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const [filters, setFilters] = useState<FilterValues>(() => emptyFilters());
  const [filterErrors, setFilterErrors] = useState<FilterErrors>({});
  const [searchState, dispatch] = useReducer(searchReducer, initialSearchState);
  const {
    showFilters,
    search,
    result: searchResult,
    error: searchError,
    busy: searchBusy,
  } = searchState;
  /** Where focus goes when the button that was clicked disappears (open, leave, "Ver mes"). */
  const headingRef = useRef<HTMLHeadingElement>(null);

  const mode: FormMode =
    confirmingId !== undefined ? 'confirm' : editingId !== undefined ? 'edit' : 'add';

  useEffect(() => {
    api.categories().then(setCategories, (error: unknown) => {
      setLoadError(messageOf(error));
    });
    api.debts().then(setDebts, (error: unknown) => {
      setLoadError(messageOf(error));
    });
    api.accounts().then(setAccounts, (error: unknown) => {
      setLoadError(messageOf(error));
    });
  }, [api]);

  // Tags change when a movement is saved (new ones are created on the fly): reload with the month.
  useEffect(() => {
    let active = true;
    api.tags().then(
      (rows) => {
        if (active) {
          setTags(rows);
        }
      },
      // Only a convenience (suggestions and the filter): the screen works without it.
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [api, reloads]);

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
          setLoadedMonth(month);
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
  const undo = useUndo(reload, setActionError);

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
          dispatch({ type: 'loaded', result });
        }
      },
      (error: unknown) => {
        if (active) {
          dispatch({ type: 'failed', error: messageOf(error) });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [api, search]);

  // The panel's filters live in the URL (task 0001-01): each applied search is a history entry,
  // and the search follows the URL, so reload and the back button restore it.
  // Adjusted while rendering, as React recommends for state derived from other state.
  const [syncedQuery, setSyncedQuery] = useState<SearchQuery | undefined>();
  const [keepEmptySearch, setKeepEmptySearch] = useState(false);
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    if (urlQuery === undefined) {
      if (keepEmptySearch) {
        setKeepEmptySearch(false);
      } else {
        dispatch({ type: 'leave' });
      }
    } else {
      setFilters(queryToFilters(urlQuery));
      setFilterErrors({});
      dispatch({ type: 'search', query: urlQuery });
    }
  }

  /** The current URL parameters without the panel's own filters. */
  const paramsWithoutSearch = (): Record<string, string> =>
    Object.fromEntries(Object.entries(params).filter(([key]) => !SEARCH_URL_KEYS.includes(key)));

  const runSearch = () => {
    const result = validateFilters(filters);
    if (!result.ok) {
      setFilterErrors(result.errors);
      return;
    }
    const action = searchAction(urlQuery, result.query);
    if (action === 'navigate') {
      navigate('movements', { ...paramsWithoutSearch(), ...queryToParams(result.query) });
      return;
    }
    if (action === 'clear-url') {
      // The URL held a search and every filter is now empty: drop it so reload and back agree
      // with what is shown. The empty search stays visible (the sync below must not close it).
      setKeepEmptySearch(true);
      navigate('movements', paramsWithoutSearch());
    }
    dispatch({ type: 'search', query: result.query });
  };

  /** Back to the monthly view, with focus on the page heading (the clicked button disappears). */
  const leaveSearch = () => {
    if (urlQuery !== undefined) {
      navigate('movements', paramsWithoutSearch(), { replace: true });
    }
    dispatch({ type: 'leave' });
    headingRef.current?.focus();
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
    panel.hide();
  }

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(undefined);
    setConfirmingId(undefined);
    setFieldErrors({});
    setFormError(undefined);
    panel.hide();
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
    panel.show();
  };

  const confirm = (entry: PendingEntryDto) => {
    setForm(formFromEntry(entry));
    setConfirmingId(entry.recurringItemId);
    setEditingId(undefined);
    setFieldErrors({});
    setFormError(undefined);
    setActionError(undefined);
    panel.show();
  };

  const remove = async (movement: MovementDto) => {
    // No confirmation: the movement goes to the papelera and «Deshacer» brings it back.
    try {
      await api.deleteMovement(movement.id);
      if (editingId === movement.id) {
        resetForm();
      }
      undo.show(`Movimiento «${movement.concept}» eliminado.`, () =>
        api.restoreMovement(movement.id),
      );
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

  if (linkedQuery !== undefined) {
    return (
      <main className="page">
        <PageHeader title="Movimientos" headingRef={headingRef} />
        <FilterBar
          label={
            debtParam !== undefined
              ? `deuda ${debts.find((d) => d.id === debtParam)?.name ?? String(debtParam)}`
              : `fijo ${fixedName ?? String(fixedParam)}`
          }
          clearHref={hrefFor('movements')}
        />
        <LinkedMovements
          key={JSON.stringify(linkedQuery)}
          api={api}
          query={linkedQuery}
          categories={categories}
        />
      </main>
    );
  }

  /** Downloads the month on screen, or every result of the active search (paging through the API). */
  const exportCsv = async () => {
    setExporting(true);
    setExportError(undefined);
    try {
      const accountList = await api.accounts();
      if (search === undefined) {
        downloadCsv(
          monthCsvFilename(month, categoryFilter === undefined ? undefined : categoryName),
          movementsToCsv(shownMovements, accountList),
        );
      } else {
        const rows = await fetchAllSearchRows((page) => api.searchMovements(search.query, page));
        downloadCsv('movimientos-busqueda.csv', movementsToCsv(rows, accountList));
      }
    } catch (error) {
      setExportError(messageOf(error));
    } finally {
      setExporting(false);
    }
  };

  const categoryName = categories.find((c) => c.id === categoryFilter)?.name;
  const shownMovements =
    categoryFilter === undefined
      ? movements
      : movements.filter((m) => m.categoryId === categoryFilter);

  return (
    <main className="page">
      <PageHeader
        title="Movimientos"
        headingRef={headingRef}
        month={search === undefined ? month : undefined}
        onMonthChange={changeMonth}
        action={
          search === undefined ? (
            <button
              type="button"
              className="primary"
              onClick={() => {
                resetForm();
                panel.show();
              }}
            >
              Añadir movimiento
            </button>
          ) : undefined
        }
      />

      {categoryFilter !== undefined && search === undefined && (
        <FilterBar
          label={`categoría ${categoryName ?? String(categoryFilter)} · ${monthLabel(month)}`}
          clearHref={hrefFor('movements', { month })}
        />
      )}

      {!showFilters && search === undefined && (
        <div className="form-actions">
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'open' });
            }}
          >
            Buscar y filtrar
          </button>
        </div>
      )}

      <div className="form-actions">
        <button
          type="button"
          disabled={
            exporting ||
            (search === undefined
              ? !canExportMonth(loadedMonth, month, loadError)
              : searchResult === undefined)
          }
          onClick={() => void exportCsv()}
        >
          {search !== undefined
            ? 'Exportar resultados'
            : categoryFilter !== undefined
              ? 'Exportar mes (categoría)'
              : 'Exportar mes'}
        </button>
      </div>
      {exportError !== undefined && (
        <p className="form-error" role="alert">
          {exportError}
        </p>
      )}

      {(showFilters || search !== undefined) && (
        <MovementFilters
          values={filters}
          categories={categories}
          tags={tags}
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
          onClose={() => {
            if (urlQuery !== undefined) {
              navigate('movements', paramsWithoutSearch(), { replace: true });
            }
            dispatch({ type: 'close' });
            headingRef.current?.focus();
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
          tags={tags}
          busy={searchBusy}
          onPage={(page) => {
            dispatch({ type: 'page', page });
          }}
          onGoToMonth={(movement) => {
            leaveSearch();
            // The month changes: an edit started earlier (hidden while searching) belongs to the old one.
            resetForm();
            changeMonth(movement.date.slice(0, 7));
          }}
          onBack={leaveSearch}
        />
      )}
      {search !== undefined && searchResult === undefined && searchError === undefined && (
        <p className="empty" role="status">
          Buscando…
        </p>
      )}

      {search === undefined && (
        <>
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

          {categoryFilter !== undefined && (
            <p className="hint">Los totales y los pendientes son los de todo el mes.</p>
          )}
          {summary !== undefined && <SummaryBar summary={summary} />}

          <PendingList
            pending={pending}
            skipped={skipped}
            busy={busy}
            onConfirm={confirm}
            onSkip={(entry) => void act(() => api.skipRecurring(entry.recurringItemId, month))}
            onUndo={(entry) => void act(() => api.undoSkip(entry.recurringItemId, month))}
            onConfirmAll={() =>
              void act(async () => {
                const result = await api.confirmAll(month);
                const held = result.skippedHeldByTrash;
                if (held.length > 0) {
                  setActionError(
                    `No se han confirmado ${String(held.length)} fijos porque tienen un movimiento en la papelera: ${held.map((h) => h.concept).join(', ')}`,
                  );
                }
              })
            }
          />

          <SidePanel
            open={panel.open}
            title={
              mode === 'confirm'
                ? 'Confirmar fijo'
                : mode === 'edit'
                  ? 'Editar movimiento'
                  : 'Añadir movimiento'
            }
            onClose={resetForm}
          >
            <MovementForm
              values={form}
              categories={categories}
              debts={debts}
              accounts={accounts}
              tagNames={tags.map((t) => t.name)}
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
          </SidePanel>

          <MovementList
            movements={shownMovements}
            accounts={accounts}
            onEdit={edit}
            onDelete={(movement) => void remove(movement)}
          />
        </>
      )}
      <UndoToast
        toast={undo.toast}
        busy={undo.busy}
        onUndo={(t) => void undo.undo(t)}
        onExpire={undo.expire}
      />
    </main>
  );
}
