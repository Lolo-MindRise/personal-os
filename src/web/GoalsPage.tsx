import { useEffect, useState, type SubmitEvent } from 'react';
import type { GoalDto } from '../shared/api.js';
import { formatCents } from '../shared/money.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import { Field } from './Field.js';
import { formatDate } from './months.js';
import {
  emptyGoalForm,
  formFromGoal,
  mapGoalApiErrors,
  validateGoalForm,
  type GoalField,
  type GoalFormValues,
} from './summaryForms.js';

import { PageHeader, SubNav } from './PageHeader.js';
import { SidePanel, usePanel } from './SidePanel.js';
import { hrefFor } from './router.js';

const defaultApi = createApiClient();

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

type Errors = Partial<Record<GoalField, string>>;

const STATUS_NOTES = {
  reached: 'Objetivo conseguido.',
  overdue: 'La fecha ya ha pasado y falta dinero.',
} as const;

export function GoalList({ goals, onEdit }: { goals: GoalDto[]; onEdit: (goal: GoalDto) => void }) {
  if (goals.length === 0) {
    return (
      <p className="empty">
        Todavía no hay objetivos. Pulsa «Añadir objetivo» para crear el primero.
      </p>
    );
  }
  return (
    <div className="goal-list">
      {goals.map((goal) => (
        <section key={goal.id} className="debt-card" aria-label={goal.name}>
          <div className="section-header">
            <h2>{goal.name}</h2>
            <button
              type="button"
              onClick={() => {
                onEdit(goal);
              }}
            >
              Editar
            </button>
          </div>
          <div
            className="goal-progress"
            role="progressbar"
            aria-label={`Progreso de ${goal.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={goal.progressPercent}
          >
            <span
              className={`bar bar-${goal.status === 'overdue' ? 'negative' : 'income'}`}
              style={{ width: `${String(goal.progressPercent)}%` }}
            />
          </div>
          <dl className="debt-facts">
            <div>
              <dt>Ahorrado</dt>
              <dd>
                {formatCents(Math.max(0, goal.accumulatedCents))} de{' '}
                {formatCents(goal.targetAmountCents)}
                <span className="notes">{goal.progressPercent} %</span>
              </dd>
            </div>
            <div>
              <dt>Falta</dt>
              <dd>{formatCents(goal.remainingCents)}</dd>
            </div>
            <div>
              <dt>Fecha objetivo</dt>
              <dd>{formatDate(goal.targetDate)}</dd>
            </div>
            <div>
              <dt>Ahorro mensual necesario</dt>
              <dd className="debt-estimate">
                {goal.monthlyRequiredCents === null ? '—' : formatCents(goal.monthlyRequiredCents)}
                {goal.monthsLeft !== null && (
                  <span className="notes">
                    en {goal.monthsLeft} {goal.monthsLeft === 1 ? 'mes' : 'meses'}
                  </span>
                )}
              </dd>
            </div>
          </dl>
          {goal.status !== 'open' && <p className="goal-status">{STATUS_NOTES[goal.status]}</p>}
        </section>
      ))}
    </div>
  );
}

export function GoalForm(props: {
  values: GoalFormValues;
  errors: Errors;
  formError: string | undefined;
  editing: boolean;
  busy: boolean;
  onChange: (values: GoalFormValues) => void;
  onSubmit: (values: GoalFormValues) => void;
  onCancel: () => void;
}) {
  const { values, errors, editing } = props;
  const describe = (field: GoalField) =>
    errors[field] === undefined ? undefined : `goal-${field}-error`;
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    props.onSubmit(values);
  };
  return (
    <form className="movement-form" onSubmit={submit} noValidate>
      <h2>{editing ? 'Editar objetivo' : 'Añadir objetivo'}</h2>
      <div className="form-grid">
        <Field id="goal-name" label="Nombre" error={errors.name}>
          <input
            id="goal-name"
            type="text"
            value={values.name}
            aria-describedby={describe('name')}
            onChange={(e) => {
              props.onChange({ ...values, name: e.target.value });
            }}
          />
        </Field>
        <Field id="goal-target" label="Importe objetivo (€)" error={errors.target}>
          <input
            id="goal-target"
            type="text"
            inputMode="decimal"
            placeholder="6.000,00"
            value={values.target}
            aria-describedby={describe('target')}
            onChange={(e) => {
              props.onChange({ ...values, target: e.target.value });
            }}
          />
        </Field>
        <Field id="goal-targetDate" label="Fecha objetivo" error={errors.targetDate}>
          <input
            id="goal-targetDate"
            type="date"
            value={values.targetDate}
            aria-describedby={describe('targetDate')}
            onChange={(e) => {
              props.onChange({ ...values, targetDate: e.target.value });
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
          Guardar objetivo
        </button>
        {editing && (
          <button type="button" onClick={props.onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

/** The "Objetivos" screen: savings goals with progress against the accumulated savings. */
export function GoalsPage({ api = defaultApi }: { api?: ApiClient }) {
  const [goals, setGoals] = useState<GoalDto[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [reloads, setReloads] = useState(0);

  const [form, setForm] = useState<GoalFormValues>(emptyGoalForm);
  const [editingId, setEditingId] = useState<number | undefined>();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.goals().then(
      (rows) => {
        if (active) {
          setGoals(rows);
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

  const panel = usePanel();
  const resetForm = () => {
    setForm(emptyGoalForm());
    setEditingId(undefined);
    setErrors({});
    setFormError(undefined);
    panel.hide();
  };

  const submit = async (values: GoalFormValues) => {
    const result = validateGoalForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setBusy(true);
    setErrors({});
    setFormError(undefined);
    try {
      if (editingId === undefined) {
        await api.createGoal(result.payload);
      } else {
        await api.updateGoal(editingId, result.payload);
      }
      resetForm();
      setReloads((n) => n + 1);
    } catch (error) {
      const mapped = mapGoalApiErrors(error instanceof ApiError ? error.fields : {});
      setErrors(mapped);
      setFormError(Object.keys(mapped).length === 0 ? messageOf(error) : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <PageHeader
        title="Objetivos"
        action={
          <button
            type="button"
            className="primary"
            onClick={() => {
              resetForm();
              panel.show();
            }}
          >
            Añadir objetivo
          </button>
        }
      />
      <SubNav
        current="goals"
        items={[
          { id: 'summary', label: 'Resumen del año', href: hrefFor('summary') },
          { id: 'goals', label: 'Objetivos', href: hrefFor('goals') },
        ]}
      />
      <p className="hint">
        El progreso se mide contra el ahorro acumulado de «Resumen» (con su saldo inicial). Todos
        los objetivos se comparan con el mismo ahorro: no se reparte entre ellos. El ahorro mensual
        necesario cuenta el mes actual.
      </p>

      {loadError !== undefined && (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}

      <SidePanel
        open={panel.open}
        title={editingId === undefined ? 'Añadir objetivo' : 'Editar objetivo'}
        onClose={resetForm}
      >
        <GoalForm
          values={form}
          errors={errors}
          formError={formError}
          editing={editingId !== undefined}
          busy={busy}
          onChange={(values) => {
            setForm(values);
            setErrors({});
          }}
          onSubmit={(values) => void submit(values)}
          onCancel={resetForm}
        />
      </SidePanel>

      <GoalList
        goals={goals}
        onEdit={(goal) => {
          setForm(formFromGoal(goal));
          setEditingId(goal.id);
          panel.show();
          setErrors({});
          setFormError(undefined);
        }}
      />
    </main>
  );
}
