import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Rectangle,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BarShapeProps } from 'recharts';
import type { DashboardCategoryDto, DashboardMonthDto } from '../shared/api.js';
import { formatCents } from '../shared/money.js';
import { monthLabel } from './months.js';

// Charts of the home screen (ADR-0006). Colours are CSS variables, so both system themes work.
// Each chart sits in a figure with a text summary and a data table: the picture is never the
// only way to read it.

const SHORT_MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/** `'2026-01'` → `'ene 26'`. */
export function shortMonth(month: string): string {
  const [year, mon] = month.split('-');
  return `${SHORT_MONTHS[Number(mon) - 1] ?? month} ${(year ?? '').slice(2)}`;
}

const euros = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
/** Axis ticks in whole euros (the exact amount is in the tooltip and the table). */
const tickEuros = (cents: number) => `${euros.format(Math.round(cents / 100))} €`;
const tooltipAmount = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) ? formatCents(value) : '—';

const axisTick = { fill: 'var(--muted)', fontSize: 12 };
const tooltipStyles = {
  contentStyle: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text)',
  },
  labelStyle: { color: 'var(--text)', fontWeight: 600 },
  itemStyle: { color: 'var(--text)' },
} as const;

/** One sentence that carries the chart's main message, for the accessible label. */
export function monthsSummaryText(months: DashboardMonthDto[]): string {
  const first = months[0];
  const last = months[months.length - 1];
  if (first === undefined || last === undefined) {
    return 'Sin datos.';
  }
  const income = months.reduce((t, m) => t + m.incomeCents, 0);
  const expense = months.reduce((t, m) => t + m.expenseCents, 0);
  const accumulated =
    last.accumulatedCents === null
      ? 'sin ahorro acumulado'
      : `ahorro acumulado ${formatCents(last.accumulatedCents)}`;
  return `De ${monthLabel(first.month)} a ${monthLabel(last.month)}: ingresos ${formatCents(income)}, gastos ${formatCents(expense)}, ${accumulated} al final.`;
}

export function MonthsChart({ months }: { months: DashboardMonthDto[] }) {
  const data = months.map((m) => ({
    name: shortMonth(m.month),
    Ingresos: m.incomeCents,
    Gastos: m.expenseCents,
    'Ahorro acumulado': m.accumulatedCents,
  }));
  const summary = monthsSummaryText(months);
  return (
    <figure className="chart" data-testid="chart-months">
      <figcaption>{summary}</figcaption>
      <div
        className="chart-box"
        role="img"
        aria-label={`Gráfico de los últimos 12 meses. ${summary}`}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 800, height: 300 }}
        >
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={axisTick} stroke="var(--border)" />
            <YAxis tick={axisTick} stroke="var(--border)" tickFormatter={tickEuros} width={72} />
            <Tooltip formatter={tooltipAmount} {...tooltipStyles} />
            <Legend wrapperStyle={{ color: 'var(--text)' }} />
            <Bar dataKey="Ingresos" fill="var(--income)" />
            <Bar dataKey="Gastos" fill="var(--expense)" />
            <Line
              type="monotone"
              dataKey="Ahorro acumulado"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'var(--accent)' }}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-data">
        <summary>Ver los datos</summary>
        <table className="movements">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="amount">Ingresos</th>
              <th className="amount">Gastos</th>
              <th className="amount">Ahorro acumulado</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <th scope="row">{monthLabel(m.month)}</th>
                <td className="amount">{formatCents(m.incomeCents)}</td>
                <td className="amount">{formatCents(m.expenseCents)}</td>
                <td className="amount">
                  {m.accumulatedCents === null ? '—' : formatCents(m.accumulatedCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** The category label on the axis; over-budget ones say so in words, not only in colour. */
export function categoryLabel(c: DashboardCategoryDto): string {
  return c.overBudget ? `${c.categoryName} (excedido)` : c.categoryName;
}

export function categoriesSummaryText(categories: DashboardCategoryDto[]): string {
  const over = categories.filter((c) => c.overBudget);
  const spent = categories.reduce((t, c) => t + c.actualCents, 0);
  const overText =
    over.length === 0
      ? 'Ninguna categoría supera su presupuesto.'
      : `Superan su presupuesto: ${over.map((c) => c.categoryName).join(', ')}.`;
  return `Gastos del mes ${formatCents(spent)} en ${String(categories.length)} categorías. ${overText}`;
}

export function CategoriesChart({ categories }: { categories: DashboardCategoryDto[] }) {
  const data = categories.map((c) => ({
    name: categoryLabel(c),
    Presupuesto: c.budgetCents,
    Gasto: c.actualCents,
    over: c.overBudget,
  }));
  const summary = categoriesSummaryText(categories);
  const height = Math.max(180, categories.length * 56 + 60);
  return (
    <figure className="chart" data-testid="chart-categories">
      <figcaption>{summary}</figcaption>
      <div
        className="chart-box"
        style={{ height }}
        role="img"
        aria-label={`Gráfico de gastos por categoría frente al presupuesto. ${summary}`}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 600, height }}
        >
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={axisTick} stroke="var(--border)" tickFormatter={tickEuros} />
            <YAxis
              type="category"
              dataKey="name"
              tick={axisTick}
              stroke="var(--border)"
              width={140}
            />
            <Tooltip formatter={tooltipAmount} {...tooltipStyles} />
            <Legend wrapperStyle={{ color: 'var(--text)' }} />
            <Bar dataKey="Presupuesto" fill="var(--muted)" />
            <Bar
              dataKey="Gasto"
              fill="var(--expense)"
              shape={(props: BarShapeProps) => (
                <Rectangle
                  {...props}
                  fill={
                    (props.payload as { over?: boolean } | undefined)?.over === true
                      ? 'var(--danger)'
                      : 'var(--expense)'
                  }
                />
              )}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-data">
        <summary>Ver los datos</summary>
        <table className="movements">
          <thead>
            <tr>
              <th>Categoría</th>
              <th className="amount">Presupuesto</th>
              <th className="amount">Gasto</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.categoryId}>
                <th scope="row">{c.categoryName}</th>
                <td className="amount">
                  {c.budgetCents === null ? '—' : formatCents(c.budgetCents)}
                </td>
                <td className="amount">{formatCents(c.actualCents)}</td>
                <td>
                  {c.overBudget ? (
                    <span className="overdue-flag">Excedido</span>
                  ) : c.budgetCents === null ? (
                    <span className="muted">Sin presupuesto</span>
                  ) : (
                    'Dentro del presupuesto'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
