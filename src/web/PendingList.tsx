import type { PendingEntryDto } from '../shared/api.js';
import { formatCents } from '../shared/money.js';
import { KIND_LABELS } from './labels.js';
import { formatDate } from './months.js';
import { hrefFor } from './router.js';

interface Props {
  pending: PendingEntryDto[];
  skipped: PendingEntryDto[];
  /** Disables the actions while a request is running. */
  busy?: boolean;
  onConfirm: (entry: PendingEntryDto) => void;
  onSkip: (entry: PendingEntryDto) => void;
  onUndo: (entry: PendingEntryDto) => void;
  onConfirmAll: () => void;
}

/** Fixed items due this month that are not confirmed yet (ADR-0005), plus the skipped ones. */
export function PendingList({
  pending,
  skipped,
  busy = false,
  onConfirm,
  onSkip,
  onUndo,
  onConfirmAll,
}: Props) {
  return (
    <section className="pending-section" aria-labelledby="pending-title">
      <div className="section-header">
        <h2 id="pending-title">Pendientes</h2>
        <button
          type="button"
          disabled={busy || pending.length === 0}
          onClick={() => {
            onConfirmAll();
          }}
        >
          Confirmar todos
        </button>
      </div>

      {pending.length === 0 && skipped.length === 0 ? (
        <p className="empty">
          No hay fijos pendientes este mes. Define los tuyos en{' '}
          <a href={hrefFor('recurring')}>Fijos</a>.
        </p>
      ) : (
        <table className="pending">
          <thead>
            <tr>
              <th>Fecha prevista</th>
              <th>Tipo</th>
              <th>Categoría</th>
              <th>Concepto</th>
              <th className="amount">Importe</th>
              <th>
                <span className="visually-hidden">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pending.map((entry) => (
              <tr key={entry.recurringItemId} className="pending-row">
                <td>{formatDate(entry.date)}</td>
                <td>
                  <span className={`kind kind-${entry.kind}`}>{KIND_LABELS[entry.kind]}</span>
                </td>
                <td>{entry.categoryName}</td>
                <td>{entry.concept}</td>
                <td className="amount">{formatCents(entry.amountCents)}</td>
                <td className="actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() => {
                      onConfirm(entry);
                    }}
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      onSkip(entry);
                    }}
                  >
                    Saltar
                  </button>
                </td>
              </tr>
            ))}
            {skipped.map((entry) => (
              <tr key={entry.recurringItemId} className="pending-row skipped-row">
                <td>{formatDate(entry.date)}</td>
                <td>
                  <span className={`kind kind-${entry.kind}`}>{KIND_LABELS[entry.kind]}</span>
                </td>
                <td>{entry.categoryName}</td>
                <td>
                  {entry.concept}
                  <span className="notes">Saltado este mes</span>
                </td>
                <td className="amount">{formatCents(entry.amountCents)}</td>
                <td className="actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      onUndo(entry);
                    }}
                  >
                    Deshacer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
