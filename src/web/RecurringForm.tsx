import type { SubmitEvent } from 'react';
import type { CategoryDto, DebtDto } from '../shared/api.js';
import { KINDS, type Kind } from '../shared/constants.js';
import { Field } from './Field.js';
import { KIND_LABELS } from './labels.js';
import {
  validateRecurringForm,
  type RecurringField,
  type RecurringFormValues,
  type RecurringPayload,
} from './recurringForm.js';

export type RecurringErrors = Partial<Record<RecurringField, string>>;

interface Props {
  values: RecurringFormValues;
  categories: CategoryDto[];
  /** Debts an installment item can be linked to. */
  debts?: Pick<DebtDto, 'id' | 'name'>[];
  errors: RecurringErrors;
  formError?: string | undefined;
  editing: boolean;
  busy?: boolean;
  onChange: (values: RecurringFormValues) => void;
  onSubmit: (payload: RecurringPayload) => void;
  onInvalid: (errors: RecurringErrors) => void;
  onCancel: () => void;
}

export function RecurringForm(props: Props) {
  const { values, categories, errors, editing } = props;
  const options = categories.filter((c) => c.kind === values.kind);
  const debts = props.debts ?? [];
  // A repayment may pay the installments of a debt.
  const showDebt = values.kind === 'repayment' && (debts.length > 0 || values.debtId !== '');

  const set = <K extends keyof RecurringFormValues>(key: K, value: RecurringFormValues[K]) => {
    props.onChange({ ...values, [key]: value });
  };
  const describe = (field: RecurringField) =>
    errors[field] === undefined ? undefined : `recurring-${field}-error`;

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const result = validateRecurringForm(values);
    if (result.ok) {
      props.onSubmit(result.payload);
    } else {
      props.onInvalid(result.errors);
    }
  };

  return (
    <form className="movement-form" onSubmit={submit} noValidate>
      <h2>{editing ? 'Editar fijo' : 'Añadir fijo'}</h2>
      <div className="form-grid">
        <Field id="recurring-kind" label="Tipo" error={errors.kind}>
          <select
            id="recurring-kind"
            value={values.kind}
            aria-describedby={describe('kind')}
            onChange={(e) => {
              props.onChange({
                ...values,
                kind: e.target.value as Kind,
                categoryId: '',
                debtId: '',
              });
            }}
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="recurring-categoryId" label="Categoría" error={errors.categoryId}>
          <select
            id="recurring-categoryId"
            value={values.categoryId}
            aria-describedby={describe('categoryId')}
            onChange={(e) => {
              set('categoryId', e.target.value);
            }}
          >
            <option value="">Elige una categoría</option>
            {options.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        {showDebt && (
          <Field id="recurring-debtId" label="Deuda (opcional)" error={errors.debtId}>
            <select
              id="recurring-debtId"
              value={values.debtId}
              aria-describedby={describe('debtId')}
              onChange={(e) => {
                set('debtId', e.target.value);
              }}
            >
              <option value="">Ninguna</option>
              {debts.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}
                </option>
              ))}
            </select>
            <span className="hint">
              Al confirmar cada mes, la parte de capital de la cuota reduce el saldo de la deuda.
            </span>
          </Field>
        )}
        <Field id="recurring-concept" label="Concepto" error={errors.concept}>
          <input
            id="recurring-concept"
            type="text"
            value={values.concept}
            aria-describedby={describe('concept')}
            onChange={(e) => {
              set('concept', e.target.value);
            }}
          />
        </Field>
        <Field id="recurring-amount" label="Importe previsto (€)" error={errors.amount}>
          <input
            id="recurring-amount"
            type="text"
            inputMode="decimal"
            placeholder="12,50"
            value={values.amount}
            aria-describedby={describe('amount')}
            onChange={(e) => {
              set('amount', e.target.value);
            }}
          />
        </Field>
        <Field id="recurring-expectedDay" label="Día del mes" error={errors.expectedDay}>
          <input
            id="recurring-expectedDay"
            type="text"
            inputMode="numeric"
            value={values.expectedDay}
            aria-describedby={describe('expectedDay')}
            onChange={(e) => {
              set('expectedDay', e.target.value);
            }}
          />
        </Field>
        <Field id="recurring-startMonth" label="Desde (mes)" error={errors.startMonth}>
          <input
            id="recurring-startMonth"
            type="month"
            value={values.startMonth}
            aria-describedby={describe('startMonth')}
            onChange={(e) => {
              set('startMonth', e.target.value);
            }}
          />
        </Field>
        <Field id="recurring-endMonth" label="Hasta (mes, opcional)" error={errors.endMonth}>
          <input
            id="recurring-endMonth"
            type="month"
            value={values.endMonth}
            aria-describedby={describe('endMonth')}
            onChange={(e) => {
              set('endMonth', e.target.value);
            }}
          />
        </Field>
        <Field id="recurring-notes" label="Notas" error={errors.notes}>
          <input
            id="recurring-notes"
            type="text"
            value={values.notes}
            aria-describedby={describe('notes')}
            onChange={(e) => {
              set('notes', e.target.value);
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
        <button type="submit" className="primary" disabled={props.busy ?? false}>
          Guardar fijo
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
