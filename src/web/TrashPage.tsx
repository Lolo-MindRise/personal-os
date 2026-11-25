import { useEffect, useState } from 'react';
import type {
  AccountDto,
  TrashDto,
  TrashedMovementDto,
  TrashedTransferDto,
} from '../shared/api.js';
import { formatCents } from '../shared/money.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import { KIND_LABELS } from './labels.js';
import { formatDate } from './months.js';
import { PageHeader } from './PageHeader.js';

const defaultApi = createApiClient();

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

export type TrashRow =
  { type: 'movement'; item: TrashedMovementDto } | { type: 'transfer'; item: TrashedTransferDto };

export const rowKey = (row: TrashRow) => `${row.type}-${String(row.item.id)}`;

/** Movements and transfers in one list, most recently deleted first. */
export function trashRows(trash: TrashDto): TrashRow[] {
  const rows: TrashRow[] = [
    ...trash.movements.map((item): TrashRow => ({ type: 'movement', item })),
    ...trash.transfers.map((item): TrashRow => ({ type: 'transfer', item })),
  ];
  return rows.sort((a, b) => {
    if (a.item.deletedAt !== b.item.deletedAt) {
      return a.item.deletedAt < b.item.deletedAt ? 1 : -1;
    }
    // Ties: a stable order, movements before transfers, then by id.
    return a.type === b.type ? a.item.id - b.item.id : a.type === 'movement' ? -1 : 1;
  });
}

/** "25/11/2026" for the day (local time) a row was deleted. */
export function deletedOn(deletedAt: string): string {
  const date = new Date(deletedAt);
  if (Number.isNaN(date.getTime())) {
    return deletedAt.slice(0, 10);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return formatDate(
    `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
  );
}

export type RowOutcome = { ok: true } | { ok: false; message: string };

/** Runs a restore or a permanent delete; a failure becomes the message shown next to the row. */
export async function runRowAction(action: () => Promise<unknown>): Promise<RowOutcome> {
  try {
    await action();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

type RowErrors = Record<string, string | undefined>;

/** An action starts: the row's old error goes away. */
export function errorsBefore(errors: RowErrors, row: TrashRow): RowErrors {
  return { ...errors, [rowKey(row)]: undefined };
}

/** An action ends: on failure the row stays and the error is shown next to it. */
export function errorsAfter(errors: RowErrors, row: TrashRow, outcome: RowOutcome): RowErrors {
  return outcome.ok ? errors : { ...errors, [rowKey(row)]: outcome.message };
}

export const confirmForeverText = (row: TrashRow) =>
  `¿Eliminar definitivamente «${row.type === 'movement' ? row.item.concept : 'esta transferencia'}»? No se puede deshacer.`;

export const restoreRow = (api: ApiClient, row: TrashRow) =>
  row.type === 'movement' ? api.restoreMovement(row.item.id) : api.restoreTransfer(row.item.id);

export const deleteRowForever = (api: ApiClient, row: TrashRow) =>
  row.type === 'movement'
    ? api.deleteMovementForever(row.item.id)
    : api.deleteTransferForever(row.item.id);

interface ViewProps {
  trash: TrashDto;
  accounts: Pick<AccountDto, 'id' | 'name'>[];
  /** Why the last action on a row failed, by row key. The row stays. */
  errors: Record<string, string | undefined>;
  busy: boolean;
  onRestore: (row: TrashRow) => void;
  onDeleteForever: (row: TrashRow) => void;
}

/** The list itself, without data loading. */
export function TrashView({
  trash,
  accounts,
  errors,
  busy,
  onRestore,
  onDeleteForever,
}: ViewProps) {
  const rows = trashRows(trash);
  const accountName = (id: number) => accounts.find((a) => a.id === id)?.name ?? '—';
  if (rows.length === 0) {
    return (
      <p className="empty" role="status">
        La papelera está vacía. Lo que elimines en Movimientos o Cuentas aparecerá aquí.
      </p>
    );
  }
  return (
    <table className="movements trash">
      <thead>
        <tr>
          <th>Eliminado</th>
          <th>Fecha</th>
          <th>Tipo</th>
          <th>Detalle</th>
          <th className="amount">Importe</th>
          <th>
            <span className="visually-hidden">Acciones</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const key = rowKey(row);
          const error = errors[key];
          return (
            <tr key={key} data-testid="trash-row">
              <td>Eliminado el {deletedOn(row.item.deletedAt)}</td>
              <td>{formatDate(row.item.date)}</td>
              {row.type === 'movement' ? (
                <>
                  <td>
                    <span className={`kind kind-${row.item.kind}`}>
                      {KIND_LABELS[row.item.kind]}
                    </span>
                  </td>
                  <td>
                    {row.item.concept}
                    <span className="notes">{row.item.categoryName}</span>
                  </td>
                </>
              ) : (
                <>
                  <td>Transferencia</td>
                  <td>
                    {accountName(row.item.fromAccountId)} → {accountName(row.item.toAccountId)}
                    {row.item.notes !== null && <span className="notes">{row.item.notes}</span>}
                  </td>
                </>
              )}
              <td className="amount">{formatCents(row.item.amountCents)}</td>
              <td className="actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    onRestore(row);
                  }}
                >
                  Restaurar
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => {
                    onDeleteForever(row);
                  }}
                >
                  Eliminar definitivamente
                </button>
                {error !== undefined && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The "Papelera" screen: deleted movements and transfers. Nothing leaves it automatically. */
export function TrashPage({ api = defaultApi }: { api?: ApiClient }) {
  const [trash, setTrash] = useState<TrashDto | undefined>();
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([api.trash(), api.accounts()]).then(
      ([rows, accountList]) => {
        if (active) {
          setTrash(rows);
          setAccounts(accountList);
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

  const act = async (row: TrashRow, action: () => Promise<unknown>) => {
    setBusy(true);
    setErrors((now) => errorsBefore(now, row));
    const outcome = await runRowAction(action);
    setErrors((now) => errorsAfter(now, row, outcome));
    if (outcome.ok) {
      setReloads((n) => n + 1);
    }
    setBusy(false);
  };

  return (
    <main className="page">
      <PageHeader
        title="Papelera"
        hint="Aquí esperan los movimientos y transferencias eliminados. No cuentan en los saldos ni en los totales. No se borra nada solo: restaura o elimina definitivamente, uno a uno."
      />
      {loadError !== undefined && (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}
      {trash === undefined && loadError === undefined && (
        <p className="loading" role="status">
          Cargando…
        </p>
      )}
      {trash !== undefined && (
        <TrashView
          trash={trash}
          accounts={accounts}
          errors={errors}
          busy={busy}
          onRestore={(row) => void act(row, () => restoreRow(api, row))}
          onDeleteForever={(row) => {
            if (window.confirm(confirmForeverText(row))) {
              void act(row, () => deleteRowForever(api, row));
            }
          }}
        />
      )}
    </main>
  );
}
