import { useEffect, useState, type SubmitEvent } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CategoryDto, ProjectionDto, ProjectionMonthDto } from '../shared/api.js';
import { formatCents } from '../shared/money.js';
import {
  addMonths,
  applyScenarios,
  MAX_PROJECTION_MONTHS,
  type Scenario,
} from '../shared/projection.js';
import { monthsBetween } from '../shared/summary.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import {
  axisTick,
  shortMonth,
  tickEuros,
  tooltipAmount,
  tooltipStyles,
} from './DashboardCharts.js';
import { Field } from './Field.js';
import { monthLabel, todayISO } from './months.js';
import {
  describeScenario,
  emptyScenarioForm,
  goalReachedText,
  validateScenarioForm,
  type ScenarioField,
  type ScenarioFormValues,
} from './projectionForm.js';

import { PageHeader } from './PageHeader.js';
import { SidePanel, usePanel } from './SidePanel.js';

const defaultApi = createApiClient();

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

/** One dash pattern per goal, so the lines are told apart by shape as well as by their label. */
const GOAL_DASHES = ['6 3', '2 4', '10 3 2 3', '1 5'];

const BASE_LABEL = 'Sin cambios';
const SCENARIO_LABEL = 'Con escenario';

/** One sentence with the chart's message, for the caption and the accessible label. */
export function projectionSummary(
  baselineCents: number,
  base: ProjectionMonthDto[],
  scenario: ProjectionMonthDto[] | undefined,
): string {
  const first = base[0];
  const last = base.at(-1);
  if (first === undefined || last === undefined) {
    return 'Sin datos.';
  }
  const range = `De ${monthLabel(first.month)} a ${monthLabel(last.month)}`;
  const text = `${range}: el ahorro acumulado pasa de ${formatCents(baselineCents)} a ${formatCents(last.accumulatedCents)} sin cambios`;
  const end = scenario?.at(-1);
  return end === undefined
    ? `${text}.`
    : `${text} y a ${formatCents(end.accumulatedCents)} con el escenario.`;
}

export function ProjectionChart(props: {
  baselineCents: number;
  months: ProjectionMonthDto[];
  scenarioMonths: ProjectionMonthDto[] | undefined;
  goals: ProjectionDto['goals'];
}) {
  const { months, scenarioMonths, goals } = props;
  const data = months.map((m, i) => ({
    name: shortMonth(m.month),
    [BASE_LABEL]: m.accumulatedCents,
    [SCENARIO_LABEL]: scenarioMonths?.[i]?.accumulatedCents,
  }));
  const summary = projectionSummary(props.baselineCents, months, scenarioMonths);
  const names = new Set(data.map((d) => d.name));
  return (
    <figure className="chart" data-testid="chart-projection">
      <figcaption>{summary}</figcaption>
      <div className="chart-box" role="img" aria-label={`Gráfico de la proyección. ${summary}`}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 800, height: 320 }}
        >
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={axisTick} stroke="var(--border)" />
            <YAxis tick={axisTick} stroke="var(--border)" tickFormatter={tickEuros} width={80} />
            <Tooltip formatter={tooltipAmount} {...tooltipStyles} />
            <Legend wrapperStyle={{ color: 'var(--text)' }} />
            {goals.map((goal, index) => (
              // `extendDomain`: a target above everything projected (or below, when savings go
              // negative) must still be drawn; Recharts would otherwise discard it.
              <ReferenceLine
                key={`target-${String(goal.id)}`}
                y={goal.targetAmountCents}
                ifOverflow="extendDomain"
                stroke="var(--repayment)"
                strokeDasharray={GOAL_DASHES[index % GOAL_DASHES.length]}
                label={{
                  value: goal.name,
                  fill: 'var(--repayment)',
                  fontSize: 12,
                  position: 'insideTopLeft',
                }}
              />
            ))}
            {goals.flatMap((goal, index) =>
              names.has(shortMonth(goal.targetDate.slice(0, 7)))
                ? [
                    <ReferenceLine
                      key={`date-${String(goal.id)}`}
                      x={shortMonth(goal.targetDate.slice(0, 7))}
                      stroke="var(--repayment)"
                      strokeDasharray={GOAL_DASHES[index % GOAL_DASHES.length]}
                      label={{
                        value: `${goal.name} (fecha)`,
                        fill: 'var(--repayment)',
                        fontSize: 12,
                        position: 'insideTopRight',
                      }}
                    />,
                  ]
                : [],
            )}
            <Line
              type="monotone"
              dataKey={BASE_LABEL}
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
            />
            {scenarioMonths !== undefined && (
              <Line
                type="monotone"
                dataKey={SCENARIO_LABEL}
                stroke="var(--income)"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function ScenarioForm(props: {
  values: ScenarioFormValues;
  categories: CategoryDto[];
  errors: Partial<Record<ScenarioField, string>>;
  onChange: (values: ScenarioFormValues) => void;
  onSubmit: () => void;
}) {
  const { values, errors } = props;
  const expenseCategories = props.categories.filter((c) => c.kind === 'expense');
  const set = (patch: Partial<ScenarioFormValues>) => {
    props.onChange({ ...values, ...patch });
  };
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    props.onSubmit();
  };
  return (
    <form className="movement-form" onSubmit={submit} noValidate aria-label="Añadir un ajuste">
      <h2>Escenarios</h2>
      <p className="hint">
        Prueba cambios y compara. Los escenarios no se guardan: viven solo en esta página.
      </p>
      <div className="form-grid">
        <Field id="scenario-type" label="Ajuste" error={undefined}>
          <select
            id="scenario-type"
            value={values.type}
            onChange={(e) => {
              set({ type: e.target.value === 'category' ? 'category' : 'income', amount: '' });
            }}
          >
            <option value="income">Cambio en los ingresos mensuales</option>
            <option value="category">Una categoría de gasto pasa a otro importe</option>
          </select>
        </Field>
        <Field id="scenario-fromMonth" label="Desde (mes)" error={errors.fromMonth}>
          <input
            id="scenario-fromMonth"
            type="month"
            value={values.fromMonth}
            aria-describedby={
              errors.fromMonth === undefined ? undefined : 'scenario-fromMonth-error'
            }
            onChange={(e) => {
              set({ fromMonth: e.target.value });
            }}
          />
        </Field>
        {values.type === 'category' && (
          <Field id="scenario-categoryId" label="Categoría de gasto" error={errors.categoryId}>
            <select
              id="scenario-categoryId"
              value={values.categoryId}
              aria-describedby={
                errors.categoryId === undefined ? undefined : 'scenario-categoryId-error'
              }
              onChange={(e) => {
                set({ categoryId: e.target.value });
              }}
            >
              <option value="">Elige una categoría</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field
          id="scenario-amount"
          label={
            values.type === 'income' ? 'Ingresos al mes: más o menos (€)' : 'Nuevo gasto al mes (€)'
          }
          error={errors.amount}
        >
          <input
            id="scenario-amount"
            type="text"
            inputMode="decimal"
            placeholder={values.type === 'income' ? '+200,00' : '150,00'}
            value={values.amount}
            aria-describedby={errors.amount === undefined ? undefined : 'scenario-amount-error'}
            onChange={(e) => {
              set({ amount: e.target.value });
            }}
          />
        </Field>
      </div>
      <div className="form-actions">
        <button type="submit" className="primary">
          Guardar ajuste
        </button>
      </div>
    </form>
  );
}

/** What the projection includes and leaves out, written under the chart. */
export function ProjectionExplanation() {
  return (
    <section className="projection-notes" aria-label="Qué incluye la proyección">
      <h2>Qué incluye la proyección</h2>
      <p>
        Parte del ahorro acumulado hasta el final del mes pasado y suma, mes a mes, el ahorro
        previsto: ingresos menos gastos y amortizaciones.
      </p>
      <ul>
        <li>
          <strong>Incluye</strong> los fijos activos de cada mes (con su mes inicial y final) y el
          presupuesto de las categorías de gasto que no tienen ningún fijo ese mes.
        </li>
        <li>
          <strong>Mes actual:</strong> lo ya confirmado cuenta tal cual, los fijos pendientes se
          añaden y el presupuesto solo cubre lo que falta de cada categoría.
        </li>
        <li>
          <strong>No incluye</strong> ingresos ni gastos puntuales que no sean fijos ni estén en una
          categoría con presupuesto, intereses del ahorro, inflación, subidas de sueldo ni la
          evolución de las deudas más allá de sus cuotas fijas.
        </li>
        <li>
          <strong>Escenarios:</strong> un ajuste de una categoría sustituye el total de cada mes
          desde el mes elegido; si es el mes actual, también lo ya gastado en él.
        </li>
        <li>
          <strong>Objetivos:</strong> se marcan en el gráfico, pero no se descuentan del ahorro.
        </li>
      </ul>
    </section>
  );
}

/** The "Proyección" screen: how much will I have saved by a date, with scenarios side by side. */
export function ProjectionPage({ api = defaultApi }: { api?: ApiClient }) {
  // Fixed for the life of the page, and sent to the API so the server's clock is not involved.
  const [today] = useState(() => todayISO());
  const currentMonth = today.slice(0, 7);
  const [endMonth, setEndMonth] = useState(() => addMonths(currentMonth, 11));
  const [data, setData] = useState<ProjectionDto | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [form, setForm] = useState<ScenarioFormValues>(() => emptyScenarioForm(currentMonth));
  const [errors, setErrors] = useState<Partial<Record<ScenarioField, string>>>({});
  const panel = usePanel();

  const rangeError =
    endMonth < currentMonth
      ? 'El mes final no puede ser anterior al mes actual.'
      : monthsBetween(currentMonth, endMonth) + 1 > MAX_PROJECTION_MONTHS
        ? `El mes final no puede estar a más de ${String(MAX_PROJECTION_MONTHS)} meses.`
        : undefined;

  useEffect(() => {
    if (rangeError !== undefined) {
      return;
    }
    let active = true;
    api.projection(endMonth, today).then(
      (result) => {
        if (active) {
          setData(result);
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
  }, [api, endMonth, today, rangeError]);

  const addScenario = () => {
    if (data === undefined) {
      return;
    }
    const result = validateScenarioForm(form, data, data.categories);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setScenarios((current) => [...current, result.scenario]);
    setErrors({});
    setForm({ ...form, amount: '' });
    panel.hide();
  };

  // A scenario that starts after a shorter end month no longer applies to anything: drop it.
  const active = data === undefined ? [] : scenarios.filter((s) => s.fromMonth <= data.endMonth);
  const scenarioMonths =
    data === undefined || active.length === 0
      ? undefined
      : applyScenarios(data.months, data.baselineCents, active, data.categories);

  return (
    <main className="page">
      <PageHeader
        title="Proyección"
        action={
          <button
            type="button"
            className="primary"
            disabled={data === undefined || rangeError !== undefined}
            onClick={panel.show}
          >
            Añadir ajuste
          </button>
        }
      />
      <p className="hint">¿Cuánto tendré ahorrado en una fecha? Elige hasta qué mes proyectar.</p>

      <div className="field">
        <label htmlFor="projection-end">Proyectar hasta (mes)</label>
        <input
          id="projection-end"
          type="month"
          value={endMonth}
          aria-describedby={rangeError === undefined ? undefined : 'projection-end-error'}
          onChange={(e) => {
            if (e.target.value !== '') {
              // The old months belong to the old range: drop them (and their error) while the
              // new ones load, so the screen never shows a range the input no longer says.
              setData(undefined);
              setLoadError(undefined);
              setEndMonth(e.target.value);
            }
          }}
        />
        {rangeError !== undefined && (
          <p className="field-error" id="projection-end-error" role="alert">
            {rangeError}
          </p>
        )}
      </div>

      {loadError !== undefined && (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}

      {data !== undefined && rangeError === undefined && (
        <>
          <ProjectionChart
            baselineCents={data.baselineCents}
            months={data.months}
            scenarioMonths={scenarioMonths}
            goals={data.goals}
          />

          {data.goals.length > 0 && (
            <section aria-label="Objetivos en la proyección">
              <h2>Objetivos</h2>
              <ul className="goal-projection">
                {data.goals.map((goal) => (
                  <li key={goal.id}>
                    <strong>{goal.name}</strong>: {formatCents(goal.targetAmountCents)} para el{' '}
                    {goal.targetDate.split('-').reverse().join('/')}.{' '}
                    {goalReachedText(
                      data.months,
                      goal.targetAmountCents,
                      goal.targetDate.slice(0, 7),
                    )}
                    {scenarioMonths !== undefined && (
                      <>
                        {' '}
                        · con el escenario{' '}
                        {goalReachedText(
                          scenarioMonths,
                          goal.targetAmountCents,
                          goal.targetDate.slice(0, 7),
                        )}
                      </>
                    )}
                    .
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ProjectionExplanation />

          <SidePanel
            open={panel.open}
            title="Añadir ajuste"
            onClose={() => {
              setForm(emptyScenarioForm(currentMonth));
              setErrors({});
              panel.hide();
            }}
          >
            <ScenarioForm
              values={form}
              categories={data.categories}
              errors={errors}
              onChange={(values) => {
                setForm(values);
                setErrors({});
              }}
              onSubmit={addScenario}
            />
          </SidePanel>
          <p className="hint">
            Los ajustes no se guardan: viven solo en esta página y cambian la proyección.
          </p>
          {scenarios.length > 0 && (
            <section aria-label="Ajustes del escenario">
              <ul className="rule-list">
                {scenarios.map((scenario, index) => (
                  <li key={`${scenario.type}-${scenario.fromMonth}-${String(index)}`}>
                    {describeScenario(scenario, data.categories)}
                    {scenario.fromMonth > data.endMonth && (
                      <span className="notes"> (empieza después del mes final: no se aplica)</span>
                    )}{' '}
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        setScenarios((current) => current.filter((_, i) => i !== index));
                      }}
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  setScenarios([]);
                }}
              >
                Quitar todos los ajustes
              </button>
            </section>
          )}

          <details className="chart-data" open>
            <summary>Ver los datos mes a mes</summary>
            <table className="movements projection-table">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th className="amount">Ingresos</th>
                  <th className="amount">Gastos</th>
                  <th className="amount">Amortizaciones</th>
                  <th className="amount">Ahorro del mes</th>
                  <th className="amount">Acumulado</th>
                  {scenarioMonths !== undefined && (
                    <th className="amount">Acumulado con escenario</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.months.map((m, i) => (
                  <tr key={m.month}>
                    <th scope="row">{monthLabel(m.month)}</th>
                    <td className="amount">{formatCents(m.incomeCents)}</td>
                    <td className="amount">{formatCents(m.expenseCents)}</td>
                    <td className="amount">{formatCents(m.repaymentCents)}</td>
                    <td className="amount">{formatCents(m.savingsCents)}</td>
                    <td className="amount">{formatCents(m.accumulatedCents)}</td>
                    {scenarioMonths !== undefined && (
                      <td className="amount">
                        {formatCents(scenarioMonths[i]?.accumulatedCents ?? 0)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}

      {data === undefined && loadError === undefined && rangeError === undefined && (
        <p className="empty">Calculando…</p>
      )}
    </main>
  );
}
