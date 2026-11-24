import { useCallback, useEffect, useState } from 'react';
import type { CategoryDto, MonthSummaryDto, MovementDto, PendingEntryDto } from '../shared/api.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import { MovementForm, type FieldErrors, type FormMode } from './MovementForm.js';
import { MovementList } from './MovementList.js';
import {
  emptyForm,
  formFromEntry,
  formFromMovement,
  mapApiFieldErrors,
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

export function MovementsPage({ api = defaultApi }: { api?: ApiClient }) {
  const [month, setMonth] = useState(currentMonth);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [movements, setMovements] = useState<MovementDto[]>([]);
  const [pending, setPending] = useState<PendingEntryDto[]>([]);
  const [skipped, setSkipped] = useState<PendingEntryDto[]>([]);
  const [summary, setSummary] = useState<MonthSummaryDto | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [reloads, setReloads] = useState(0);

  const [form, setForm] = useState<MovementFormValues>(() => emptyForm());
  const [editingId, setEditingId] = useState<number | undefined>();
  /** The recurring item being confirmed through the form, if any. */
  const [confirmingId, setConfirmingId] = useState<number | undefined>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const mode: FormMode =
    confirmingId !== undefined ? 'confirm' : editingId !== undefined ? 'edit' : 'add';

  useEffect(() => {
    api.categories().then(setCategories, (error: unknown) => {
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
        await api.updateMovement(editingId, payload);
      }
      resetForm();
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

  /** Runs a pending-section action, then refreshes everything. */
  const act = async (action: () => Promise<unknown>, entry?: PendingEntryDto) => {
    setBusy(true);
    try {
      await action();
      // Skipping the entry that is being confirmed cancels the confirmation.
      if (entry !== undefined && entry.recurringItemId === confirmingId) {
        resetForm();
      }
    } catch (error) {
      setLoadError(messageOf(error));
    } finally {
      setBusy(false);
      reload();
    }
  };

  return (
    <main className="page">
      <h1>Movimientos</h1>

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

      {summary !== undefined && <SummaryBar summary={summary} />}

      <PendingList
        pending={pending}
        skipped={skipped}
        busy={busy}
        onConfirm={confirm}
        onSkip={(entry) => void act(() => api.skipRecurring(entry.recurringItemId, month), entry)}
        onUndo={(entry) => void act(() => api.undoSkip(entry.recurringItemId, month))}
        onConfirmAll={() => void act(() => api.confirmAll(month))}
      />

      <MovementForm
        values={form}
        categories={categories}
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
    </main>
  );
}
