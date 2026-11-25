import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import type { TagDto } from '../shared/api.js';
import { MAX_TAG_LENGTH } from '../shared/schemas.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import { PageHeader } from './PageHeader.js';
import { hrefFor } from './router.js';

const defaultApi = createApiClient();

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

export const TAG_NAME_ERRORS = {
  empty: 'Escribe un nombre para la marca.',
  length: `La marca puede tener como máximo ${String(MAX_TAG_LENGTH)} caracteres.`,
} as const;

/** Validates a new tag name in Spanish; returns the trimmed name or an error. */
export function validateTagName(
  name: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const trimmed = name.trim();
  if (trimmed === '') {
    return { ok: false, error: TAG_NAME_ERRORS.empty };
  }
  if (trimmed.length > MAX_TAG_LENGTH) {
    return { ok: false, error: TAG_NAME_ERRORS.length };
  }
  return { ok: true, name: trimmed };
}

export const countLabel = (n: number) =>
  n === 0 ? 'Sin movimientos' : n === 1 ? '1 movimiento' : `${String(n)} movimientos`;

/** The "Marcas" screen: every tag with its movements, rename and delete (the movements stay). */
export function TagsPage({ api = defaultApi }: { api?: ApiClient }) {
  const [tags, setTags] = useState<TagDto[] | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [reloads, setReloads] = useState(0);
  const [editingId, setEditingId] = useState<number | undefined>();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.tags().then(
      (rows) => {
        if (active) {
          setTags(rows);
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

  const stopEditing = () => {
    setEditingId(undefined);
    setName('');
    setNameError(undefined);
  };

  const rename = async (event: SubmitEvent) => {
    event.preventDefault();
    if (editingId === undefined) {
      return;
    }
    const result = validateTagName(name);
    if (!result.ok) {
      setNameError(result.error);
      return;
    }
    setBusy(true);
    try {
      await api.renameTag(editingId, result.name);
      stopEditing();
      setActionError(undefined);
      reload();
    } catch (error) {
      setNameError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (tag: TagDto) => {
    if (
      !window.confirm(
        `¿Eliminar la marca «${tag.name}»? Se quita de sus movimientos, que no se borran.`,
      )
    ) {
      return;
    }
    try {
      await api.deleteTag(tag.id);
      setActionError(undefined);
      if (editingId === tag.id) {
        stopEditing();
      }
    } catch (error) {
      setActionError(messageOf(error));
    }
    reload();
  };

  return (
    <main className="page">
      <PageHeader title="Marcas" />
      <p className="hint">
        Las marcas se crean al guardar un movimiento. Aquí puedes renombrarlas o eliminarlas.
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
      {tags !== undefined && tags.length === 0 && (
        <p className="empty">
          Todavía no hay marcas. Escribe una al{' '}
          <a href={hrefFor('movements')}>añadir un movimiento</a>.
        </p>
      )}
      {tags !== undefined && tags.length > 0 && (
        <table className="movements tags">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Movimientos</th>
              <th>
                <span className="visually-hidden">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tags.map((t) =>
              editingId === t.id ? (
                <tr key={t.id}>
                  <td colSpan={3}>
                    <form
                      className="inline-form"
                      onSubmit={(e) => void rename(e)}
                      noValidate
                      aria-label={`Renombrar la marca ${t.name}`}
                    >
                      <label htmlFor="tag-name">Nombre de la marca</label>
                      <input
                        id="tag-name"
                        type="text"
                        value={name}
                        aria-describedby={nameError === undefined ? undefined : 'tag-name-error'}
                        onChange={(e) => {
                          setName(e.target.value);
                          setNameError(undefined);
                        }}
                      />
                      {nameError !== undefined && (
                        <p className="field-error" id="tag-name-error" role="alert">
                          {nameError}
                        </p>
                      )}
                      <button type="submit" className="primary" disabled={busy}>
                        Guardar marca
                      </button>
                      <button type="button" onClick={stopEditing}>
                        Cancelar
                      </button>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={t.id}>
                  <td>
                    <a href={hrefFor('movements', { tag: String(t.id) })}>{t.name}</a>
                  </td>
                  <td>{countLabel(t.movements)}</td>
                  <td className="actions">
                    <button
                      type="button"
                      aria-label={`Renombrar la marca ${t.name}`}
                      onClick={() => {
                        setEditingId(t.id);
                        setName(t.name);
                        setNameError(undefined);
                      }}
                    >
                      Renombrar
                    </button>
                    <button
                      type="button"
                      className="danger"
                      aria-label={`Eliminar la marca ${t.name}`}
                      onClick={() => void remove(t)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </main>
  );
}
