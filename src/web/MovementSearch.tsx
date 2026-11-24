import type { SubmitEvent } from 'react';
import type { CategoryDto, MovementDto, MovementSearchDto } from '../shared/api.js';
import { KINDS } from '../shared/constants.js';
import { formatCents } from '../shared/money.js';
import { Field } from './Field.js';
import { KIND_LABELS } from './labels.js';
import { formatDate } from './months.js';
import {
  describeFilters,
  hasFilters,
  type FilterField,
  type FilterValues,
  type SearchQuery,
} from './movementSearch.js';

export type FilterErrors = Partial<Record<FilterField, string>>;

/** The filter panel: text, category, kind, date range and amount range, across all months. */
export function MovementFilters(props: {
  values: FilterValues;
  categories: CategoryDto[];
  errors: FilterErrors;
  busy: boolean;
  onChange: (values: FilterValues) => void;
  onSearch: () => void;
  onClear: () => void;
}) {
  const { values, errors } = props;
  const set = (field: FilterField, value: string) => {
    props.onChange({ ...values, [field]: value });
  };
  const describe = (field: FilterField) =>
    errors[field] === undefined ? undefined : `filter-${field}-error`;
  const text = (
    field: FilterField,
    label: string,
    extra: { type?: string; inputMode?: 'decimal'; placeholder?: string } = {},
  ) => (
    <Field id={`filter-${field}`} label={label} error={errors[field]}>
      <input
        id={`filter-${field}`}
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
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    props.onSearch();
  };
  return (
    <form className="movement-form" onSubmit={submit} noValidate aria-label="Buscar movimientos">
      <h2>Buscar en todos los meses</h2>
      <div className="form-grid">
        {text('q', 'Texto en concepto o notas')}
        <Field id="filter-categoryId" label="Categoría" error={errors.categoryId}>
          <select
            id="filter-categoryId"
            value={values.categoryId}
            onChange={(e) => {
              set('categoryId', e.target.value);
            }}
          >
            <option value="">Todas</option>
            {props.categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="filter-kind" label="Tipo" error={errors.kind}>
          <select
            id="filter-kind"
            value={values.kind}
            onChange={(e) => {
              set('kind', e.target.value);
            }}
          >
            <option value="">Todos</option>
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>
        {text('from', 'Desde (fecha)', { type: 'date' })}
        {text('to', 'Hasta (fecha)', { type: 'date' })}
        {text('minAmount', 'Importe mínimo (€)', { inputMode: 'decimal', placeholder: '0,00' })}
        {text('maxAmount', 'Importe máximo (€)', { inputMode: 'decimal', placeholder: '100,00' })}
      </div>
      <div className="form-actions">
        <button type="submit" className="primary" disabled={props.busy}>
          Buscar
        </button>
        <button type="button" onClick={props.onClear} disabled={!hasFilters(values)}>
          Limpiar filtros
        </button>
      </div>
    </form>
  );
}

/** The results of a search: the total of the filtered set, the page, and a way back to the month. */
export function SearchResults(props: {
  result: MovementSearchDto;
  query: SearchQuery;
  categories: CategoryDto[];
  onPage: (page: number) => void;
  onGoToMonth: (movement: MovementDto) => void;
  onBack: () => void;
}) {
  const { result } = props;
  const { totals } = result;
  const filters = describeFilters(
    props.query,
    props.categories.find((c) => c.id === props.query.categoryId)?.name,
    KIND_LABELS,
  );
  return (
    <section aria-label="Resultados de la búsqueda" className="search-results">
      <div className="section-header">
        <h2>Resultados</h2>
        <button type="button" onClick={props.onBack}>
          Volver a la vista mensual
        </button>
      </div>
      {filters.length > 0 && <p className="hint">Filtros: {filters.join(' · ')}.</p>}
      <p className="search-totals" data-testid="search-totals">
        <strong>
          {result.count} {result.count === 1 ? 'movimiento' : 'movimientos'}
        </strong>
        {result.count > 0 && (
          <>
            {' '}
            · Ingresos {formatCents(totals.incomeCents)} · Gastos {formatCents(totals.expenseCents)}{' '}
            · Amortizaciones {formatCents(totals.repaymentCents)} ·{' '}
            <strong>Balance {formatCents(totals.netCents)}</strong>
          </>
        )}
      </p>
      {result.count === 0 ? (
        <p className="empty">Ningún movimiento coincide con los filtros.</p>
      ) : (
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
            {result.rows.map((m) => (
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
                    aria-label={`Ver el mes de «${m.concept}»`}
                    onClick={() => {
                      props.onGoToMonth(m);
                    }}
                  >
                    Ver mes
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {result.pageCount > 1 && (
        <nav className="pager" aria-label="Páginas de resultados">
          <button
            type="button"
            disabled={result.page <= 1}
            onClick={() => {
              props.onPage(result.page - 1);
            }}
          >
            Anterior
          </button>
          <span>
            Página {result.page} de {result.pageCount}
          </span>
          <button
            type="button"
            disabled={result.page >= result.pageCount}
            onClick={() => {
              props.onPage(result.page + 1);
            }}
          >
            Siguiente
          </button>
        </nav>
      )}
    </section>
  );
}
