import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KIND_LABELS } from './labels.js';
import { describeFilters, searchParams } from './movementSearch.js';
import { FilterBar } from './PageHeader.js';

describe('FilterBar', () => {
  it('says which filter is applied and links to clear it', () => {
    const html = renderToStaticMarkup(
      <FilterBar label="categoría Ocio · enero de 2026" clearHref="#/movements?month=2026-01" />,
    );
    expect(html).toContain('Filtro: <strong>categoría Ocio · enero de 2026</strong>');
    expect(html).toContain('href="#/movements?month=2026-01"');
    expect(html).toContain('>Quitar filtro<');
    expect(html).toContain('role="status"');
  });

  it('lets the screen name the clearing link', () => {
    const html = renderToStaticMarkup(
      <FilterBar label="deuda X" clearHref="#/debts" clearLabel="Ver todas las deudas" />,
    );
    expect(html).toContain('>Ver todas las deudas<');
  });
});

describe('links that filter movements by debt or fixed item', () => {
  it('are sent to the search API and described in words', () => {
    expect(searchParams({ debtId: 3 }, 1)).toBe('debtId=3&page=1');
    expect(searchParams({ recurringItemId: 2 }, 2)).toBe('recurringItemId=2&page=2');
    expect(describeFilters({ debtId: 3 }, undefined, KIND_LABELS)).toEqual([
      'vinculados a una deuda',
    ]);
    expect(describeFilters({ recurringItemId: 2 }, undefined, KIND_LABELS)).toEqual([
      'confirmados desde un fijo',
    ]);
  });
});
