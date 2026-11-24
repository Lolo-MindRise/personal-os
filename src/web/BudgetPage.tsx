import { useEffect, useState, type SubmitEvent } from 'react';
import type { BudgetMonthDto, CategoryDto } from '../shared/api.js';
import { formatCents } from '../shared/money.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import {
  differenceTone,
  emptyBudgetForm,
  mapBudgetApiErrors,
  validateBudgetForm,
  type BudgetField,
  type BudgetFormValues,
} from './budgetForm.js';
import { Field } from './Field.js';
import { KIND_LABELS } from './labels.js';
import { MonthPicker } from './MonthPicker.js';
import { currentMonth, formatMonth } from './months.js';

const defaultApi = createApiClient();

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

type Errors = Partial<Record<BudgetField, string>>;

const signed = (cents: number) => formatCents(cents);

export function BudgetTable({
  data,
  onChange,
}: {
  data: BudgetMonthDto;
  onChange: (categoryId: number) => void;
}) {
  if (data.rows.length === 0) {
    return <p className="empty">No hay categorías de gasto. Créalas en «Categorías».</p>;
  }
  const { totals } = data;
  return (
    <table className="movements budget">
      <thead>
        <tr>
          <th>Categoría</th>
          <th className="amount">Presupuesto</th>
          <th className="amount">Real</th>
          <th className="amount">Diferencia</th>
          <th>
            <span className="visually-hidden">Acciones</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row) => (
          <tr key={row.categoryId}>
            <td>
              {row.categoryName}
              {row.kind !== 'expense' && <span className="notes">{KIND_LABELS[row.kind]}</span>}
            </td>
            <td className="amount">
              {row.budgetCents === null ? (
                <span className="muted">Sin presupuesto</span>
              ) : (
                <>
                  {formatCents(row.budgetCents)}
                  {row.budgetFrom !== null && (
                    <span className="notes">desde {formatMonth(row.budgetFrom)}</span>
                  )}
                </>
              )}
            </td>
            <td className="amount">{formatCents(row.actualCents)}</td>
            <td className={`amount diff-${differenceTone(row.differenceCents)}`}>
              {row.differenceCents === null ? '—' : signed(row.differenceCents)}
            </td>
            <td className="actions">
              <button
                type="button"
                onClick={() => {
                  onChange(row.categoryId);
                }}
              >
                {row.budgetCents === null ? 'Fijar' : 'Cambiar'}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Total</th>
          <td className="amount">{formatCents(totals.budgetCents)}</td>
          <td className="amount">{formatCents(totals.actualCents)}</td>
          <td className={`amount diff-${differenceTone(totals.differenceCents)}`}>
            {signed(totals.differenceCents)}
          </td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}

export function BudgetForm(props: {
  values: BudgetFormValues;
  categories: CategoryDto[];
  errors: Errors;
  formError: string | undefined;
  busy: boolean;
  onChange: (values: BudgetFormValues) => void;
  onSubmit: (values: BudgetFormValues) => void;
}) {
  const { values, errors } = props;
  const describe = (field: BudgetField) =>
    errors[field] === undefined ? undefined : `budget-${field}-error`;
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    props.onSubmit(values);
  };
  return (
    <form className="movement-form" onSubmit={submit} noValidate>
      <h2>Cambiar presupuesto</h2>
      <p className="hint form-hint">
        El nuevo importe se aplica desde el mes elegido en adelante. Los meses anteriores no
        cambian.
      </p>
      <div className="form-grid">
        <Field id="budget-categoryId" label="Categoría" error={errors.categoryId}>
          <select
            id="budget-categoryId"
            value={values.categoryId}
            aria-describedby={describe('categoryId')}
            onChange={(e) => {
              props.onChange({ ...values, categoryId: e.target.value });
            }}
          >
            <option value="">Elige una categoría</option>
            {props.categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="budget-amount" label="Presupuesto mensual (€)" error={errors.amount}>
          <input
            id="budget-amount"
            type="text"
            inputMode="decimal"
            placeholder="350,00"
            value={values.amount}
            aria-describedby={describe('amount')}
            onChange={(e) => {
              props.onChange({ ...values, amount: e.target.value });
            }}
          />
        </Field>
        <Field id="budget-validFrom" label="Desde (mes)" error={errors.validFrom}>
          <input
            id="budget-validFrom"
            type="month"
            value={values.validFrom}
            aria-describedby={describe('validFrom')}
            onChange={(e) => {
              props.onChange({ ...values, validFrom: e.target.value });
            }}
          />
        </Field>
      </div>
      {props.formError !== undefined && (
        <p className="form-error" role="alert">
          {props.formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={props.busy}>
          Guardar presupuesto
        </button>
      </div>
    </form>
  );
}

/** The "Presupuesto" screen: budget in effect vs. confirmed spending, per category and month. */
export function BudgetPage({ api = defaultApi }: { api?: ApiClient }) {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<BudgetMonthDto | undefined>();
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [reloads, setReloads] = useState(0);

  const [form, setForm] = useState<BudgetFormValues>(() => emptyBudgetForm(currentMonth()));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.categories().then(setCategories, (error: unknown) => {
      setLoadError(messageOf(error));
    });
  }, [api]);

  useEffect(() => {
    let active = true;
    api.budget(month).then(
      (next) => {
        if (active) {
          setData(next);
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

  const changeMonth = (next: string) => {
    setMonth(next);
    setForm((current) => ({ ...current, validFrom: next }));
  };

  const submit = async (values: BudgetFormValues) => {
    const result = validateBudgetForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setBusy(true);
    setErrors({});
    setFormError(undefined);
    try {
      await api.addBudgetLine(result.payload);
      setForm(emptyBudgetForm(month));
      setReloads((n) => n + 1);
    } catch (error) {
      const mapped = mapBudgetApiErrors(error instanceof ApiError ? error.fields : {});
      setErrors(mapped);
      // A duplicate month comes back as a plain 409 message: show it under the form.
      setFormError(Object.keys(mapped).length === 0 ? messageOf(error) : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <h1>Presupuesto</h1>
      <p className="hint">
        Presupuesto vigente en el mes frente a lo gastado y confirmado. Diferencia = presupuesto −
        real: en rojo, te has pasado.
      </p>

      <MonthPicker month={month} onChange={changeMonth} />

      {loadError !== undefined && (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}

      <BudgetForm
        values={form}
        categories={categories}
        errors={errors}
        formError={formError}
        busy={busy}
        onChange={(values) => {
          setForm(values);
          setErrors({});
        }}
        onSubmit={(values) => void submit(values)}
      />

      {data !== undefined && (
        <BudgetTable
          data={data}
          onChange={(categoryId) => {
            setForm({ ...form, categoryId: String(categoryId), validFrom: month });
            setErrors({});
            setFormError(undefined);
          }}
        />
      )}
    </main>
  );
}
