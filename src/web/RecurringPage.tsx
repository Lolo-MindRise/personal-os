import { useCallback, useEffect, useState } from 'react';
import type { CategoryDto, DebtDto, RecurringItemDto } from '../shared/api.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import { currentMonth, monthLabel } from './months.js';
import { RecurringForm, type RecurringErrors } from './RecurringForm.js';
import { RecurringList } from './RecurringList.js';
import {
  emptyRecurringForm,
  formFromItem,
  mapRecurringApiErrors,
  type RecurringFormValues,
  type RecurringPayload,
} from './recurringForm.js';

import { PageHeader } from './PageHeader.js';

const defaultApi = createApiClient();

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

/** The "Fijos" screen: define fixed income and expenses once (ADR-0005). */
export function RecurringPage({ api = defaultApi }: { api?: ApiClient }) {
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [debts, setDebts] = useState<DebtDto[]>([]);
  const [items, setItems] = useState<RecurringItemDto[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [reloads, setReloads] = useState(0);

  const [form, setForm] = useState<RecurringFormValues>(() => emptyRecurringForm());
  const [editingId, setEditingId] = useState<number | undefined>();
  const [errors, setErrors] = useState<RecurringErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

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
    api.recurringItems().then(
      (rows) => {
        if (active) {
          setItems(rows);
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
  }, [api, reloads]);

  const reload = useCallback(() => {
    setReloads((n) => n + 1);
  }, []);

  const resetForm = () => {
    setForm(emptyRecurringForm());
    setEditingId(undefined);
    setErrors({});
    setFormError(undefined);
  };

  const save = async (payload: RecurringPayload) => {
    setBusy(true);
    setFormError(undefined);
    setErrors({});
    try {
      if (editingId === undefined) {
        await api.createRecurring(payload);
      } else {
        await api.updateRecurring(editingId, payload);
      }
      resetForm();
      reload();
    } catch (error) {
      const fields = error instanceof ApiError ? error.fields : {};
      const mapped = mapRecurringApiErrors(fields);
      setErrors(mapped);
      // Without a field to blame (or a network failure), show the message on the form.
      setFormError(Object.keys(mapped).length === 0 ? messageOf(error) : undefined);
    } finally {
      setBusy(false);
    }
  };

  const edit = (item: RecurringItemDto) => {
    setForm(formFromItem(item));
    setEditingId(item.id);
    setErrors({});
    setFormError(undefined);
  };

  /** Ends an item this month (or its start month, if that is later). */
  const end = async (item: RecurringItemDto) => {
    const endMonth = currentMonth() > item.startMonth ? currentMonth() : item.startMonth;
    const question = `¿Terminar «${item.concept}» en ${monthLabel(endMonth)}? Dejará de aparecer como pendiente a partir del mes siguiente.`;
    if (!window.confirm(question)) {
      return;
    }
    try {
      await api.updateRecurring(item.id, { endMonth });
      reload();
    } catch (error) {
      setLoadError(messageOf(error));
    }
  };

  return (
    <main className="page">
      <PageHeader title="Fijos" />
      <p className="hint">
        Ingresos y gastos que se repiten cada mes. Cada mes aparecen como pendientes en
        «Movimientos» y los confirmas cuando se pagan o se cobran.
      </p>

      {loadError !== undefined && (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}

      <RecurringForm
        values={form}
        categories={categories}
        debts={debts}
        errors={errors}
        formError={formError}
        editing={editingId !== undefined}
        busy={busy}
        onChange={(values) => {
          setForm(values);
          setErrors({});
        }}
        onSubmit={(payload) => void save(payload)}
        onInvalid={setErrors}
        onCancel={resetForm}
      />

      <RecurringList items={items} debts={debts} onEdit={edit} onEnd={(item) => void end(item)} />
    </main>
  );
}
