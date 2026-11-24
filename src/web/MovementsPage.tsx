import { useCallback, useEffect, useState } from 'react';
import type { CategoryDto, MonthSummaryDto, MovementDto } from '../shared/api.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import { MovementForm, type FieldErrors } from './MovementForm.js';
import { MovementList } from './MovementList.js';
import {
  emptyForm,
  formFromMovement,
  mapApiFieldErrors,
  type MovementFormValues,
  type MovementPayload,
} from './movementForm.js';
import { currentMonth, monthLabel, shiftMonth } from './months.js';
import { SummaryBar } from './SummaryBar.js';

const defaultApi = createApiClient();

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

export function MovementsPage({ api = defaultApi }: { api?: ApiClient }) {
  const [month, setMonth] = useState(currentMonth);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [movements, setMovements] = useState<MovementDto[]>([]);
  const [summary, setSummary] = useState<MonthSummaryDto | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [reloads, setReloads] = useState(0);

  const [form, setForm] = useState<MovementFormValues>(() => emptyForm());
  const [editingId, setEditingId] = useState<number | undefined>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.categories().then(setCategories, (error: unknown) => {
      setLoadError(messageOf(error));
    });
  }, [api]);

  useEffect(() => {
    let active = true;
    Promise.all([api.movements(month), api.summary(month)]).then(
      ([rows, totals]) => {
        if (active) {
          setMovements(rows);
          setSummary(totals);
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
    setFieldErrors({});
    setFormError(undefined);
  };

  const save = async (payload: MovementPayload) => {
    setBusy(true);
    setFormError(undefined);
    setFieldErrors({});
    try {
      if (editingId === undefined) {
        await api.createMovement(payload);
      } else {
        await api.updateMovement(editingId, payload);
      }
      resetForm();
      reload();
    } catch (error) {
      setFieldErrors(error instanceof ApiError ? mapApiFieldErrors(error.fields) : {});
      setFormError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const edit = (movement: MovementDto) => {
    setForm(formFromMovement(movement));
    setEditingId(movement.id);
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

  return (
    <main className="page">
      <h1>Movimientos</h1>

      <nav className="month-picker" aria-label="Mes">
        <button
          type="button"
          aria-label="Mes anterior"
          onClick={() => {
            setMonth(shiftMonth(month, -1));
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
              setMonth(e.target.value);
            }
          }}
        />
        <button
          type="button"
          aria-label="Mes siguiente"
          onClick={() => {
            setMonth(shiftMonth(month, 1));
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

      <MovementForm
        values={form}
        categories={categories}
        errors={fieldErrors}
        formError={formError}
        editing={editingId !== undefined}
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
