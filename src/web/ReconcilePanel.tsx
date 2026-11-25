import { useEffect, useState, type SubmitEvent } from 'react';
import type { AccountDto, ReconciliationPreviewDto } from '../shared/api.js';
import { formatCents } from '../shared/money.js';
import {
  emptyReconcileForm,
  parseSignedMoney,
  validateReconcileForm,
  type ReconcileFormValues,
} from './accountForms.js';
import { ApiError, NETWORK_ERROR, type ApiClient } from './api.js';
import { Field } from './Field.js';
import { KIND_LABELS } from './labels.js';
import { formatDate } from './months.js';

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

/** Wording of the signed difference (bank minus app). */
export function differenceText(differenceCents: number): string {
  if (differenceCents === 0) {
    return 'Coinciden: no hay diferencia.';
  }
  return differenceCents > 0
    ? `El banco tiene ${formatCents(differenceCents)} más que la app.`
    : `El banco tiene ${formatCents(-differenceCents)} menos que la app.`;
}

/** "Conciliar": compare the account with the bank's real balance at a date and keep a record. */
export function ReconcilePanel(props: {
  api: ApiClient;
  account: AccountDto;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { api, account } = props;
  const [values, setValues] = useState<ReconcileFormValues>(emptyReconcileForm());
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [preview, setPreview] = useState<ReconciliationPreviewDto | undefined>();
  const [busy, setBusy] = useState(false);

  // The app's own figures at the chosen date; they do not depend on the bank balance.
  const validDate = validateReconcileForm({ bankBalance: '0', date: values.date }, account);
  const previewDate = validDate.ok ? values.date : undefined;
  useEffect(() => {
    if (previewDate === undefined) {
      return;
    }
    let active = true;
    api.reconciliationPreview(account.id, previewDate).then(
      (p) => {
        if (active) {
          setPreview(p);
          setFormError(undefined);
        }
      },
      (error: unknown) => {
        if (active) {
          setPreview(undefined);
          setFormError(messageOf(error));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [api, account.id, previewDate]);

  const bank = parseSignedMoney(values.bankBalance);
  const shown = previewDate === undefined ? undefined : preview;
  const difference =
    shown !== undefined && bank.ok && values.bankBalance.trim() !== ''
      ? bank.cents - shown.appBalanceCents
      : undefined;

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const checked = validateReconcileForm(values, account);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    setFormError(undefined);
    try {
      await api.createReconciliation(account.id, checked.payload);
      props.onSaved();
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        setErrors(error.fields);
      }
      setFormError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="movement-form" onSubmit={(e) => void submit(e)} noValidate>
      <p className="hint">
        Compara el saldo de «{account.name}» con el saldo real que te da el banco. La app nunca crea
        ajustes automáticos: si hay diferencia, la corriges tú editando o añadiendo movimientos.
      </p>
      <div className="form-grid">
        <Field id="reconcile-bank" label="Saldo real del banco" error={errors.bankBalance}>
          <input
            id="reconcile-bank"
            type="text"
            inputMode="decimal"
            value={values.bankBalance}
            onChange={(e) => {
              setValues({ ...values, bankBalance: e.target.value });
            }}
          />
        </Field>
        <Field id="reconcile-date" label="Fecha del saldo del banco" error={errors.date}>
          <input
            id="reconcile-date"
            type="date"
            value={values.date}
            onChange={(e) => {
              setValues({ ...values, date: e.target.value });
            }}
          />
        </Field>
      </div>

      {shown !== undefined && (
        <section aria-label="Resultado de la conciliación" className="reconcile-result">
          <p>
            Saldo de la app a esa fecha: <strong>{formatCents(shown.appBalanceCents)}</strong>
          </p>
          {difference !== undefined && (
            <p role="status">
              Diferencia (banco menos app): <strong>{formatCents(difference)}</strong>.{' '}
              {differenceText(difference)}
            </p>
          )}
          <h3>
            {shown.last === null
              ? 'Movimientos y transferencias de la cuenta'
              : `Movimientos y transferencias desde la última conciliación (${formatDate(shown.last.date)})`}
          </h3>
          {shown.movements.length === 0 && shown.transfers.length === 0 ? (
            <p className="empty">No hay ninguno en ese periodo.</p>
          ) : (
            <ul className="reconcile-list">
              {shown.movements.map((m) => (
                <li key={`m${String(m.id)}`}>
                  {formatDate(m.date)} · {KIND_LABELS[m.kind]} · {m.concept} ·{' '}
                  {formatCents(m.amountCents)}
                </li>
              ))}
              {shown.transfers.map((t) => (
                <li key={`t${String(t.id)}`}>
                  {formatDate(t.date)} · Transferencia ·{' '}
                  {t.fromAccountId === account.id ? 'sale' : 'entra'} {formatCents(t.amountCents)}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {formError !== undefined && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={busy}>
          Guardar conciliación
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
