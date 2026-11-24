import { useEffect, useState, type SubmitEvent } from 'react';
import type { DebtDto } from '../shared/api.js';
import { formatRate } from '../shared/debts.js';
import { formatCents } from '../shared/money.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import {
  applyDebtChange,
  emptyDebtForm,
  formFromDebt,
  mapDebtApiErrors,
  validateDebtForm,
  type DebtField,
  type DebtFormValues,
} from './debtForm.js';
import { Field } from './Field.js';
import { formatDate } from './months.js';

import { FilterBar, PageHeader } from './PageHeader.js';
import { hrefFor, useRoute } from './router.js';

const defaultApi = createApiClient();

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

type Errors = Partial<Record<DebtField, string>>;

export function DebtList({ debts, onEdit }: { debts: DebtDto[]; onEdit: (debt: DebtDto) => void }) {
  if (debts.length === 0) {
    return <p className="empty">Todavía no hay deudas. Añade la primera arriba.</p>;
  }
  return (
    <div className="debt-list">
      {debts.map((debt) => (
        <section key={debt.id} className="debt-card" aria-label={debt.name}>
          <div className="section-header">
            <h2>{debt.name}</h2>
            <a href={hrefFor('movements', { debt: String(debt.id) })}>Ver movimientos vinculados</a>
            <button
              type="button"
              onClick={() => {
                onEdit(debt);
              }}
            >
              Editar
            </button>
          </div>
          <dl className="debt-facts">
            <div>
              <dt>Saldo estimado hoy</dt>
              <dd className="debt-estimate">{formatCents(debt.estimatedBalanceCents)}</dd>
            </div>
            <div>
              <dt>Saldo registrado</dt>
              <dd>
                {formatCents(debt.balanceCents)}
                <span className="notes">a fecha {formatDate(debt.balanceAsOf)}</span>
              </dd>
            </div>
            <div>
              <dt>Cuota mensual</dt>
              <dd>{formatCents(debt.monthlyPaymentCents)}</dd>
            </div>
            <div>
              <dt>Cuotas restantes</dt>
              <dd>{debt.remainingInstallments}</dd>
            </div>
            <div>
              <dt>Interés anual</dt>
              <dd>{formatRate(debt.annualRateBps)}</dd>
            </div>
            <div>
              <dt>Capital amortizado en cuotas</dt>
              <dd>{formatCents(debt.principalPaidCents)}</dd>
            </div>
            <div>
              <dt>Intereses pagados en cuotas</dt>
              <dd data-testid="interest-paid">{formatCents(debt.interestPaidCents)}</dd>
            </div>
            <div>
              <dt>Amortizado con extras</dt>
              <dd>{formatCents(debt.repaidSinceCents)}</dd>
            </div>
          </dl>
          {debt.notes !== null && <p className="notes">{debt.notes}</p>}
          {debt.installments.length === 0 ? (
            <p className="notes">
              Sin cuotas confirmadas desde esa fecha. Vincula un fijo de tipo «Amortización» a esta
              deuda en «Fijos» y confírmalo cada mes.
            </p>
          ) : (
            <details>
              <summary>Cuotas confirmadas ({debt.installments.length})</summary>
              <ul className="debt-repayments">
                {debt.installments.map((i) => (
                  <li key={i.movementId}>
                    {formatDate(i.date)} · {formatCents(i.paidCents)}: intereses{' '}
                    {formatCents(i.interestCents)}, capital {formatCents(i.principalCents)} · saldo{' '}
                    {formatCents(i.balanceAfterCents)}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {debt.repayments.length === 0 ? (
            <p className="notes">Sin amortizaciones extra vinculadas.</p>
          ) : (
            <details>
              <summary>Amortizaciones extra vinculadas ({debt.repayments.length})</summary>
              <ul className="debt-repayments">
                {debt.repayments.map((r) => (
                  <li key={r.movementId}>
                    {formatDate(r.date)} · {r.concept} · {formatCents(r.amountCents)}
                    {r.date <= debt.balanceAsOf && (
                      <span className="notes">
                        {' '}
                        (anterior al saldo registrado: no se descuenta)
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ))}
    </div>
  );
}

export function DebtForm(props: {
  values: DebtFormValues;
  errors: Errors;
  formError: string | undefined;
  editing: boolean;
  busy: boolean;
  onChange: (values: DebtFormValues) => void;
  onSubmit: (values: DebtFormValues) => void;
  onCancel: () => void;
}) {
  const { values, errors, editing } = props;
  const describe = (field: DebtField) =>
    errors[field] === undefined ? undefined : `debt-${field}-error`;
  const set = (field: DebtField, value: string) => {
    props.onChange({ ...values, [field]: value });
  };
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    props.onSubmit(values);
  };
  const text = (
    field: DebtField,
    label: string,
    extra: { type?: string; inputMode?: 'decimal' | 'numeric'; placeholder?: string } = {},
  ) => (
    <Field id={`debt-${field}`} label={label} error={errors[field]}>
      <input
        id={`debt-${field}`}
        type={extra.type ?? 'text'}
        inputMode={extra.inputMode}
        placeholder={extra.placeholder}
        value={values[field]}
        aria-describedby={describe(field)}
        onChange={(e) => {
          set(field, e.target.value);
        }}
      />
    </Field>
  );
  return (
    <form className="movement-form" onSubmit={submit} noValidate>
      <h2>{editing ? 'Editar deuda' : 'Añadir deuda'}</h2>
      {editing && (
        <p className="hint form-hint">
          Si cambias el saldo, la fecha del saldo pasa a ser la de hoy (puedes corregirla). Las
          amortizaciones extra anteriores a esa fecha ya no se descuentan.
        </p>
      )}
      <div className="form-grid">
        {text('name', 'Nombre')}
        {text('balance', 'Saldo pendiente (€)', { inputMode: 'decimal', placeholder: '3.000,00' })}
        {text('balanceAsOf', 'Saldo a fecha de', { type: 'date' })}
        {text('monthlyPayment', 'Cuota mensual (€)', {
          inputMode: 'decimal',
          placeholder: '150,00',
        })}
        {text('remainingInstallments', 'Cuotas restantes', { inputMode: 'numeric' })}
        {text('rate', 'Interés anual (%)', { inputMode: 'decimal', placeholder: '6,5' })}
        {text('notes', 'Notas')}
      </div>
      {props.formError !== undefined && (
        <p className="form-error" role="alert">
          {props.formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={props.busy}>
          {editing ? 'Guardar cambios' : 'Añadir'}
        </button>
        {editing && (
          <button type="button" onClick={props.onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

/** The "Deudas" screen: list, add and edit debts with their estimated current balance. */
export function DebtsPage({ api = defaultApi }: { api?: ApiClient }) {
  const [debts, setDebts] = useState<DebtDto[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [reloads, setReloads] = useState(0);
  // `#/debts?debt=3` shows only that debt (opened from the dashboard).
  const { params } = useRoute();
  const onlyDebt = debts.find((d) => String(d.id) === params.debt);

  const [form, setForm] = useState<DebtFormValues>(() => emptyDebtForm());
  const [editing, setEditing] = useState<DebtDto | undefined>();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.debts().then(
      (rows) => {
        if (active) {
          setDebts(rows);
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

  const resetForm = () => {
    setForm(emptyDebtForm());
    setEditing(undefined);
    setErrors({});
    setFormError(undefined);
  };

  const submit = async (values: DebtFormValues) => {
    const result = validateDebtForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setBusy(true);
    setErrors({});
    setFormError(undefined);
    try {
      if (editing === undefined) {
        await api.createDebt(result.payload);
      } else {
        await api.updateDebt(editing.id, result.payload);
      }
      resetForm();
      setReloads((n) => n + 1);
    } catch (error) {
      const mapped = mapDebtApiErrors(error instanceof ApiError ? error.fields : {});
      setErrors(mapped);
      setFormError(Object.keys(mapped).length === 0 ? messageOf(error) : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <PageHeader title="Deudas" />
      <p className="hint">
        El saldo estimado parte del saldo registrado y descuenta, por orden de fecha y solo desde la
        fecha del saldo, la parte de capital de cada cuota confirmada (cuota menos intereses, con el
        interés anual de la deuda) y las amortizaciones extra vinculadas. Para que una cuota cuente,
        vincula el fijo a la deuda en «Fijos»; para una extra, elige la deuda al añadir el
        movimiento de tipo «Amortización». Actualiza el saldo cuando conozcas el real.
      </p>

      {loadError !== undefined && (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}

      <DebtForm
        values={form}
        errors={errors}
        formError={formError}
        editing={editing !== undefined}
        busy={busy}
        onChange={(next) => {
          setForm((current) =>
            applyDebtChange(
              current,
              next,
              editing === undefined ? undefined : formFromDebt(editing),
            ),
          );
          setErrors({});
          setFormError(undefined);
        }}
        onSubmit={(values) => void submit(values)}
        onCancel={resetForm}
      />

      {onlyDebt !== undefined && (
        <FilterBar
          label={`deuda ${onlyDebt.name}`}
          clearHref={hrefFor('debts')}
          clearLabel="Ver todas las deudas"
        />
      )}

      <DebtList
        debts={onlyDebt === undefined ? debts : [onlyDebt]}
        onEdit={(debt) => {
          setForm(formFromDebt(debt));
          setEditing(debt);
          setErrors({});
          setFormError(undefined);
        }}
      />
    </main>
  );
}
