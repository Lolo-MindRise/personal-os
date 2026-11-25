import { useEffect, useState, type ReactNode } from 'react';
import type { DashboardDebtDto, DashboardDto, GoalDto } from '../shared/api.js';
import { monthChangePointsText, monthChangeText } from '../shared/dashboard.js';
import { formatCents } from '../shared/money.js';
import { hrefFor, type Params, type View } from './router.js';
import { CategoriesChart, MonthsChart } from './DashboardCharts.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import { formatDate, todayISO } from './months.js';
import { PageHeader } from './PageHeader.js';
import { useMonth } from './router.js';

const defaultApi = createApiClient();

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

/** A link to another screen, optionally already filtered (`params`). */
function GoTo({ view, params, children }: { view: View; params?: Params; children: ReactNode }) {
  return <a href={hrefFor(view, params)}>{children}</a>;
}

/** What to set up when a block has no data: a sentence and a link to the screen that fixes it. */
function EmptyState({ children, view, link }: { children: ReactNode; view: View; link: string }) {
  return (
    <p className="empty dashboard-empty">
      {children} <GoTo view={view}>{link}</GoTo>
    </p>
  );
}

function ProgressBar({
  percent,
  label,
  tone = 'accent',
}: {
  percent: number;
  label: string;
  tone?: string;
}) {
  return (
    <div
      className="bar-track progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <span className={`bar bar-${tone}`} style={{ width: `${String(percent)}%` }} />
    </div>
  );
}

const goalStatusText = (goal: GoalDto) =>
  goal.status === 'reached'
    ? 'Objetivo conseguido.'
    : goal.status === 'overdue'
      ? 'Vencido.'
      : undefined;

/** The change against the previous month; renders nothing without previous data. */
function Change({ text, testId }: { text: string | null; testId: string }) {
  return text === null ? null : (
    <dd className="card-note" data-testid={testId}>
      {text}
    </dd>
  );
}

export function KeyFigures({ data }: { data: DashboardDto }) {
  const { keyFigures: k, setup } = data;
  const prev = k.previous;
  const goal = k.nextGoal;
  return (
    <section aria-label="Cifras clave" className="key-figures">
      <dl className="summary-item" data-testid="figure-accumulated">
        <dt>
          <GoTo view="summary" params={{ year: data.month.slice(0, 4) }}>
            Ahorro acumulado
          </GoTo>
        </dt>
        <dd
          className={
            k.accumulatedSavingsCents !== null && k.accumulatedSavingsCents < 0
              ? 'negative-text'
              : undefined
          }
        >
          {k.accumulatedSavingsCents === null ? '—' : formatCents(k.accumulatedSavingsCents)}
        </dd>
        <Change
          testId="change-accumulated"
          text={monthChangeText(
            k.accumulatedSavingsCents,
            prev.accumulatedSavingsCents,
            prev.month,
          )}
        />
        {k.accumulatedSavingsCents === null && (
          <dd className="card-note">Este mes es anterior a la fecha del saldo inicial.</dd>
        )}
        {!setup.initialBalance && (
          <dd className="card-note">
            Sin saldo inicial: solo suma los movimientos.{' '}
            <GoTo view="summary" params={{ year: data.month.slice(0, 4) }}>
              Indicar saldo inicial
            </GoTo>
          </dd>
        )}
      </dl>

      <dl className="summary-item" data-testid="figure-goal">
        <dt>
          <GoTo view="goals">Próximo objetivo</GoTo>
        </dt>
        {goal === null ? (
          <dd className="card-small">—</dd>
        ) : (
          <dd className="card-small">
            {goal.name}
            <span className="card-note">
              {String(goal.progressPercent)} % de {formatCents(goal.targetAmountCents)}
            </span>
          </dd>
        )}
        <Change
          testId="change-goal"
          text={monthChangePointsText(
            goal?.progressPercent ?? null,
            prev.goalProgressPercent,
            prev.month,
          )}
        />
        {goal === null && (
          <dd className="card-note">
            {setup.goals ? 'Ningún objetivo con fecha futura.' : 'Aún no tienes objetivos.'}{' '}
            <GoTo view="goals">{setup.goals ? 'Ver objetivos' : 'Añadir un objetivo'}</GoTo>
          </dd>
        )}
      </dl>

      <dl className="summary-item" data-testid="figure-debt">
        <dt>
          <GoTo view="debts">Deuda total estimada</GoTo>
        </dt>
        <dd>{formatCents(k.totalDebtCents)}</dd>
        <Change
          testId="change-debt"
          text={monthChangeText(k.totalDebtCents, prev.totalDebtCents, prev.month)}
        />
        {!setup.debts && (
          <dd className="card-note">
            No has registrado deudas. <GoTo view="debts">Añadir una deuda</GoTo>
          </dd>
        )}
      </dl>

      <dl
        className={k.projectedSavingsCents < 0 ? 'summary-item negative' : 'summary-item'}
        data-testid="figure-projected"
      >
        <dt>
          <GoTo view="movements" params={{ month: data.month }}>
            Ahorro previsto del mes
          </GoTo>
        </dt>
        <dd>{formatCents(k.projectedSavingsCents)}</dd>
        <Change
          testId="change-projected"
          text={monthChangeText(k.projectedSavingsCents, prev.projectedSavingsCents, prev.month)}
        />
        {!setup.movements && (
          <dd className="card-note">
            Aún no hay movimientos.{' '}
            <GoTo view="movements" params={{ month: data.month }}>
              Añadir uno
            </GoTo>
          </dd>
        )}
      </dl>
    </section>
  );
}

export function GoalCard({ goal }: { goal: GoalDto }) {
  const note = goalStatusText(goal);
  return (
    <article className="debt-card" data-testid="goal-card">
      <h3>
        <GoTo view="goals">{goal.name}</GoTo>
      </h3>
      <p className="card-big">
        {formatCents(Math.min(Math.max(goal.accumulatedCents, 0), goal.targetAmountCents))}{' '}
        <span className="muted">de {formatCents(goal.targetAmountCents)}</span>
      </p>
      <ProgressBar
        percent={goal.progressPercent}
        label={`Progreso hacia ${goal.name}`}
        tone="income"
      />
      <p className="card-note">
        {String(goal.progressPercent)} % · fecha objetivo {formatDate(goal.targetDate)}
      </p>
      {note !== undefined ? (
        <p className="card-note">{note}</p>
      ) : (
        <p className="card-note">
          Faltan {formatCents(goal.remainingCents)}
          {goal.monthlyRequiredCents !== null && goal.monthsLeft !== null && (
            <>
              {' '}
              · {formatCents(goal.monthlyRequiredCents)} al mes durante {String(goal.monthsLeft)}{' '}
              {goal.monthsLeft === 1 ? 'mes' : 'meses'}
            </>
          )}
        </p>
      )}
    </article>
  );
}

export function DebtCard({ debt }: { debt: DashboardDebtDto }) {
  return (
    <article className="debt-card" data-testid="debt-card">
      <h3>
        <GoTo view="debts" params={{ debt: String(debt.id) }}>
          {debt.name}
        </GoTo>
      </h3>
      <p className="card-big">{formatCents(debt.estimatedBalanceCents)}</p>
      <p className="card-note">
        {String(debt.remainingInstallments)} cuotas restantes ·{' '}
        {formatCents(debt.monthlyPaymentCents)} al mes
      </p>
      {debt.progressPercent !== null && (
        <>
          <ProgressBar
            percent={debt.progressPercent}
            label={`Amortizado de ${debt.name}`}
            tone="repayment"
          />
          <p className="card-note">
            {String(debt.progressPercent)} % del saldo registrado amortizado desde el{' '}
            {formatDate(debt.balanceAsOf)} ({formatCents(debt.repaidSinceCents)} de{' '}
            {formatCents(debt.recordedBalanceCents)})
          </p>
          <p className="card-note" data-testid="debt-interest">
            Intereses pagados en cuotas: {formatCents(debt.interestPaidCents)}
          </p>
        </>
      )}
    </article>
  );
}

export function DashboardView({ data }: { data: DashboardDto }) {
  const { setup, keyFigures, upcoming } = data;
  return (
    <>
      <KeyFigures data={data} />

      <section className="dashboard-section">
        <h2>Últimos 12 meses</h2>
        {setup.movements ? (
          <MonthsChart months={data.months} />
        ) : (
          <EmptyState view="movements" link="Añadir un movimiento">
            Aún no hay movimientos, así que no hay nada que dibujar.
          </EmptyState>
        )}
      </section>

      <section className="dashboard-section">
        <h2>Gastos del mes frente al presupuesto</h2>
        {data.categories.length > 0 ? (
          <>
            <CategoriesChart categories={data.categories} month={data.month} />
            {!setup.budget && (
              <EmptyState view="budget" link="Definir un presupuesto">
                Sin presupuesto no hay con qué comparar.
              </EmptyState>
            )}
          </>
        ) : setup.budget ? (
          <p className="empty dashboard-empty">No hay gastos ni presupuesto en este mes.</p>
        ) : (
          <EmptyState view="budget" link="Definir un presupuesto">
            Sin presupuesto ni gastos en este mes.
          </EmptyState>
        )}
      </section>

      <div className="dashboard-columns">
        <section className="dashboard-section">
          <h2>Deudas</h2>
          {data.debts.items.length === 0 ? (
            <EmptyState view="debts" link="Añadir una deuda">
              No has registrado deudas.
            </EmptyState>
          ) : (
            <>
              <p className="card-note">
                Total estimado: <strong>{formatCents(data.debts.totalEstimatedCents)}</strong>. Cada
                cuota confirmada de un fijo vinculado reduce la deuda en su parte de capital.
              </p>
              {data.debts.items.map((debt) => (
                <DebtCard key={debt.id} debt={debt} />
              ))}
            </>
          )}
        </section>

        <section className="dashboard-section">
          <h2>Objetivo</h2>
          {keyFigures.nextGoal === null ? (
            <EmptyState view="goals" link={setup.goals ? 'Ver objetivos' : 'Añadir un objetivo'}>
              {setup.goals ? 'Ningún objetivo con fecha futura.' : 'Aún no tienes objetivos.'}
            </EmptyState>
          ) : (
            <GoalCard goal={keyFigures.nextGoal} />
          )}
        </section>
      </div>

      <div className="dashboard-columns">
        <section className="dashboard-section">
          <h2>Fijos pendientes del mes</h2>
          {upcoming.pending.length === 0 ? (
            <EmptyState view="recurring" link="Ver fijos">
              No queda ningún fijo pendiente este mes.
            </EmptyState>
          ) : (
            <ul className="upcoming" data-testid="upcoming-pending">
              {upcoming.pending.map((e) => (
                <li key={e.recurringItemId}>
                  <span className="muted">{formatDate(e.date)}</span>{' '}
                  <GoTo view="movements" params={{ month: data.month }}>
                    {e.concept}
                  </GoTo>{' '}
                  <span className={`kind-${e.kind}`}>{formatCents(e.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
          {upcoming.pending.length > 0 && (
            <p className="card-note">
              <GoTo view="movements" params={{ month: data.month }}>
                Confirmar en Movimientos
              </GoTo>
            </p>
          )}
        </section>

        <section className="dashboard-section">
          <h2>Próximos hitos</h2>
          {upcoming.milestones.length === 0 ? (
            <EmptyState view="milestones" link="Añadir un hito">
              No hay hitos pendientes.
            </EmptyState>
          ) : (
            <ul className="upcoming" data-testid="upcoming-milestones">
              {upcoming.milestones.map((m) => (
                <li key={m.id}>
                  <span className="muted">{formatDate(m.targetDate)}</span>{' '}
                  <GoTo view="milestones">{m.title}</GoTo>
                  {m.overdue && <span className="overdue-flag">Vencido</span>}
                </li>
              ))}
            </ul>
          )}
          {upcoming.milestones.length > 0 && (
            <p className="card-note">
              <GoTo view="milestones">Ver todos los hitos</GoTo>
            </p>
          )}
        </section>
      </div>
    </>
  );
}

/** The "Inicio" screen: the financial situation at a glance, for the selected month. */
export function DashboardPage({ api = defaultApi }: { api?: ApiClient }) {
  const [month, setMonth] = useMonth();
  const [data, setData] = useState<DashboardDto | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    api.dashboard(month, todayISO()).then(
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
  }, [api, month]);

  return (
    <main className="page dashboard">
      <PageHeader
        title="Inicio"
        month={month}
        onMonthChange={setMonth}
        hint="Tu situación de un vistazo. Los gráficos cuentan solo movimientos confirmados; el ahorro previsto suma además los fijos pendientes del mes."
      />
      {error !== undefined && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {data !== undefined && <DashboardView data={data} />}
    </main>
  );
}
