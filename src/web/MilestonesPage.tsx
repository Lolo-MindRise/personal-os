import { useEffect, useState, type SubmitEvent } from 'react';
import type { MilestoneDto } from '../shared/api.js';
import { MILESTONE_STATUSES, type MilestoneStatus } from '../shared/constants.js';
import { isOverdue } from '../shared/milestones.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import { Field } from './Field.js';
import { STATUS_LABELS } from './labels.js';
import {
  emptyMilestoneForm,
  formFromMilestone,
  mapMilestoneApiErrors,
  validateMilestoneForm,
  type MilestoneField,
  type MilestoneFormValues,
} from './milestoneForm.js';
import { formatDate, todayISO } from './months.js';

const defaultApi = createApiClient();

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

type Errors = Partial<Record<MilestoneField, string>>;

export function MilestoneList({
  milestones,
  today = todayISO(),
  onEdit,
}: {
  milestones: MilestoneDto[];
  /** Today's date, to tell which milestones are overdue. Defaults to the real one. */
  today?: string;
  onEdit: (milestone: MilestoneDto) => void;
}) {
  if (milestones.length === 0) {
    return <p className="empty">Todavía no hay hitos. Añade el primero arriba.</p>;
  }
  return (
    <table className="movements milestones">
      <thead>
        <tr>
          <th>Fecha objetivo</th>
          <th>Hito</th>
          <th>Estado</th>
          <th>
            <span className="visually-hidden">Acciones</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {milestones.map((milestone) => {
          const overdue = isOverdue(milestone, today);
          return (
            <tr key={milestone.id} className={overdue ? 'overdue-row' : undefined}>
              <td>{formatDate(milestone.targetDate)}</td>
              <td>
                {milestone.title}
                {milestone.notes !== null && <span className="notes">{milestone.notes}</span>}
              </td>
              <td>
                <span className={`status status-${milestone.status}`}>
                  {STATUS_LABELS[milestone.status]}
                </span>
                {/* Not only colour: an overdue milestone also says so. */}
                {overdue && <span className="overdue-flag">Vencido</span>}
              </td>
              <td className="actions">
                <button
                  type="button"
                  onClick={() => {
                    onEdit(milestone);
                  }}
                >
                  Editar
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function MilestoneForm(props: {
  values: MilestoneFormValues;
  errors: Errors;
  formError: string | undefined;
  editing: boolean;
  busy: boolean;
  onChange: (values: MilestoneFormValues) => void;
  onSubmit: (values: MilestoneFormValues) => void;
  onCancel: () => void;
}) {
  const { values, errors, editing } = props;
  const describe = (field: MilestoneField) =>
    errors[field] === undefined ? undefined : `milestone-${field}-error`;
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    props.onSubmit(values);
  };
  return (
    <form className="movement-form" onSubmit={submit} noValidate>
      <h2>{editing ? 'Editar hito' : 'Añadir hito'}</h2>
      <div className="form-grid">
        <Field id="milestone-title" label="Título" error={errors.title}>
          <input
            id="milestone-title"
            type="text"
            value={values.title}
            aria-describedby={describe('title')}
            onChange={(e) => {
              props.onChange({ ...values, title: e.target.value });
            }}
          />
        </Field>
        <Field id="milestone-targetDate" label="Fecha objetivo" error={errors.targetDate}>
          <input
            id="milestone-targetDate"
            type="date"
            value={values.targetDate}
            aria-describedby={describe('targetDate')}
            onChange={(e) => {
              props.onChange({ ...values, targetDate: e.target.value });
            }}
          />
        </Field>
        <Field id="milestone-status" label="Estado" error={errors.status}>
          <select
            id="milestone-status"
            value={values.status}
            aria-describedby={describe('status')}
            onChange={(e) => {
              props.onChange({ ...values, status: e.target.value as MilestoneStatus });
            }}
          >
            {MILESTONE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="milestone-notes" label="Notas" error={errors.notes}>
          <input
            id="milestone-notes"
            type="text"
            value={values.notes}
            aria-describedby={describe('notes')}
            onChange={(e) => {
              props.onChange({ ...values, notes: e.target.value });
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
          {editing ? 'Guardar cambios' : 'Añadir'}
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

/** The "Hitos" screen: milestones by target date; overdue ones that are not done stand out. */
export function MilestonesPage({ api = defaultApi }: { api?: ApiClient }) {
  const [milestones, setMilestones] = useState<MilestoneDto[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [reloads, setReloads] = useState(0);

  const [form, setForm] = useState<MilestoneFormValues>(emptyMilestoneForm);
  const [editingId, setEditingId] = useState<number | undefined>();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.milestones().then(
      (rows) => {
        if (active) {
          setMilestones(rows);
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

  const resetForm = () => {
    setForm(emptyMilestoneForm());
    setEditingId(undefined);
    setErrors({});
    setFormError(undefined);
  };

  const submit = async (values: MilestoneFormValues) => {
    const result = validateMilestoneForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setBusy(true);
    setErrors({});
    setFormError(undefined);
    try {
      if (editingId === undefined) {
        await api.createMilestone(result.payload);
      } else {
        await api.updateMilestone(editingId, result.payload);
      }
      resetForm();
      setReloads((n) => n + 1);
    } catch (error) {
      const mapped = mapMilestoneApiErrors(error instanceof ApiError ? error.fields : {});
      setErrors(mapped);
      setFormError(Object.keys(mapped).length === 0 ? messageOf(error) : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <h1>Hitos</h1>
      <p className="hint">
        Pasos con fecha hacia tus objetivos, ordenados por fecha. Los que han pasado de fecha sin
        estar hechos aparecen marcados como vencidos.
      </p>

      {loadError !== undefined && (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}

      <MilestoneForm
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

      <MilestoneList
        milestones={milestones}
        onEdit={(milestone) => {
          setForm(formFromMilestone(milestone));
          setEditingId(milestone.id);
          setErrors({});
          setFormError(undefined);
        }}
      />
    </main>
  );
}
