import type { DebtDto, RecurringItemDto } from '../shared/api.js';
import { formatCents } from '../shared/money.js';
import { KIND_LABELS } from './labels.js';
import { currentMonth, formatMonth } from './months.js';
import { hrefFor } from './router.js';

interface Props {
  items: RecurringItemDto[];
  /** To show which debt an installment item pays. */
  debts?: Pick<DebtDto, 'id' | 'name'>[];
  /** Today's month, to tell which items have already ended. Defaults to the real one. */
  month?: string;
  onEdit: (item: RecurringItemDto) => void;
  onEnd: (item: RecurringItemDto) => void;
}

export function RecurringList({ items, debts = [], month = currentMonth(), onEdit, onEnd }: Props) {
  if (items.length === 0) {
    return (
      <p className="empty">Todavía no hay fijos. Pulsa «Añadir fijo» para crear el primero.</p>
    );
  }
  return (
    <table className="movements recurring">
      <thead>
        <tr>
          <th>Tipo</th>
          <th>Categoría</th>
          <th>Concepto</th>
          <th>Día</th>
          <th className="amount">Importe previsto</th>
          <th>Desde</th>
          <th>Hasta</th>
          <th>
            <span className="visually-hidden">Acciones</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const ended = item.endMonth !== null && item.endMonth < month;
          return (
            <tr key={item.id} className={ended ? 'ended-row' : undefined}>
              <td>
                <span className={`kind kind-${item.kind}`}>{KIND_LABELS[item.kind]}</span>
              </td>
              <td>{item.categoryName}</td>
              <td>
                <a href={hrefFor('movements', { fixed: String(item.id) })}>{item.concept}</a>
                {item.notes !== null && <span className="notes">{item.notes}</span>}
                {item.debtId !== null && (
                  <span className="notes">
                    Cuota de la deuda «{debts.find((d) => d.id === item.debtId)?.name ?? '?'}»
                  </span>
                )}
              </td>
              <td>{item.expectedDay}</td>
              <td className="amount">{formatCents(item.amountCents)}</td>
              <td>{formatMonth(item.startMonth)}</td>
              <td>
                {item.endMonth === null ? (
                  'Sin fin'
                ) : (
                  <>
                    {formatMonth(item.endMonth)}
                    {ended && <span className="notes">Terminado</span>}
                  </>
                )}
              </td>
              <td className="actions">
                <button
                  type="button"
                  onClick={() => {
                    onEdit(item);
                  }}
                >
                  Editar
                </button>
                {item.endMonth === null && (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      onEnd(item);
                    }}
                  >
                    Terminar
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
