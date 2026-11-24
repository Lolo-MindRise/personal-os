import type { MovementDto } from '../shared/api.js';
import { formatCents } from '../shared/money.js';
import { KIND_LABELS } from './labels.js';
import { formatDate } from './months.js';
import { hrefFor } from './router.js';

interface Props {
  movements: MovementDto[];
  onEdit: (movement: MovementDto) => void;
  onDelete: (movement: MovementDto) => void;
}

export function MovementList({ movements, onEdit, onDelete }: Props) {
  if (movements.length === 0) {
    return (
      <p className="empty">
        No hay movimientos este mes. Pulsa «Añadir movimiento» o{' '}
        <a href={hrefFor('import')}>importa un extracto</a>.
      </p>
    );
  }
  return (
    <table className="movements">
      <thead>
        <tr>
          <th>Fecha</th>
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
        {movements.map((m) => (
          <tr key={m.id}>
            <td>{formatDate(m.date)}</td>
            <td>
              <span className={`kind kind-${m.kind}`}>{KIND_LABELS[m.kind]}</span>
            </td>
            <td>{m.categoryName}</td>
            <td>
              {m.concept}
              {m.notes !== null && <span className="notes">{m.notes}</span>}
            </td>
            <td className="amount">{formatCents(m.amountCents)}</td>
            <td className="actions">
              <button
                type="button"
                onClick={() => {
                  onEdit(m);
                }}
              >
                Editar
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  onDelete(m);
                }}
              >
                Eliminar
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
