import { useEffect, useRef, useState, type ChangeEvent, type SubmitEvent } from 'react';
import type { CategoryDto, CategoryRuleDto, ImportSummaryDto } from '../shared/api.js';
import {
  detectDelimiter,
  guessMapping,
  mappingProblems,
  parseCsv,
  readRows,
  type CsvRecord,
  type Delimiter,
  type ImportMapping,
  type ParsedImportRow,
} from '../shared/csvImport.js';
import { formatCents } from '../shared/money.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import { Field } from './Field.js';
import {
  buildLines,
  categoriesFor,
  commitRows,
  countLines,
  decodeCsvBytes,
  kindOf,
  STATUS_LABELS,
  withCategory,
  withChecked,
  type PreviewLine,
} from './importState.js';
import { KIND_LABELS } from './labels.js';
import { formatDate } from './months.js';

import { PageHeader } from './PageHeader.js';

const defaultApi = createApiClient();

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

/** Column names for the selects: the header text when there is one, otherwise "Columna N". */
export function columnLabels(records: CsvRecord[], hasHeader: boolean): string[] {
  const count = Math.max(0, ...records.slice(0, 20).map((r) => r.fields.length));
  const header = hasHeader ? (records[0]?.fields ?? []) : [];
  return Array.from({ length: count }, (_, i) => {
    const name = (header[i] ?? '').trim();
    return name === '' ? `Columna ${String(i + 1)}` : `${String(i + 1)}. ${name}`;
  });
}

const DELIMITER_LABELS: Record<Delimiter, string> = {
  ';': 'Punto y coma (;)',
  ',': 'Coma (,)',
};

export function MappingForm(props: {
  columns: string[];
  mapping: ImportMapping;
  delimiter: Delimiter;
  sample: CsvRecord[];
  problems: string[];
  onMapping: (mapping: ImportMapping) => void;
  onDelimiter: (delimiter: Delimiter) => void;
}) {
  const { columns, mapping } = props;
  const set = (patch: Partial<ImportMapping>) => {
    props.onMapping({ ...mapping, ...patch });
  };
  const column = (
    field: 'dateColumn' | 'conceptColumn' | 'amountColumn' | 'debitColumn' | 'creditColumn',
    label: string,
  ) => (
    <Field id={`import-${field}`} label={label} error={undefined}>
      <select
        id={`import-${field}`}
        value={mapping[field] === null ? '' : String(mapping[field])}
        onChange={(e) => {
          set({ [field]: e.target.value === '' ? null : Number(e.target.value) });
        }}
      >
        <option value="">Elige una columna</option>
        {columns.map((name, index) => (
          <option key={name} value={String(index)}>
            {name}
          </option>
        ))}
      </select>
    </Field>
  );
  return (
    <section className="movement-form" aria-label="Columnas del archivo">
      <h2>Columnas del archivo</h2>
      <div className="form-grid">
        <Field id="import-delimiter" label="Separador" error={undefined}>
          <select
            id="import-delimiter"
            value={props.delimiter}
            onChange={(e) => {
              props.onDelimiter(e.target.value as Delimiter);
            }}
          >
            {(Object.keys(DELIMITER_LABELS) as Delimiter[]).map((d) => (
              <option key={d} value={d}>
                {DELIMITER_LABELS[d]}
              </option>
            ))}
          </select>
        </Field>
        <div className="field">
          <label htmlFor="import-hasHeader">
            <input
              id="import-hasHeader"
              type="checkbox"
              checked={mapping.hasHeader}
              onChange={(e) => {
                set({ hasHeader: e.target.checked });
              }}
            />{' '}
            La primera fila es la cabecera
          </label>
        </div>
        {column('dateColumn', 'Fecha')}
        {column('conceptColumn', 'Concepto')}
        <Field id="import-amountMode" label="Importe" error={undefined}>
          <select
            id="import-amountMode"
            value={mapping.amountMode}
            onChange={(e) => {
              set({ amountMode: e.target.value === 'split' ? 'split' : 'signed' });
            }}
          >
            <option value="signed">Una columna con signo (negativo = gasto)</option>
            <option value="split">Cargo y abono en columnas separadas</option>
          </select>
        </Field>
        {mapping.amountMode === 'signed' ? (
          column('amountColumn', 'Columna del importe')
        ) : (
          <>
            {column('debitColumn', 'Columna de cargos (gastos)')}
            {column('creditColumn', 'Columna de abonos (ingresos)')}
          </>
        )}
      </div>
      {props.sample.length > 0 && (
        <table className="movements import-sample" aria-label="Primeras filas del archivo">
          <tbody>
            {props.sample.map((record) => (
              <tr key={record.line}>
                {record.fields.map((value, i) => (
                  <td key={`${String(record.line)}-${String(i)}`}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {props.problems.map((problem) => (
        <p key={problem} className="form-error" role="alert">
          {problem}
        </p>
      ))}
    </section>
  );
}

export function PreviewTable(props: {
  lines: PreviewLine[];
  categories: CategoryDto[];
  onChecked: (index: number, checked: boolean) => void;
  onCategory: (index: number, categoryId: number | null) => void;
}) {
  return (
    <table className="movements import-preview">
      <thead>
        <tr>
          <th>
            <span className="visually-hidden">Importar</span>
          </th>
          <th>Fecha</th>
          <th>Concepto</th>
          <th className="amount">Importe</th>
          <th>Tipo</th>
          <th>Categoría</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        {props.lines.map((line, index) => {
          const kind = kindOf(line, props.categories);
          if (line.proposal === null) {
            return (
              <tr key={line.line} className="import-error-row">
                <td>
                  <input
                    type="checkbox"
                    disabled
                    aria-label={`Importar la fila ${String(line.line)}`}
                  />
                </td>
                <td>{line.date === null ? '—' : formatDate(line.date)}</td>
                <td>{line.concept === '' ? '—' : line.concept}</td>
                <td className="amount">
                  {line.amountCents === null ? '—' : formatCents(line.amountCents)}
                </td>
                <td>—</td>
                <td>—</td>
                <td className="import-status error">
                  Línea {line.line}: {line.error}
                </td>
              </tr>
            );
          }
          const { status } = line.proposal;
          return (
            <tr key={line.line} className={`import-row import-${status}`}>
              <td>
                <input
                  type="checkbox"
                  checked={line.checked}
                  disabled={line.categoryId === null}
                  aria-label={`Importar la fila ${String(line.line)}`}
                  onChange={(e) => {
                    props.onChecked(index, e.target.checked);
                  }}
                />
              </td>
              <td>{line.date === null ? '—' : formatDate(line.date)}</td>
              <td>{line.concept}</td>
              <td className="amount">
                {line.amountCents === null ? '—' : formatCents(line.amountCents)}
              </td>
              <td>{kind === null ? '—' : KIND_LABELS[kind]}</td>
              <td>
                {status === 'recurring' ? (
                  <>
                    {line.proposal.categoryName}
                    <span className="notes">Fijo «{line.proposal.recurringConcept}»</span>
                  </>
                ) : (
                  <select
                    aria-label={`Categoría de la fila ${String(line.line)}`}
                    value={line.categoryId === null ? '' : String(line.categoryId)}
                    onChange={(e) => {
                      props.onCategory(
                        index,
                        e.target.value === '' ? null : Number(e.target.value),
                      );
                    }}
                  >
                    <option value="">Elige una categoría</option>
                    {categoriesFor(line, props.categories).map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </td>
              <td className={`import-status ${status}`}>
                {STATUS_LABELS[status]}
                {line.proposal.reason !== null && (
                  <span className="notes">{line.proposal.reason}</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function RulesPanel(props: {
  rules: CategoryRuleDto[];
  categories: CategoryDto[];
  error: string | undefined;
  busy: boolean;
  onAdd: (pattern: string, categoryId: number) => void;
  onDelete: (rule: CategoryRuleDto) => void;
}) {
  const [pattern, setPattern] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (pattern.trim() !== '' && categoryId !== '') {
      props.onAdd(pattern, Number(categoryId));
      setPattern('');
    }
  };
  return (
    <section className="movement-form" aria-label="Reglas de categoría">
      <h2>Reglas de categoría</h2>
      <p className="hint">
        «Si el concepto contiene X, la categoría es Y». No distingue mayúsculas ni acentos; vale la
        primera regla que encaje. Se aplican en la vista previa. Al añadir o quitar una regla se
        recalcula la vista previa y se pierden las categorías y marcas que hayas cambiado a mano.
      </p>
      <form className="form-grid" onSubmit={submit} noValidate>
        <Field id="rule-pattern" label="El concepto contiene" error={undefined}>
          <input
            id="rule-pattern"
            type="text"
            value={pattern}
            onChange={(e) => {
              setPattern(e.target.value);
            }}
          />
        </Field>
        <Field id="rule-category" label="Categoría" error={undefined}>
          <select
            id="rule-category"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
            }}
          >
            <option value="">Elige una categoría</option>
            {props.categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name} ({KIND_LABELS[c.kind].toLowerCase()})
              </option>
            ))}
          </select>
        </Field>
        <div className="form-actions">
          <button type="submit" disabled={props.busy || pattern.trim() === '' || categoryId === ''}>
            Añadir regla
          </button>
        </div>
      </form>
      {props.error !== undefined && (
        <p className="form-error" role="alert">
          {props.error}
        </p>
      )}
      {props.rules.length === 0 ? (
        <p className="empty">Todavía no hay reglas.</p>
      ) : (
        <ul className="rule-list">
          {props.rules.map((rule) => (
            <li key={rule.id}>
              «{rule.pattern}» → {rule.categoryName}{' '}
              <button
                type="button"
                className="danger"
                aria-label={`Eliminar la regla «${rule.pattern}»`}
                onClick={() => {
                  props.onDelete(rule);
                }}
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The "Importar" screen: read a bank CSV, map its columns, review every row, import the checked ones. */
export function ImportPage({ api = defaultApi }: { api?: ApiClient }) {
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [rules, setRules] = useState<CategoryRuleDto[]>([]);
  const [saved, setSaved] = useState<ImportMapping | null>(null);
  const [fileName, setFileName] = useState<string | undefined>();
  const [text, setText] = useState('');
  const [delimiter, setDelimiter] = useState<Delimiter>(';');
  const [mapping, setMapping] = useState<ImportMapping | undefined>();
  const [lines, setLines] = useState<PreviewLine[] | undefined>();
  const [summary, setSummary] = useState<ImportSummaryDto | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [ruleError, setRuleError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  /** The parsed rows behind the preview, kept so a rule change can recompute it. */
  const parsedRef = useRef<ParsedImportRow[]>([]);

  useEffect(() => {
    api.categories().then(setCategories, (e: unknown) => {
      setError(messageOf(e));
    });
    api.categoryRules().then(setRules, (e: unknown) => {
      setError(messageOf(e));
    });
    api.importMapping().then(
      (result) => {
        setSaved(result.mapping);
      },
      () => undefined, // a missing remembered mapping is not an error
    );
  }, [api]);

  const records = text === '' ? [] : parseCsv(text, delimiter);
  const columnCount = Math.max(0, ...records.slice(0, 20).map((r) => r.fields.length));
  const problems = mapping === undefined ? [] : mappingProblems(mapping, columnCount);

  const load = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) {
      return;
    }
    setError(undefined);
    setSummary(undefined);
    setLines(undefined);
    try {
      const content = decodeCsvBytes(await file.arrayBuffer());
      const detected = detectDelimiter(content);
      const parsed = parseCsv(content, detected);
      if (parsed.length === 0) {
        setError('El archivo está vacío.');
        setText('');
        setMapping(undefined);
        return;
      }
      const count = Math.max(...parsed.slice(0, 20).map((r) => r.fields.length));
      // Use the remembered mapping when it fits this file, otherwise guess from the header.
      const remembered =
        saved !== null && mappingProblems(saved, count).length === 0 ? saved : undefined;
      setFileName(file.name);
      setText(content);
      setDelimiter(detected);
      setMapping(remembered ?? guessMapping(parsed));
    } catch {
      setError('No se ha podido leer el archivo.');
    }
  };

  const runPreview = async (rows: ParsedImportRow[]) => {
    const readable = rows.flatMap((r) =>
      r.error === null && r.date !== null && r.amountCents !== null
        ? [{ date: r.date, concept: r.concept, amountCents: r.amountCents }]
        : [],
    );
    const result = readable.length === 0 ? { rows: [] } : await api.importPreview(readable);
    parsedRef.current = rows;
    setLines(buildLines(rows, result.rows));
  };

  const preview = async () => {
    if (mapping === undefined || problems.length > 0) {
      return;
    }
    setBusy(true);
    setError(undefined);
    setSummary(undefined);
    try {
      await runPreview(readRows(records, mapping));
      // Remember the mapping for the next file (best effort).
      await api.saveImportMapping(mapping).then(
        (result) => {
          setSaved(result.mapping);
        },
        () => undefined,
      );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const reclassify = async () => {
    if (lines !== undefined) {
      try {
        await runPreview(parsedRef.current);
      } catch (e) {
        setError(messageOf(e));
      }
    }
  };

  const addRule = async (pattern: string, categoryId: number) => {
    setBusy(true);
    setRuleError(undefined);
    try {
      const created = await api.createCategoryRule({ pattern, categoryId });
      setRules((current) => [...current, created]);
      await reclassify();
    } catch (e) {
      setRuleError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteRule = async (rule: CategoryRuleDto) => {
    setRuleError(undefined);
    try {
      await api.deleteCategoryRule(rule.id);
      setRules((current) => current.filter((r) => r.id !== rule.id));
      await reclassify();
    } catch (e) {
      setRuleError(messageOf(e));
    }
  };

  const counts = lines === undefined ? undefined : countLines(lines, categories);

  const commit = async () => {
    if (lines === undefined) {
      return;
    }
    const rows = commitRows(lines, categories);
    if (rows.length === 0) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      setSummary(await api.importCommit(rows));
      setLines(undefined);
      setText('');
      setMapping(undefined);
      setFileName(undefined);
      if (input.current !== null) {
        input.current.value = '';
      }
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <PageHeader title="Importar" />
      <p className="hint">
        Elige el extracto de tu banco en CSV. El archivo se lee en tu navegador; solo se guardan los
        movimientos que importes. Revisa todas las filas antes de importar.
      </p>

      {error !== undefined && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {summary !== undefined && (
        <p className="import-summary" role="status">
          Importación terminada: {summary.created} movimientos nuevos y {summary.confirmedRecurring}{' '}
          fijos confirmados.
        </p>
      )}

      <div className="field">
        <label htmlFor="import-file">Archivo CSV</label>
        <input
          id="import-file"
          ref={input}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          onChange={(e) => void load(e)}
        />
        {fileName !== undefined && <span className="notes">{fileName}</span>}
      </div>

      {mapping !== undefined && (
        <>
          <MappingForm
            columns={columnLabels(records, mapping.hasHeader)}
            mapping={mapping}
            delimiter={delimiter}
            sample={records.slice(0, 4)}
            problems={problems}
            onMapping={(next) => {
              // A preview made with another mapping must not be importable.
              setLines(undefined);
              setMapping(next);
            }}
            onDelimiter={(next) => {
              setLines(undefined);
              setDelimiter(next);
            }}
          />
          <div className="form-actions">
            <button
              type="button"
              className="primary"
              disabled={busy || problems.length > 0}
              onClick={() => void preview()}
            >
              Ver vista previa
            </button>
          </div>
        </>
      )}

      {lines !== undefined && counts !== undefined && (
        <section aria-label="Vista previa de la importación">
          <h2>Vista previa</h2>
          <p className="hint" data-testid="import-counts">
            {counts.total} filas: {counts.new} nuevas, {counts.recurring} que confirman un fijo,{' '}
            {counts.duplicate} duplicadas, {counts.noCategory} sin categoría y {counts.errors} con
            errores. Marcadas para importar: {counts.selected}.
          </p>
          <PreviewTable
            lines={lines}
            categories={categories}
            onChecked={(index, checked) => {
              setLines((current) =>
                current?.map((line, i) => (i === index ? withChecked(line, checked) : line)),
              );
            }}
            onCategory={(index, categoryId) => {
              setLines((current) =>
                current?.map((line, i) => (i === index ? withCategory(line, categoryId) : line)),
              );
            }}
          />
          <div className="form-actions">
            <button
              type="button"
              className="primary"
              disabled={busy || counts.selected === 0}
              onClick={() => void commit()}
            >
              Importar {counts.selected} filas
            </button>
          </div>
        </section>
      )}

      <RulesPanel
        rules={rules}
        categories={categories}
        error={ruleError}
        busy={busy}
        onAdd={(pattern, categoryId) => void addRule(pattern, categoryId)}
        onDelete={(rule) => void deleteRule(rule)}
      />
    </main>
  );
}
