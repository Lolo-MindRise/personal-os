import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CategoryDto, MovementDto, MovementSearchDto } from '../shared/api.js';
import { createApiClient } from './api.js';
import { KIND_LABELS } from './labels.js';
import { MovementFilters, SearchResults } from './MovementSearch.js';
import {
  describeFilters,
  emptyFilters,
  FILTER_ERRORS,
  hasFilters,
  searchParams,
  validateFilters,
} from './movementSearch.js';

const noop = () => undefined;

const categories: CategoryDto[] = [
  { id: 1, name: 'Nómina', kind: 'income' },
  { id: 2, name: 'Supermercado', kind: 'expense' },
];

describe('validateFilters', () => {
  it('builds the query from the filled fields only, with amounts in cents', () => {
    const result = validateFilters({
      q: '  mercadona ',
      categoryId: '2',
      kind: 'expense',
      from: '2026-01-01',
      to: '2026-03-31',
      minAmount: '10',
      maxAmount: '1.234,50',
    });
    expect(result).toEqual({
      ok: true,
      query: {
        q: 'mercadona',
        categoryId: 2,
        kind: 'expense',
        from: '2026-01-01',
        to: '2026-03-31',
        minAmountCents: 1_000,
        maxAmountCents: 123_450,
      },
    });
  });

  it('an empty panel is a valid query with no filters', () => {
    expect(validateFilters(emptyFilters())).toEqual({ ok: true, query: {} });
    expect(hasFilters(emptyFilters())).toBe(false);
    expect(hasFilters({ ...emptyFilters(), q: ' x ' })).toBe(true);
    expect(hasFilters({ ...emptyFilters(), q: '   ' })).toBe(false);
  });

  it('accepts a zero minimum and equal ends of a range', () => {
    expect(
      validateFilters({
        ...emptyFilters(),
        minAmount: '0',
        maxAmount: '0',
        from: '2026-01-01',
        to: '2026-01-01',
      }).ok,
    ).toBe(true);
  });

  it('reports each problem in Spanish, field by field', () => {
    const result = validateFilters({
      ...emptyFilters(),
      from: '2026-02-30',
      to: 'ayer',
      minAmount: 'mucho',
      maxAmount: '-5',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.from).toBe(FILTER_ERRORS.date);
      expect(result.errors.to).toBe(FILTER_ERRORS.date);
      expect(result.errors.minAmount).toMatch(/Importe no válido/);
      expect(result.errors.maxAmount).toMatch(/negativo/);
    }
  });

  it('rejects a text longer than the API accepts, on its own field', () => {
    expect(validateFilters({ ...emptyFilters(), q: 'x'.repeat(100) }).ok).toBe(true);
    expect(validateFilters({ ...emptyFilters(), q: 'x'.repeat(101) })).toEqual({
      ok: false,
      errors: { q: FILTER_ERRORS.textLength },
    });
  });

  it('rejects inverted ranges', () => {
    expect(validateFilters({ ...emptyFilters(), from: '2026-03-01', to: '2026-01-01' })).toEqual({
      ok: false,
      errors: { to: FILTER_ERRORS.dateOrder },
    });
    expect(validateFilters({ ...emptyFilters(), minAmount: '5', maxAmount: '1' })).toEqual({
      ok: false,
      errors: { maxAmount: FILTER_ERRORS.amountOrder },
    });
  });
});

describe('searchParams and describeFilters', () => {
  it('serialises only the set filters, plus the page', () => {
    expect(searchParams({ q: 'a b', minAmountCents: 100 }, 3)).toBe(
      'q=a+b&minAmountCents=100&page=3',
    );
    expect(searchParams({}, 1)).toBe('page=1');
  });

  it('describes the active filters for the results header', () => {
    expect(
      describeFilters(
        { q: 'pan', categoryId: 2, kind: 'expense', from: '2026-01-01', minAmountCents: 100 },
        'Supermercado',
        KIND_LABELS,
      ).map((s) => s.replace(' ', ' ')),
    ).toEqual([
      'texto «pan»',
      'categoría Supermercado',
      'tipo gasto',
      'desde 2026-01-01',
      'importe desde 1,00 €',
    ]);
  });
});

describe('MovementFilters', () => {
  const render = (over: Partial<Parameters<typeof MovementFilters>[0]> = {}) =>
    renderToStaticMarkup(
      <MovementFilters
        values={emptyFilters()}
        categories={categories}
        errors={{}}
        busy={false}
        onChange={noop}
        onSearch={noop}
        onClear={noop}
        onClose={noop}
        {...over}
      />,
    );

  it('has every filter, in Spanish, and lists the categories and kinds', () => {
    const html = render();
    for (const label of [
      'Texto en concepto o notas',
      'Categoría',
      'Tipo',
      'Desde (fecha)',
      'Hasta (fecha)',
      'Importe mínimo (€)',
      'Importe máximo (€)',
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('Supermercado');
    expect(html).toContain('Amortización');
  });

  it('can be closed without searching', () => {
    expect(render()).toContain('Cerrar');
  });

  it('disables "Limpiar filtros" until something is filled in, and shows errors with links', () => {
    expect(render()).toMatch(/<button type="button" disabled="">Limpiar filtros/);
    const filled = render({
      values: { ...emptyFilters(), q: 'pan' },
      errors: { from: 'La fecha no es válida.' },
    });
    expect(filled).not.toMatch(/<button type="button" disabled="">Limpiar filtros/);
    expect(filled).toContain('La fecha no es válida.');
    expect(filled).toContain('aria-describedby="filter-from-error"');
  });
});

describe('SearchResults', () => {
  const movement = (over: Partial<MovementDto>): MovementDto => ({
    id: 1,
    date: '2026-01-15',
    kind: 'expense',
    categoryId: 2,
    categoryName: 'Supermercado',
    concept: 'Mercadona',
    amountCents: 1_000,
    notes: null,
    debtId: null,
    accountId: 1,
    recurringItemId: null,
    ...over,
  });
  const result = (over: Partial<MovementSearchDto> = {}): MovementSearchDto => ({
    rows: [
      movement({}),
      movement({
        id: 2,
        concept: 'Nómina',
        kind: 'income',
        amountCents: 200_000,
        notes: 'Empresa',
      }),
    ],
    page: 1,
    pageSize: 50,
    count: 2,
    pageCount: 1,
    totals: { incomeCents: 200_000, expenseCents: 1_000, repaymentCents: 0, netCents: 199_000 },
    ...over,
  });
  const render = (r: MovementSearchDto, query = {}) =>
    renderToStaticMarkup(
      <SearchResults
        result={r}
        query={query}
        categories={categories}
        onPage={noop}
        onGoToMonth={noop}
        onBack={noop}
      />,
    );

  it('shows the total of the filtered set and a way back to the monthly view', () => {
    const html = render(result(), { q: 'a' });
    expect(html).toContain('2 movimientos');
    expect(html).toMatch(/Ingresos 2\.000,00\s€/);
    expect(html).toMatch(/Gastos 10,00\s€/);
    expect(html).toMatch(/Balance 1\.990,00\s€/);
    expect(html).toContain('Volver a la vista mensual');
    expect(html).toContain('Filtros: texto «a»');
  });

  it('lists each movement with date, kind, category, concept, notes and a link to its month', () => {
    const html = render(result());
    expect(html).toContain('15/01/2026');
    expect(html).toContain('Supermercado');
    expect(html).toContain('Empresa');
    expect(html).toContain('Ver el mes de «Mercadona»');
  });

  it('uses the singular for one movement', () => {
    expect(render(result({ count: 1, rows: [movement({})] }))).toContain('1 movimiento<');
  });

  it('says so when nothing matches, and still offers the way back', () => {
    const html = render(
      result({
        rows: [],
        count: 0,
        pageCount: 0,
        totals: { incomeCents: 0, expenseCents: 0, repaymentCents: 0, netCents: 0 },
      }),
    );
    expect(html).toContain('Ningún movimiento coincide con los filtros.');
    expect(html).toContain('Volver a la vista mensual');
    expect(html).not.toContain('Balance');
  });

  it('announces the totals in a live region and disables paging while a page loads', () => {
    expect(render(result())).toMatch(
      /<p[^>]*data-testid="search-totals"[^>]*role="status"|role="status"[^>]*data-testid="search-totals"/,
    );
    const html = renderToStaticMarkup(
      <SearchResults
        result={result({ page: 2, pageCount: 3 })}
        query={{}}
        categories={categories}
        busy
        onPage={noop}
        onGoToMonth={noop}
        onBack={noop}
      />,
    );
    expect(html).toMatch(/<button type="button" disabled="">Anterior/);
    expect(html).toMatch(/<button type="button" disabled="">Siguiente/);
  });

  it('shows pagination only with several pages, disabling the ends', () => {
    expect(render(result())).not.toContain('Páginas de resultados');
    const first = render(result({ page: 1, pageCount: 3 }));
    expect(first).toContain('Página 1 de 3');
    expect(first).toMatch(/<button type="button" disabled="">Anterior/);
    expect(first).not.toMatch(/<button type="button" disabled="">Siguiente/);
    const last = render(result({ page: 3, pageCount: 3 }));
    expect(last).toMatch(/<button type="button" disabled="">Siguiente/);
  });
});

describe('api client: search', () => {
  it('calls the search endpoint with the filters and the page', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}', { status: 200 })));
    await createApiClient(fetchFn).searchMovements({ q: 'pan', kind: 'expense' }, 2);
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/movements/search?q=pan&kind=expense&page=2');
  });
});
