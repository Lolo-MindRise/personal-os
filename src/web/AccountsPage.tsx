import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import type {
  AccountBalanceDto,
  AccountDto,
  ReconciliationDto,
  TransferDto,
} from '../shared/api.js';
import { ACCOUNT_TYPES, DEFAULT_ACCOUNT_ID, type AccountType } from '../shared/constants.js';
import { centsToInput, formatCents } from '../shared/money.js';
import {
  ACCOUNT_TYPE_LABELS,
  accountToForm,
  emptyAccountForm,
  emptyTransferForm,
  validateAccountForm,
  validateTransferForm,
  type AccountFormValues,
  type TransferFormValues,
} from './accountForms.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import { Field } from './Field.js';
import { formatDate } from './months.js';
import { PageHeader } from './PageHeader.js';
import { ReconcilePanel } from './ReconcilePanel.js';
import { deleteAccountConfirmText } from './reconcileView.js';
import { hrefFor } from './router.js';
import { SidePanel, usePanel } from './SidePanel.js';
import { UndoToast } from './UndoToast.js';
import { useUndo } from './useUndo.js';

const defaultApi = createApiClient();

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

type Errors = Record<string, string | undefined>;

export function AccountForm(props: {
  values: AccountFormValues;
  errors: Errors;
  busy: boolean;
  formError: string | undefined;
  onChange: (values: AccountFormValues) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { values, errors } = props;
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    props.onSubmit();
  };
  return (
    <form className="movement-form" onSubmit={submit} noValidate>
      <div className="form-grid">
        <Field id="account-name" label="Nombre" error={errors.name}>
          <input
            id="account-name"
            type="text"
            value={values.name}
            onChange={(e) => {
              props.onChange({ ...values, name: e.target.value });
            }}
          />
        </Field>
        <Field id="account-type" label="Tipo" error={undefined}>
          <select
            id="account-type"
            value={values.type}
            onChange={(e) => {
              props.onChange({ ...values, type: e.target.value as AccountType });
            }}
          >
            {ACCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {ACCOUNT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="account-opening-balance"
          label="Saldo inicial de la cuenta"
          error={errors.openingBalance}
        >
          <input
            id="account-opening-balance"
            type="text"
            inputMode="decimal"
            value={values.openingBalance}
            onChange={(e) => {
              props.onChange({ ...values, openingBalance: e.target.value });
            }}
          />
        </Field>
        <Field
          id="account-opening-date"
          label="Fecha del saldo inicial de la cuenta"
          error={errors.openingDate}
        >
          <input
            id="account-opening-date"
            type="date"
            value={values.openingDate}
            onChange={(e) => {
              props.onChange({ ...values, openingDate: e.target.value });
            }}
          />
        </Field>
      </div>
      <p className="hint">
        El saldo inicial es el que tiene la cuenta al terminar ese día: los movimientos y las
        transferencias cuentan a partir del día siguiente.
      </p>
      {props.formError !== undefined && (
        <p className="form-error" role="alert">
          {props.formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={props.busy}>
          Guardar cuenta
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function TransferForm(props: {
  values: TransferFormValues;
  errors: Errors;
  accounts: AccountDto[];
  busy: boolean;
  formError: string | undefined;
  onChange: (values: TransferFormValues) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { values, errors } = props;
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    props.onSubmit();
  };
  const accountSelect = (id: string, key: 'fromAccountId' | 'toAccountId') => (
    <select
      id={id}
      value={values[key]}
      onChange={(e) => {
        props.onChange({ ...values, [key]: e.target.value });
      }}
    >
      {props.accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} (saldo inicial: {formatDate(a.openingBalanceDate)})
        </option>
      ))}
    </select>
  );
  return (
    <form className="movement-form" onSubmit={submit} noValidate>
      <div className="form-grid">
        <Field id="transfer-date" label="Fecha" error={errors.date}>
          <input
            id="transfer-date"
            type="date"
            value={values.date}
            onChange={(e) => {
              props.onChange({ ...values, date: e.target.value });
            }}
          />
        </Field>
        <Field id="transfer-amount" label="Importe" error={errors.amount}>
          <input
            id="transfer-amount"
            type="text"
            inputMode="decimal"
            value={values.amount}
            onChange={(e) => {
              props.onChange({ ...values, amount: e.target.value });
            }}
          />
        </Field>
        <Field id="transfer-from" label="Cuenta de origen" error={errors.fromAccountId}>
          {accountSelect('transfer-from', 'fromAccountId')}
        </Field>
        <Field id="transfer-to" label="Cuenta de destino" error={errors.toAccountId}>
          {accountSelect('transfer-to', 'toAccountId')}
        </Field>
        <Field id="transfer-notes" label="Notas (opcional)" error={undefined}>
          <input
            id="transfer-notes"
            type="text"
            value={values.notes}
            onChange={(e) => {
              props.onChange({ ...values, notes: e.target.value });
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
          Guardar transferencia
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

type Panel =
  | { kind: 'account'; id: number | undefined }
  | { kind: 'transfer'; id: number | undefined }
  | { kind: 'reconcile'; id: number };

/** The "Cuentas" screen: balances, accounts and transfers between them. */
export function AccountsPage({ api = defaultApi }: { api?: ApiClient }) {
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [balances, setBalances] = useState<AccountBalanceDto[]>([]);
  const [transfers, setTransfers] = useState<TransferDto[]>([]);
  const [reconciliations, setReconciliations] = useState<ReconciliationDto[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [reloads, setReloads] = useState(0);

  const panel = usePanel();
  const [mode, setMode] = useState<Panel>({ kind: 'account', id: undefined });
  const [accountValues, setAccountValues] = useState(emptyAccountForm());
  const [transferValues, setTransferValues] = useState(emptyTransferForm([]));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.accounts(),
      api.accountBalances(),
      api.transfers(),
      api.reconciliations(),
    ]).then(
      ([a, b, t, r]) => {
        if (active) {
          setAccounts(a);
          setBalances(b);
          setTransfers(t);
          setReconciliations(r);
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
  const undo = useUndo(reload, setActionError);

  const close = () => {
    setErrors({});
    setFormError(undefined);
    panel.hide();
  };

  const openAccount = (account?: AccountDto) => {
    setMode({ kind: 'account', id: account?.id });
    setAccountValues(account === undefined ? emptyAccountForm() : accountToForm(account));
    setErrors({});
    setFormError(undefined);
    panel.show();
  };

  const openTransfer = (transfer?: TransferDto) => {
    setMode({ kind: 'transfer', id: transfer?.id });
    setTransferValues(
      transfer === undefined
        ? emptyTransferForm(accounts)
        : {
            date: transfer.date,
            amount: centsToInput(transfer.amountCents),
            fromAccountId: String(transfer.fromAccountId),
            toAccountId: String(transfer.toAccountId),
            notes: transfer.notes ?? '',
          },
    );
    setErrors({});
    setFormError(undefined);
    panel.show();
  };

  const openReconcile = (account: AccountDto) => {
    setMode({ kind: 'reconcile', id: account.id });
    setErrors({});
    setFormError(undefined);
    panel.show();
  };

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setFormError(undefined);
    setActionError(undefined);
    try {
      await action();
      close();
      reload();
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        setErrors(error.fields);
      }
      setFormError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const submitAccount = async () => {
    const checked = validateAccountForm(accountValues);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    const id = mode.id;
    await run(() =>
      id === undefined
        ? api.createAccount(checked.payload)
        : api.updateAccount(id, checked.payload),
    );
  };

  const submitTransfer = async () => {
    const checked = validateTransferForm(transferValues, accounts);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    const id = mode.id;
    await run(() =>
      id === undefined
        ? api.createTransfer(checked.payload)
        : api.updateTransfer(id, checked.payload),
    );
  };

  const removeTransfer = async (transfer: TransferDto) => {
    // No confirmation: the transfer goes to the papelera and «Deshacer» brings it back.
    setActionError(undefined);
    try {
      await api.deleteTransfer(transfer.id);
      undo.show('Transferencia eliminada. Está en la papelera.', () =>
        api.restoreTransfer(transfer.id),
      );
    } catch (error) {
      setActionError(messageOf(error));
    }
    reload();
  };

  const removeAccount = async (account: AccountDto) => {
    const records = reconciliations.filter((r) => r.accountId === account.id).length;
    if (!window.confirm(deleteAccountConfirmText(account.name, records))) {
      return;
    }
    setActionError(undefined);
    try {
      await api.deleteAccount(account.id);
    } catch (error) {
      // E.g. it got movements meanwhile (409): say so.
      setActionError(messageOf(error));
    }
    reload();
  };

  const nameOf = (id: number) => accounts.find((a) => a.id === id)?.name ?? '—';
  const balanceOf = (id: number) => balances.find((b) => b.accountId === id)?.balanceCents;
  // The list comes most recent first.
  const lastReconciliationOf = (id: number) => reconciliations.find((r) => r.accountId === id);
  const reconcilingAccount =
    mode.kind === 'reconcile' ? accounts.find((a) => a.id === mode.id) : undefined;

  return (
    <main className="page">
      <PageHeader
        title="Cuentas"
        action={
          <button
            type="button"
            className="primary"
            onClick={() => {
              openAccount();
            }}
          >
            Añadir cuenta
          </button>
        }
        hint="El saldo de la cuenta es el saldo inicial más los movimientos y transferencias posteriores a su fecha. Una transferencia no es un ingreso ni un gasto: solo mueve dinero entre cuentas."
      />

      {loadError !== undefined && (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}
      {actionError !== undefined && (
        <p className="form-error" role="alert">
          {actionError}{' '}
          {actionError.includes('papelera') && <a href={hrefFor('trash')}>Ir a la papelera</a>}
        </p>
      )}

      <SidePanel
        open={panel.open}
        title={
          mode.kind === 'reconcile'
            ? 'Conciliar cuenta'
            : mode.kind === 'account'
              ? mode.id === undefined
                ? 'Añadir cuenta'
                : 'Editar cuenta'
              : mode.id === undefined
                ? 'Registrar transferencia'
                : 'Editar transferencia'
        }
        onClose={close}
      >
        {mode.kind === 'reconcile' ? (
          reconcilingAccount !== undefined && (
            <ReconcilePanel
              key={reconcilingAccount.id}
              api={api}
              account={reconcilingAccount}
              nameOf={nameOf}
              onSaved={() => {
                close();
                reload();
              }}
              onCancel={close}
            />
          )
        ) : mode.kind === 'account' ? (
          <AccountForm
            values={accountValues}
            errors={{ ...errors, openingDate: errors.openingDate ?? errors.openingBalanceDate }}
            busy={busy}
            formError={formError}
            onChange={setAccountValues}
            onSubmit={() => void submitAccount()}
            onCancel={close}
          />
        ) : (
          <TransferForm
            values={transferValues}
            errors={{ ...errors, amount: errors.amount ?? errors.amountCents }}
            accounts={accounts}
            busy={busy}
            formError={formError}
            onChange={setTransferValues}
            onSubmit={() => void submitTransfer()}
            onCancel={close}
          />
        )}
      </SidePanel>

      <section aria-label="Cuentas">
        <table className="movements categories">
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Tipo</th>
              <th className="amount">Saldo de la cuenta</th>
              <th>Última conciliación</th>
              <th>
                <span className="visually-hidden">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const balance = balanceOf(a.id);
              const last = lastReconciliationOf(a.id);
              return (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{ACCOUNT_TYPE_LABELS[a.type]}</td>
                  <td className="amount">{balance === undefined ? '—' : formatCents(balance)}</td>
                  <td>
                    {last === undefined
                      ? 'Sin conciliar'
                      : `${formatDate(last.date)} · diferencia ${formatCents(last.differenceCents)}`}
                  </td>
                  <td className="actions">
                    <button
                      type="button"
                      onClick={() => {
                        openReconcile(a);
                      }}
                    >
                      Conciliar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        openAccount(a);
                      }}
                    >
                      Editar
                    </button>
                    {a.id !== DEFAULT_ACCOUNT_ID && (
                      <button
                        type="button"
                        className="danger"
                        onClick={() => void removeAccount(a)}
                      >
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section aria-label="Transferencias">
        <div className="page-header-row">
          <h2>Transferencias</h2>
          <button
            type="button"
            disabled={accounts.length < 2}
            title={accounts.length < 2 ? 'Necesitas al menos dos cuentas.' : undefined}
            onClick={() => {
              openTransfer();
            }}
          >
            Registrar transferencia
          </button>
        </div>
        {transfers.length === 0 ? (
          <p className="empty">No hay transferencias. Pulsa «Registrar transferencia».</p>
        ) : (
          <table className="movements categories">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Origen</th>
                <th>Destino</th>
                <th className="amount">Importe</th>
                <th>
                  <span className="visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td>
                    {t.date}
                    {t.notes !== null && <span className="notes">{t.notes}</span>}
                  </td>
                  <td>{nameOf(t.fromAccountId)}</td>
                  <td>{nameOf(t.toAccountId)}</td>
                  <td className="amount">{formatCents(t.amountCents)}</td>
                  <td className="actions">
                    <button
                      type="button"
                      onClick={() => {
                        openTransfer(t);
                      }}
                    >
                      Editar
                    </button>
                    <button type="button" className="danger" onClick={() => void removeTransfer(t)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <UndoToast
        toast={undo.toast}
        busy={undo.busy}
        onUndo={(t) => void undo.undo(t)}
        onExpire={undo.expire}
      />
    </main>
  );
}
