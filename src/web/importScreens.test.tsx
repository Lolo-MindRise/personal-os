import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CategoryDto, CategoryRuleDto, ImportPreviewRowDto } from '../shared/api.js';
import { parseCsv, type ImportMapping } from '../shared/csvImport.js';
import { Navigation } from './App.js';
import { createApiClient } from './api.js';
import { columnLabels, MappingForm, PreviewTable, RulesPanel } from './ImportPage.js';
import { buildLines } from './importState.js';

const noop = () => undefined;

const categories: CategoryDto[] = [
  { id: 2, name: 'Supermercado', kind: 'expense' },
  { id: 3, name: 'Préstamos', kind: 'repayment' },
  { id: 1, name: 'Nómina', kind: 'income' },
];

const mapping: ImportMapping = {
  hasHeader: true,
  dateColumn: 0,
  conceptColumn: 1,
  amountMode: 'signed',
  amountColumn: 2,
  debitColumn: null,
  creditColumn: null,
};

describe('Navigation', () => {
  it('has the Importar section after Movimientos', () => {
    const html = renderToStaticMarkup(<Navigation view="dashboard" onChange={noop} />);
    expect(html.indexOf('Movimientos')).toBeLessThan(html.indexOf('Importar'));
  });
});

describe('columnLabels', () => {
  it('uses the header names, or "Columna N" without one', () => {
    const records = parseCsv('Fecha;Concepto;\n01/02/2026;Pan;-1,00', ';');
    expect(columnLabels(records, true)).toEqual(['1. Fecha', '2. Concepto', 'Columna 3']);
    expect(columnLabels(records, false)).toEqual(['Columna 1', 'Columna 2', 'Columna 3']);
    expect(columnLabels([], true)).toEqual([]);
  });
});

describe('MappingForm', () => {
  const records = parseCsv('Fecha;Concepto;Importe\n01/02/2026;Pan;-1,00', ';');
  const render = (over: Partial<Parameters<typeof MappingForm>[0]> = {}) =>
    renderToStaticMarkup(
      <MappingForm
        columns={columnLabels(records, true)}
        mapping={mapping}
        delimiter=";"
        sample={records}
        problems={[]}
        onMapping={noop}
        onDelimiter={noop}
        {...over}
      />,
    );

  it('shows the separator, the header switch, the three columns and a sample of the file', () => {
    const html = render();
    expect(html).toContain('Punto y coma (;)');
    expect(html).toContain('La primera fila es la cabecera');
    expect(html).toContain('Columna del importe');
    expect(html).toMatch(/<option value="0" selected="">1\. Fecha/);
    expect(html).toContain('01/02/2026');
  });

  it('asks for debit and credit columns in split mode', () => {
    const html = render({
      mapping: {
        ...mapping,
        amountMode: 'split',
        amountColumn: null,
        debitColumn: 2,
        creditColumn: null,
      },
    });
    expect(html).toContain('Columna de cargos (gastos)');
    expect(html).toContain('Columna de abonos (ingresos)');
    expect(html).not.toContain('Columna del importe');
  });

  it('lists the problems', () => {
    expect(render({ problems: ['Elige la columna de fecha.'] })).toContain(
      'Elige la columna de fecha.',
    );
  });
});

describe('PreviewTable', () => {
  const proposal = (over: Partial<ImportPreviewRowDto>): ImportPreviewRowDto => ({
    date: '2026-02-01',
    concept: 'COMPRA',
    amountCents: -4_530,
    kind: 'expense',
    categoryId: 2,
    categoryName: 'Supermercado',
    ruleId: 1,
    status: 'new',
    recurringItemId: null,
    recurringConcept: null,
    reason: null,
    ...over,
  });
  const lines = buildLines(
    [
      { line: 2, date: '2026-02-01', concept: 'COMPRA', amountCents: -4_530, error: null },
      { line: 3, date: '2026-02-02', concept: 'REPETIDA', amountCents: -1_000, error: null },
      { line: 4, date: '2026-02-03', concept: 'RECIBO PISO', amountCents: -70_000, error: null },
      { line: 5, date: '2026-02-04', concept: 'RARA', amountCents: -300, error: null },
      {
        line: 6,
        date: null,
        concept: '',
        amountCents: null,
        error: 'La fecha no existe en el calendario.',
      },
    ],
    [
      proposal({}),
      proposal({
        concept: 'REPETIDA',
        amountCents: -1_000,
        status: 'duplicate',
        reason: 'ya confirmado como fijo',
      }),
      proposal({
        concept: 'RECIBO PISO',
        amountCents: -70_000,
        status: 'recurring',
        categoryName: 'Vivienda',
        categoryId: 2,
        recurringItemId: 5,
        recurringConcept: 'Alquiler',
      }),
      proposal({
        concept: 'RARA',
        amountCents: -300,
        status: 'noCategory',
        categoryId: null,
        categoryName: null,
        ruleId: null,
      }),
    ],
  );
  const html = renderToStaticMarkup(
    <PreviewTable lines={lines} categories={categories} onChecked={noop} onCategory={noop} />,
  );

  it('shows date, concept, signed amount, kind, category and a status in words for every row', () => {
    expect(html).toContain('01/02/2026');
    expect(html).toMatch(/-45,30\s€/);
    expect(html).toContain('Gasto');
    expect(html).toContain('Nuevo');
    expect(html).toContain('Duplicado');
    // The reason is shown next to the status, so the user knows why it is unchecked.
    expect(html).toMatch(/Duplicado<span class="notes">ya confirmado como fijo<\/span>/);
    expect(html).toContain('Confirma un fijo');
    expect(html).toContain('Falta la categoría');
  });

  it('checks new rows and fixed items, leaves duplicates and rows without category unchecked', () => {
    const box = (line: number) =>
      new RegExp(`<input[^>]*aria-label="Importar la fila ${String(line)}"[^>]*>`).exec(
        html,
      )?.[0] ?? '';
    expect(box(2)).toContain('checked');
    expect(box(3)).not.toContain('checked');
    expect(box(4)).toContain('checked');
    expect(box(5)).toContain('disabled'); // nothing to import without a category
    expect(box(6)).toContain('disabled');
  });

  it('offers only categories that fit the sign, and locks a fixed item to its category', () => {
    expect(html).toMatch(/aria-label="Categoría de la fila 2"/);
    const select = /aria-label="Categoría de la fila 5".*?<\/select>/.exec(html)?.[0] ?? '';
    expect(select).toContain('Supermercado');
    expect(select).toContain('Préstamos');
    expect(select).not.toContain('Nómina');
    expect(html).not.toContain('Categoría de la fila 4');
    expect(html).toContain('Fijo «Alquiler»');
  });

  it('shows the parsing error with its line', () => {
    expect(html).toContain('Línea 6: La fecha no existe en el calendario.');
  });
});

describe('RulesPanel', () => {
  const rules: CategoryRuleDto[] = [
    { id: 1, pattern: 'mercadona', categoryId: 2, categoryName: 'Supermercado', kind: 'expense' },
  ];
  const render = (over: Partial<Parameters<typeof RulesPanel>[0]> = {}) =>
    renderToStaticMarkup(
      <RulesPanel
        rules={rules}
        categories={categories}
        error={undefined}
        busy={false}
        onAdd={noop}
        onDelete={noop}
        {...over}
      />,
    );

  it('lists the rules with a delete button and the form to add one', () => {
    const html = render();
    expect(html).toContain('«mercadona» → Supermercado');
    expect(html).toContain('Eliminar la regla «mercadona»');
    expect(html).toContain('El concepto contiene');
    expect(html).toContain('Añadir regla');
  });

  it('says so when there are none, and shows an error', () => {
    expect(render({ rules: [] })).toContain('Todavía no hay reglas.');
    expect(render({ error: 'Ya existe una regla con ese texto.' })).toContain(
      'Ya existe una regla con ese texto.',
    );
  });
});

describe('api client: import', () => {
  const reply = (status: number, body: unknown) =>
    vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status })),
    );

  it('calls the import and rules endpoints with JSON bodies', async () => {
    const fetchFn = reply(200, {});
    const api = createApiClient(fetchFn);
    await api.categoryRules();
    await api.createCategoryRule({ pattern: 'x', categoryId: 2 });
    await api.importMapping();
    await api.saveImportMapping(mapping);
    await api.importPreview([{ date: '2026-02-01', concept: 'x', amountCents: -1 }]);
    await api.importCommit([]);
    const calls = fetchFn.mock.calls.map(([url, init]) => [url, init?.method ?? 'GET']);
    expect(calls).toEqual([
      ['/api/category-rules', 'GET'],
      ['/api/category-rules', 'POST'],
      ['/api/import/mapping', 'GET'],
      ['/api/import/mapping', 'PUT'],
      ['/api/import/preview', 'POST'],
      ['/api/import/commit', 'POST'],
    ]);
    expect(fetchFn.mock.calls[3]?.[1]?.body).toBe(JSON.stringify(mapping));
  });

  it('deletes a rule', async () => {
    const fetchFn = reply(204, null);
    await createApiClient(fetchFn).deleteCategoryRule(4);
    expect(fetchFn.mock.calls[0]).toEqual(['/api/category-rules/4', { method: 'DELETE' }]);
  });
});
