import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import type { CategoryUsageDto } from '../shared/api.js';
import { KINDS, type Kind } from '../shared/constants.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import { groupByKind, usageReason, validateCategoryName } from './categories.js';
import { Field } from './Field.js';
import { KIND_LABELS } from './labels.js';

import { PageHeader } from './PageHeader.js';

const defaultApi = createApiClient();

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

const KIND_HEADINGS: Record<Kind, string> = {
  income: 'Ingresos',
  expense: 'Gastos',
  repayment: 'Amortizaciones',
};

export function CategoryForm(props: {
  name: string;
  kind: Kind;
  editing: boolean;
  busy: boolean;
  error: string | undefined;
  formError: string | undefined;
  onName: (name: string) => void;
  onKind: (kind: Kind) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    props.onSubmit();
  };
  return (
    <form className="movement-form" onSubmit={submit} noValidate>
      <h2>{props.editing ? 'Renombrar categoría' : 'Añadir categoría'}</h2>
      <div className="form-grid">
        <Field id="category-kind" label="Tipo" error={undefined}>
          <select
            id="category-kind"
            value={props.kind}
            disabled={props.editing}
            onChange={(e) => {
              props.onKind(e.target.value as Kind);
            }}
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="category-name" label="Nombre" error={props.error}>
          <input
            id="category-name"
            type="text"
            value={props.name}
            aria-describedby={props.error === undefined ? undefined : 'category-name-error'}
            onChange={(e) => {
              props.onName(e.target.value);
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
          {props.editing ? 'Guardar cambios' : 'Añadir'}
        </button>
        {props.editing && (
          <button type="button" onClick={props.onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

export function CategoryTable(props: {
  categories: CategoryUsageDto[];
  onRename: (category: CategoryUsageDto) => void;
  onDelete: (category: CategoryUsageDto) => void;
}) {
  const groups = groupByKind(props.categories);
  return (
    <>
      {groups.map(([kind, rows]) => (
        <section key={kind} className="category-group" aria-label={KIND_HEADINGS[kind]}>
          <h2>{KIND_HEADINGS[kind]}</h2>
          {rows.length === 0 ? (
            <p className="empty">No hay categorías de este tipo.</p>
          ) : (
            <table className="movements categories">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>
                    <span className="visually-hidden">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const reason = usageReason(c);
                  return (
                    <tr key={c.id}>
                      <td>
                        {c.name}
                        {reason !== undefined && <span className="notes">{reason}</span>}
                      </td>
                      <td className="actions">
                        <button
                          type="button"
                          onClick={() => {
                            props.onRename(c);
                          }}
                        >
                          Renombrar
                        </button>
                        <button
                          type="button"
                          className="danger"
                          disabled={reason !== undefined}
                          title={reason}
                          onClick={() => {
                            props.onDelete(c);
                          }}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </>
  );
}

/** The "Categorías" screen: list by kind, add, rename and delete unused ones. */
export function CategoriesPage({ api = defaultApi }: { api?: ApiClient }) {
  const [categories, setCategories] = useState<CategoryUsageDto[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [reloads, setReloads] = useState(0);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('expense');
  const [editingId, setEditingId] = useState<number | undefined>();
  const [nameError, setNameError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.categoryUsage().then(
      (rows) => {
        if (active) {
          setCategories(rows);
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

  const reload = useCallback(() => {
    setReloads((n) => n + 1);
  }, []);

  const resetForm = () => {
    setName('');
    setKind('expense');
    setEditingId(undefined);
    setNameError(undefined);
    setFormError(undefined);
  };

  const submit = async () => {
    const checked = validateCategoryName(name);
    if (!checked.ok) {
      setNameError(checked.error);
      return;
    }
    setBusy(true);
    setNameError(undefined);
    setFormError(undefined);
    setActionError(undefined);
    try {
      if (editingId === undefined) {
        await api.createCategory({ name: checked.name, kind });
      } else {
        await api.renameCategory(editingId, checked.name);
      }
      resetForm();
      reload();
    } catch (error) {
      const fieldMessage = error instanceof ApiError ? error.fields.name : undefined;
      if (fieldMessage !== undefined) {
        setNameError(fieldMessage);
      } else {
        // Duplicate names come back as a plain 409 message: show it under the form.
        setFormError(messageOf(error));
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (category: CategoryUsageDto) => {
    if (!window.confirm(`¿Eliminar la categoría «${category.name}»?`)) {
      return;
    }
    setActionError(undefined);
    try {
      await api.deleteCategory(category.id);
      if (editingId === category.id) {
        resetForm();
      }
    } catch (error) {
      // E.g. a movement was added meanwhile (409): say so, and refresh the counts.
      setActionError(messageOf(error));
    }
    reload();
  };

  return (
    <main className="page">
      <PageHeader title="Categorías" />
      <p className="hint">
        Las categorías clasifican movimientos, fijos y presupuestos. Una categoría con datos
        asociados no se puede eliminar, pero sí renombrar.
      </p>

      {loadError !== undefined && (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}
      {actionError !== undefined && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}

      <CategoryForm
        name={name}
        kind={kind}
        editing={editingId !== undefined}
        busy={busy}
        error={nameError}
        formError={formError}
        onName={(value) => {
          setName(value);
          setNameError(undefined);
        }}
        onKind={setKind}
        onSubmit={() => void submit()}
        onCancel={resetForm}
      />

      <CategoryTable
        categories={categories}
        onRename={(category) => {
          setEditingId(category.id);
          setName(category.name);
          setKind(category.kind);
          setNameError(undefined);
          setFormError(undefined);
        }}
        onDelete={(category) => void remove(category)}
      />
    </main>
  );
}
