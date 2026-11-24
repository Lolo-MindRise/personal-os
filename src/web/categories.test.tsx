import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CategoryUsageDto } from '../shared/api.js';
import { createApiClient } from './api.js';
import { CategoryForm, CategoryTable } from './CategoriesPage.js';
import { groupByKind, usageReason, validateCategoryName } from './categories.js';

const cat = (over: Partial<CategoryUsageDto> = {}): CategoryUsageDto => ({
  id: 1,
  name: 'Ocio',
  kind: 'expense',
  movements: 0,
  recurringItems: 0,
  budgetLines: 0,
  ...over,
});

describe('usageReason', () => {
  it('is undefined for an unused category', () => {
    expect(usageReason(cat())).toBeUndefined();
  });

  it('lists what points at the category, with Spanish plurals', () => {
    expect(usageReason(cat({ movements: 1 }))).toContain('1 movimiento.');
    const text = usageReason(cat({ movements: 3, recurringItems: 1, budgetLines: 2 })) ?? '';
    expect(text).toContain('3 movimientos');
    expect(text).toContain('1 fijo');
    expect(text).toContain('2 líneas de presupuesto');
    expect(text).toContain('No se puede eliminar');
  });

  it('counts a single budget line in the singular', () => {
    expect(usageReason(cat({ budgetLines: 1 }))).toContain('1 línea de presupuesto.');
  });
});

describe('groupByKind', () => {
  it('returns the three kinds in order, even when empty', () => {
    const groups = groupByKind([cat({ id: 2, name: 'Nómina', kind: 'income' }), cat()]);
    expect(groups.map(([kind]) => kind)).toEqual(['income', 'expense', 'repayment']);
    expect(groups[0]?.[1].map((c) => c.name)).toEqual(['Nómina']);
    expect(groups[2]?.[1]).toEqual([]);
  });
});

describe('validateCategoryName', () => {
  it('trims and rejects blanks', () => {
    expect(validateCategoryName('  Mascotas ')).toEqual({ ok: true, name: 'Mascotas' });
    expect(validateCategoryName('   ')).toEqual({ ok: false, error: 'Escribe un nombre.' });
  });
});

describe('CategoryTable', () => {
  const render = (categories: CategoryUsageDto[]) =>
    renderToStaticMarkup(
      <CategoryTable categories={categories} onRename={vi.fn()} onDelete={vi.fn()} />,
    );

  it('shows a section per kind, with an empty message for kinds without categories', () => {
    const html = render([cat()]);
    expect(html).toContain('Ingresos');
    expect(html).toContain('Gastos');
    expect(html).toContain('Amortizaciones');
    expect(html).toContain('No hay categorías de este tipo.');
  });

  it('disables Eliminar and explains why for a category in use', () => {
    const html = render([cat({ movements: 2 })]);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Eliminar<\/button>/);
    expect(html).toContain('En uso: 2 movimientos');
  });

  it('enables Eliminar for an unused category and always offers Renombrar', () => {
    const html = render([cat()]);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Eliminar<\/button>/);
    expect(html).toContain('Renombrar');
    expect(html).not.toContain('En uso');
  });
});

describe('CategoryForm', () => {
  const render = (editing: boolean, error?: string) =>
    renderToStaticMarkup(
      <CategoryForm
        name="Ocio"
        kind="expense"
        editing={editing}
        busy={false}
        error={error}
        formError={undefined}
        onName={vi.fn()}
        onKind={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

  it('adds by default, with the kind selectable', () => {
    const html = render(false);
    expect(html).toContain('Añadir categoría');
    expect(html).not.toContain('disabled=""');
  });

  it('renames when editing, with the kind locked and a Cancelar button', () => {
    const html = render(true);
    expect(html).toContain('Renombrar categoría');
    expect(html).toMatch(/<select[^>]*disabled=""/);
    expect(html).toContain('Cancelar');
  });

  it('shows the name error linked to the input', () => {
    const html = render(false, 'Escribe un nombre.');
    expect(html).toContain('Escribe un nombre.');
    expect(html).toContain('aria-describedby="category-name-error"');
  });
});

describe('api client: categories', () => {
  const reply = (status: number, body?: unknown) =>
    vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(body === undefined ? null : JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

  it('uses the right URLs and methods', async () => {
    const fetchFn = reply(200, {});
    const api = createApiClient(fetchFn);
    await api.categoryUsage();
    await api.createCategory({ name: 'X', kind: 'income' });
    await api.renameCategory(4, 'Y');
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/categories/usage');
    expect(fetchFn.mock.calls[1]).toEqual([
      '/api/categories',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'X', kind: 'income' }),
      }),
    ]);
    expect(fetchFn.mock.calls[2]).toEqual([
      '/api/categories/4',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Y' }) }),
    ]);
  });

  it('deletes with 204 and surfaces a 409 message', async () => {
    await expect(createApiClient(reply(204)).deleteCategory(3)).resolves.toBeUndefined();
    await expect(
      createApiClient(reply(409, { error: 'No se puede eliminar.' })).deleteCategory(3),
    ).rejects.toThrow('No se puede eliminar.');
  });
});
