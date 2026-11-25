import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BarRectangleItem } from 'recharts';
import { formatCents } from '../shared/money.js';
import {
  buildExpenseReport,
  DEFAULT_REPORT_PERIOD,
  isReportPeriod,
  REPORT_PERIODS,
  type CategoryChange,
  type CategorySeries,
  type ExpenseReport,
  type ExpenseReportDto,
  type ReportPeriod,
} from '../shared/reports.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import {
  axisTick,
  shortMonth,
  tickEuros,
  tooltipAmount,
  tooltipStyles,
} from './DashboardCharts.js';
import { monthLabel } from './months.js';
import { PageHeader } from './PageHeader.js';
import {
  buildHash,
  getSelectedMonth,
  hrefFor,
  isMonth,
  navigate,
  updateParams,
  useRoute,
} from './router.js';

const defaultApi = createApiClient();

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

// Colours that read on both themes. The data table under each chart carries the same figures.
const PALETTE = [
  '#4e9f7d',
  '#d9a441',
  '#5b8fd1',
  '#c96f5e',
  '#9a7bc8',
  '#3fb3b3',
  '#c9c05a',
  '#d487b0',
  '#8c9a6b',
  '#7d8a94',
];
export const colorOf = (index: number) => PALETTE[index % PALETTE.length] ?? '#7d8a94';

/** The movements of one category in one month (the existing URL filters). */
export const movementsHref = (month: string, categoryId: number) =>
  hrefFor('movements', { month, category: String(categoryId) });

/**
 * The movements of one category over the whole period of the report: from the first day of its
 * first month to the last day of its last month (the Movimientos filters `cat`, `from`, `to`).
 */
export function movementsPeriodHref(
  firstMonth: string,
  lastMonth: string,
  categoryId: number,
): string {
  const [year, mon] = lastMonth.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year ?? 1970, mon ?? 1, 0)).getUTCDate();
  return buildHash('movements', {
    cat: String(categoryId),
    from: `${firstMonth}-01`,
    to: `${lastMonth}-${String(lastDay).padStart(2, '0')}`,
  });
}

/**
 * Chart data key of a category. Not its name: Recharts reads string keys as object paths, so a
 * name with "." or "[" would draw nothing.
 */
export const seriesKey = (categoryId: number) => `c${String(categoryId)}`;

/** One row per month for the stacked chart, with the amount of each category under its key. */
export function stackedData(report: ExpenseReport): Record<string, number | string>[] {
  return report.months.map((month, i) => {
    const row: Record<string, number | string> = { month, name: shortMonth(month) };
    for (const s of report.series) {
      row[seriesKey(s.categoryId)] = s.monthlyCents[i] ?? 0;
    }
    return row;
  });
}

/** One row per month for the trend chart of a single category. */
export function trendData(report: ExpenseReport, series: CategorySeries) {
  return report.months.map((month, i) => ({
    month,
    name: shortMonth(month),
    [seriesKey(series.categoryId)]: series.monthlyCents[i] ?? 0,
  }));
}

/** Neutral wording for a change: amount and direction, no judgement. */
export function changeText(c: CategoryChange): string {
  const amount = formatCents(Math.abs(c.deltaCents));
  return c.direction === 'up'
    ? `${amount} más que en el periodo anterior`
    : `${amount} menos que en el periodo anterior`;
}

export function reportSummaryText(report: ExpenseReport): string {
  const first = report.months[0];
  const last = report.months[report.months.length - 1];
  if (first === undefined || last === undefined || report.totalCents === 0) {
    return 'Sin gastos en este periodo.';
  }
  return `De ${monthLabel(first)} a ${monthLabel(last)}: gastos ${formatCents(report.totalCents)} en ${String(report.series.length)} categorías.`;
}

function StackedChart({ report }: { report: ExpenseReport }) {
  const open = (categoryId: number) => (entry: BarRectangleItem) => {
    const month = (entry.payload as { month?: string } | undefined)?.month;
    if (month !== undefined) {
      navigate('movements', { month, category: String(categoryId) });
    }
  };
  const data = stackedData(report);
  const summary = reportSummaryText(report);
  return (
    <figure className="chart" data-testid="chart-stacked">
      <figcaption>{summary}</figcaption>
      <div
        className="chart-box"
        role="img"
        aria-label={`Gráfico de gastos por categoría y mes. ${summary}`}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 800, height: 300 }}
        >
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={axisTick} stroke="var(--border)" />
            <YAxis tick={axisTick} stroke="var(--border)" tickFormatter={tickEuros} width={72} />
            <Tooltip formatter={tooltipAmount} {...tooltipStyles} />
            <Legend wrapperStyle={{ color: 'var(--text)' }} />
            {report.series.map((s, i) => (
              <Bar
                key={s.categoryId}
                dataKey={seriesKey(s.categoryId)}
                name={s.name}
                stackId="gastos"
                fill={colorOf(i)}
                cursor="pointer"
                onClick={open(s.categoryId)}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-data">
        <summary>Ver los datos</summary>
        <table className="movements" data-testid="table-stacked">
          <thead>
            <tr>
              <th>Categoría</th>
              {report.months.map((m) => (
                <th key={m} className="amount">
                  {shortMonth(m)}
                </th>
              ))}
              <th className="amount">Total</th>
            </tr>
          </thead>
          <tbody>
            {report.series.map((s) => (
              <tr key={s.categoryId}>
                <th scope="row">{s.name}</th>
                {report.months.map((m, i) => (
                  <td key={m} className="amount">
                    {(s.monthlyCents[i] ?? 0) === 0 ? (
                      '—'
                    ) : (
                      <a href={movementsHref(m, s.categoryId)}>
                        {formatCents(s.monthlyCents[i] ?? 0)}
                      </a>
                    )}
                  </td>
                ))}
                <td className="amount">{formatCents(s.totalCents)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Total</th>
              {report.monthTotalsCents.map((cents, i) => (
                <td key={report.months[i]} className="amount">
                  {formatCents(cents)}
                </td>
              ))}
              <td className="amount">{formatCents(report.totalCents)}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function TrendChart({
  report,
  series,
  onCategory,
}: {
  report: ExpenseReport;
  series: CategorySeries | undefined;
  onCategory: (id: number) => void;
}) {
  if (series === undefined) {
    return <p className="empty">No hay gastos en este periodo.</p>;
  }
  const data = trendData(report, series);
  const openIndex = (state: { activeTooltipIndex?: unknown }) => {
    const index = Number(state.activeTooltipIndex);
    const month = Number.isInteger(index) ? report.months[index] : undefined;
    if (month !== undefined) {
      navigate('movements', { month, category: String(series.categoryId) });
    }
  };
  const summary = `${series.name}: ${formatCents(series.totalCents)} en el periodo, media mensual ${formatCents(series.averageCents)}.`;
  return (
    <figure className="chart" data-testid="chart-trend">
      <div className="field">
        <label htmlFor="trend-category">Categoría</label>
        <select
          id="trend-category"
          value={series.categoryId}
          onChange={(e) => {
            onCategory(Number(e.target.value));
          }}
        >
          {report.series.map((s) => (
            <option key={s.categoryId} value={s.categoryId}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <figcaption>{summary}</figcaption>
      <div
        className="chart-box"
        role="img"
        aria-label={`Gráfico de la evolución de ${series.name}. ${summary}`}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 800, height: 300 }}
        >
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
            onClick={openIndex}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={axisTick} stroke="var(--border)" />
            <YAxis tick={axisTick} stroke="var(--border)" tickFormatter={tickEuros} width={72} />
            <Tooltip formatter={tooltipAmount} {...tooltipStyles} />
            <Line
              type="monotone"
              dataKey={seriesKey(series.categoryId)}
              name={series.name}
              stroke="var(--accent)"
              strokeWidth={2}
              dot={{ r: 4, fill: 'var(--accent)', cursor: 'pointer' }}
              activeDot={{ r: 6, cursor: 'pointer' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-data">
        <summary>Ver los datos</summary>
        <table className="movements" data-testid="table-trend">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="amount">Gasto</th>
            </tr>
          </thead>
          <tbody>
            {report.months.map((m, i) => (
              <tr key={m}>
                <th scope="row">
                  <a href={movementsHref(m, series.categoryId)}>{monthLabel(m)}</a>
                </th>
                <td className="amount">{formatCents(series.monthlyCents[i] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function Averages({ report }: { report: ExpenseReport }) {
  const first = report.months[0];
  const last = report.months[report.months.length - 1];
  if (report.series.length === 0 || first === undefined || last === undefined) {
    return <p className="empty">No hay gastos en este periodo.</p>;
  }
  return (
    <table className="movements" data-testid="table-averages">
      <thead>
        <tr>
          <th>Categoría</th>
          <th className="amount">Media mensual</th>
          <th className="amount">Total del periodo</th>
        </tr>
      </thead>
      <tbody>
        {report.series.map((s) => (
          <tr key={s.categoryId}>
            <th scope="row">
              <a href={movementsPeriodHref(first, last, s.categoryId)}>{s.name}</a>
            </th>
            <td className="amount">{formatCents(s.averageCents)}</td>
            <td className="amount">{formatCents(s.totalCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Changes({ report }: { report: ExpenseReport }) {
  const first = report.months[0];
  const last = report.months[report.months.length - 1];
  if (report.changes.length === 0 || first === undefined || last === undefined) {
    return (
      <p className="empty" data-testid="changes-empty">
        No hay datos suficientes del periodo anterior para comparar.
      </p>
    );
  }
  return (
    <ul className="upcoming" data-testid="list-changes">
      {report.changes.map((c) => (
        <li key={c.categoryId}>
          <a href={movementsPeriodHref(first, last, c.categoryId)}>{c.name}</a>: {changeText(c)} (
          {formatCents(c.previousCents)} → {formatCents(c.currentCents)})
        </li>
      ))}
    </ul>
  );
}

export function ReportsView({
  data,
  categoryId,
  onCategory,
}: {
  data: ExpenseReportDto;
  categoryId: number | undefined;
  onCategory: (id: number) => void;
}) {
  const report = buildExpenseReport(data);
  if (report.series.length === 0 && report.changes.length === 0) {
    return (
      <p className="empty" data-testid="reports-empty">
        No hay gastos en este periodo. Añade movimientos para ver los informes.
      </p>
    );
  }
  const series = report.series.find((s) => s.categoryId === categoryId) ?? report.series[0];
  return (
    <>
      <section aria-labelledby="h-stacked">
        <h2 id="h-stacked">Gastos por categoría y mes</h2>
        <StackedChart report={report} />
      </section>
      <section aria-labelledby="h-trend">
        <h2 id="h-trend">Evolución de una categoría</h2>
        <TrendChart report={report} series={series} onCategory={onCategory} />
      </section>
      <section aria-labelledby="h-average">
        <h2 id="h-average">Media mensual por categoría</h2>
        <Averages report={report} />
      </section>
      <section aria-labelledby="h-changes">
        <h2 id="h-changes">Cambios respecto al periodo anterior</h2>
        <Changes report={report} />
      </section>
    </>
  );
}

export function PeriodPicker({
  value,
  onChange,
}: {
  value: ReportPeriod;
  onChange: (period: ReportPeriod) => void;
}) {
  return (
    <nav className="sub-nav" aria-label="Periodo">
      {REPORT_PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={value === p}
          className={value === p ? 'active' : undefined}
          onClick={() => {
            onChange(p);
          }}
        >
          {`${String(p)} meses`}
        </button>
      ))}
    </nav>
  );
}

export function ReportsPage({ api = defaultApi }: { api?: ApiClient }) {
  const { params } = useRoute();
  const month = isMonth(params.month) ? params.month : getSelectedMonth();
  const requested = Number(params.months);
  const period = isReportPeriod(requested) ? requested : DEFAULT_REPORT_PERIOD;
  const categoryId = /^\d+$/.test(params.category ?? '') ? Number(params.category) : undefined;
  const [data, setData] = useState<ExpenseReportDto | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    api.expenseReport(month, period).then(
      (next) => {
        if (active) {
          setData(next);
          setError(undefined);
        }
      },
      (failure: unknown) => {
        if (active) {
          setError(messageOf(failure));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [api, month, period]);

  return (
    <main className="page dashboard">
      <PageHeader
        title="Informes"
        month={month}
        onMonthChange={(next) => {
          updateParams({ month: next });
        }}
        period={
          <PeriodPicker
            value={period}
            onChange={(next) => {
              updateParams({ months: String(next) });
            }}
          />
        }
        hint="Adónde va el dinero: gastos confirmados por categoría, con el mes elegido como último mes del periodo. Cada elemento abre los movimientos correspondientes."
      />
      {error !== undefined && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {data !== undefined && (
        <ReportsView
          data={data}
          categoryId={categoryId}
          onCategory={(id) => {
            updateParams({ category: String(id) });
          }}
        />
      )}
    </main>
  );
}
