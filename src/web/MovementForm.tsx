import type { SubmitEvent } from 'react';
import type { AccountDto, CategoryDto, DebtDto } from '../shared/api.js';
import { DEFAULT_ACCOUNT_ID, KINDS, type Kind } from '../shared/constants.js';
import { Field } from './Field.js';
import { KIND_LABELS } from './labels.js';
import {
  commitTagDraft,
  removeTag,
  validateMovementForm,
  type MovementField,
  type MovementFormValues,
  type MovementPayload,
} from './movementForm.js';

export type FieldErrors = Partial<Record<MovementField, string>>;

/**
 * - add: a new free movement.
 * - edit: changing a saved movement.
 * - confirm: confirming a pending fixed item; kind and category come from the
 *   item, so they cannot be changed here.
 */
export type FormMode = 'add' | 'edit' | 'confirm';

const TITLES: Record<FormMode, string> = {
  add: 'Añadir movimiento',
  edit: 'Editar movimiento',
  confirm: 'Confirmar fijo',
};

const SUBMIT_LABELS: Record<FormMode, string> = {
  add: 'Guardar movimiento',
  edit: 'Guardar movimiento',
  confirm: 'Confirmar fijo',
};

interface Props {
  values: MovementFormValues;
  categories: CategoryDto[];
  /** Debts a repayment can be linked to. */
  debts?: Pick<DebtDto, 'id' | 'name'>[];
  /** Accounts a movement can belong to; the selector is hidden while there are none. */
  accounts?: Pick<AccountDto, 'id' | 'name'>[];
  /** Errors to show next to each field (client-side or returned by the API). */
  /** Names of the existing tags, offered while typing. */
  tagNames?: string[];
  errors: FieldErrors;
  /** Message not tied to a field (for example a network failure). */
  formError?: string | undefined;
  mode: FormMode;
  busy?: boolean;
  onChange: (values: MovementFormValues) => void;
  onSubmit: (payload: MovementPayload) => void;
  onInvalid: (errors: FieldErrors) => void;
  onCancel: () => void;
}

export function MovementForm(props: Props) {
  const { values, categories, errors, mode } = props;
  const options = categories.filter((c) => c.kind === values.kind);
  const locked = mode === 'confirm';
  const debts = props.debts ?? [];
  const accounts = props.accounts ?? [];
  // A repayment may be linked to a debt (not while confirming a fixed item: it has no debt).
  const showDebt =
    values.kind === 'repayment' && !locked && (debts.length > 0 || values.debtId !== '');

  const set = <K extends keyof MovementFormValues>(key: K, value: MovementFormValues[K]) => {
    props.onChange({ ...values, [key]: value });
  };
  const describe = (field: MovementField) =>
    errors[field] === undefined ? undefined : `movement-${field}-error`;

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const result = validateMovementForm(values);
    if (result.ok) {
      props.onSubmit(result.payload);
    } else {
      props.onInvalid(result.errors);
    }
  };

  return (
    <form className="movement-form" onSubmit={submit} noValidate>
      <h2>{TITLES[mode]}</h2>
      <div className="form-grid">
        <Field id="movement-date" label="Fecha" error={errors.date}>
          <input
            id="movement-date"
            type="date"
            value={values.date}
            aria-describedby={describe('date')}
            onChange={(e) => {
              set('date', e.target.value);
            }}
          />
        </Field>
        <Field id="movement-kind" label="Tipo" error={errors.kind}>
          <select
            id="movement-kind"
            value={values.kind}
            disabled={locked}
            aria-describedby={describe('kind')}
            onChange={(e) => {
              // The category list depends on the kind, so a stale category is cleared.
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
        <Field id="movement-categoryId" label="Categoría" error={errors.categoryId}>
          <select
            id="movement-categoryId"
            value={values.categoryId}
            disabled={locked}
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
        {accounts.length > 0 && (
          <Field id="movement-accountId" label="Cuenta" error={errors.accountId}>
            <select
              id="movement-accountId"
              value={
                values.accountId === undefined || values.accountId === ''
                  ? String(DEFAULT_ACCOUNT_ID)
                  : values.accountId
              }
              aria-describedby={describe('accountId')}
              onChange={(e) => {
                set('accountId', e.target.value);
              }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {showDebt && (
          <Field id="movement-debtId" label="Deuda (opcional)" error={errors.debtId}>
            <select
              id="movement-debtId"
              value={values.debtId}
              aria-describedby={describe('debtId')}
              onChange={(e) => {
                set('debtId', e.target.value);
              }}
            >
              <option value="">Sin deuda</option>
              {debts.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field id="movement-concept" label="Concepto" error={errors.concept}>
          <input
            id="movement-concept"
            type="text"
            value={values.concept}
            aria-describedby={describe('concept')}
            onChange={(e) => {
              set('concept', e.target.value);
            }}
          />
        </Field>
        <Field id="movement-amount" label="Importe (€)" error={errors.amount}>
          <input
            id="movement-amount"
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
        <Field id="movement-notes" label="Notas" error={errors.notes}>
          <input
            id="movement-notes"
            type="text"
            value={values.notes}
            aria-describedby={describe('notes')}
            onChange={(e) => {
              set('notes', e.target.value);
            }}
          />
        </Field>
        {!locked && (
          <Field id="movement-tagDraft" label="Marcas" error={errors.tags}>
            <div className="tag-input">
              {(values.tags ?? []).length > 0 && (
                <ul className="tag-chips" aria-label="Marcas del movimiento">
                  {(values.tags ?? []).map((t) => (
                    <li key={t} className="tag-chip">
                      {t}
                      <button
                        type="button"
                        aria-label={`Quitar la marca ${t}`}
                        onClick={() => {
                          props.onChange(removeTag(values, t));
                        }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                id="movement-tagDraft"
                type="text"
                list="movement-tag-options"
                placeholder="Escribe y pulsa Intro o coma"
                value={values.tagDraft ?? ''}
                aria-describedby={describe('tags')}
                onChange={(e) => {
                  // A comma ends the tag being typed.
                  const next = { ...values, tagDraft: e.target.value };
                  props.onChange(e.target.value.includes(',') ? commitTagDraft(next) : next);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // Enter adds the tag; it must not save the movement.
                    e.preventDefault();
                    props.onChange(commitTagDraft(values));
                  }
                }}
              />
              <datalist id="movement-tag-options">
                {(props.tagNames ?? []).map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
          </Field>
        )}
      </div>
      {props.formError !== undefined && (
        <p className="form-error" role="alert">
          {props.formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={props.busy ?? false}>
          {SUBMIT_LABELS[mode]}
        </button>
        {mode !== 'add' && (
          <button type="button" onClick={props.onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
