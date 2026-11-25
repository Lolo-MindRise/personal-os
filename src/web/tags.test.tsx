import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MovementDto } from '../shared/api.js';
import { createApiClient } from './api.js';
import { MovementFilters } from './MovementSearch.js';
import { MovementForm } from './MovementForm.js';
import { MovementList } from './MovementList.js';
import {
  commitTagDraft,
  emptyForm,
  formFromMovement,
  removeTag,
  validateMovementForm,
  FORM_ERRORS,
} from './movementForm.js';
import {
  describeFilters,
  emptyFilters,
  paramsToQuery,
  queryToFilters,
  queryToParams,
  searchParams,
  searchAction,
  validateFilters,
} from './movementSearch.js';
import { buildHash, parseHash } from './router.js';
import { countLabel, validateTagName, TAG_NAME_ERRORS } from './TagsPage.js';
import { KIND_LABELS } from './labels.js';

const filled = { ...emptyForm('2026-01-10'), categoryId: '2', concept: 'Hotel', amount: '10' };

describe('tags in the movement form', () => {
  it('turns the draft into tags, comma separated, without repeats ignoring case', () => {
    const values = commitTagDraft({ ...filled, tags: ['Viaje'], tagDraft: ' viaje, casa ,, ' });
    expect(values.tags).toEqual(['Viaje', 'casa']);
    expect(values.tagDraft).toBe('');
  });

  it('removes a tag', () => {
    expect(removeTag({ ...filled, tags: ['a', 'b'] }, 'a').tags).toEqual(['b']);
  });

  it('counts text left in the box as a tag when saving', () => {
    const result = validateMovementForm({ ...filled, tags: ['casa'], tagDraft: 'viaje' });
    expect(result.ok && result.payload.tags).toEqual(['casa', 'viaje']);
  });

  it('sends no tags for a new movement without any, but [] when editing clears them', () => {
    const plain = validateMovementForm(filled);
    expect(plain.ok && 'tags' in plain.payload).toBe(false);
    const cleared = validateMovementForm({ ...filled, tags: [] });
    expect(cleared.ok && cleared.payload.tags).toEqual([]);
  });

  it('refuses names that are too long and too many tags, in Spanish', () => {
    expect(validateMovementForm({ ...filled, tagDraft: 'x'.repeat(31) })).toEqual({
      ok: false,
      errors: { tags: FORM_ERRORS.tagLength },
    });
    const many = Array.from({ length: 11 }, (_, i) => `t${String(i)}`);
    expect(validateMovementForm({ ...filled, tags: many })).toEqual({
      ok: false,
      errors: { tags: FORM_ERRORS.tagCount },
    });
  });

  it('loads the tags of a saved movement and shows the box (not when confirming)', () => {
    const movement: MovementDto = {
      id: 1,
      date: '2026-01-10',
      kind: 'expense',
      categoryId: 2,
      categoryName: 'Ocio',
      concept: 'Hotel',
      amountCents: 1000,
      notes: null,
      debtId: null,
      accountId: 1,
      tags: ['viaje'],
      recurringItemId: null,
    };
    const values = formFromMovement(movement);
    expect(values.tags).toEqual(['viaje']);
    const props = {
      values,
      categories: [],
      errors: {},
      busy: false,
      onChange: () => undefined,
      onSubmit: () => undefined,
      onInvalid: () => undefined,
      onCancel: () => undefined,
    };
    const edit = renderToStaticMarkup(<MovementForm {...props} mode="edit" tagNames={['casa']} />);
    expect(edit).toContain('Marcas');
    expect(edit).toContain('Quitar la marca viaje');
    expect(edit).toContain('<option value="casa"');
    expect(renderToStaticMarkup(<MovementForm {...props} mode="confirm" />)).not.toContain(
      'Marcas',
    );
    const withError = renderToStaticMarkup(
      <MovementForm {...props} mode="add" errors={{ tags: 'Mal.' }} />,
    );
    expect(withError).toContain('aria-describedby="movement-tags-error"');
  });
});

describe('tags in the list', () => {
  const movement = (tags: string[]): MovementDto => ({
    id: 1,
    date: '2026-01-10',
    kind: 'expense',
    categoryId: 2,
    categoryName: 'Ocio',
    concept: 'Hotel',
    amountCents: 1000,
    notes: null,
    debtId: null,
    accountId: 1,
    tags,
    recurringItemId: null,
  });
  it('shows the tags under the concept, and nothing without tags', () => {
    const noop = () => undefined;
    const shown = renderToStaticMarkup(
      <MovementList movements={[movement(['casa', 'viaje'])]} onEdit={noop} onDelete={noop} />,
    );
    expect(shown).toContain('<li class="tag-chip">casa</li>');
    expect(shown).toContain('<li class="tag-chip">viaje</li>');
    const none = renderToStaticMarkup(
      <MovementList movements={[movement([])]} onEdit={noop} onDelete={noop} />,
    );
    expect(none).not.toContain('tag-chip');
  });
});

describe('tag filter in the URL and the panel', () => {
  const tags = [
    { id: 3, name: 'casa', movements: 1 },
    { id: 5, name: 'viaje', movements: 2 },
  ];

  it('round-trips through the hash and the panel fields', () => {
    const query = { tagIds: [3, 5], kind: 'expense' as const };
    expect(queryToParams(query)).toEqual({ kind: 'expense', tag: '3,5' });
    const hash = buildHash('movements', { month: '2027-01', ...queryToParams(query) });
    expect(paramsToQuery(parseHash(hash).params)).toEqual(query);
    expect(queryToFilters(query).tagIds).toBe('3,5');
    const result = validateFilters(queryToFilters(query));
    expect(result.ok && result.query).toEqual(query);
    expect(searchParams(query, 2)).toBe('tagIds=3%2C5&kind=expense&page=2');
  });

  it('ignores malformed ids one by one and repeats, and a lone bad value is no search', () => {
    expect(paramsToQuery({ tag: '3, x,0,-2,3,5' })).toEqual({ tagIds: [3, 5] });
    expect(paramsToQuery({ tag: 'x' })).toBeUndefined();
    expect(paramsToQuery({ tag: '' })).toBeUndefined();
  });

  it('is a different search when the tags change', () => {
    expect(searchAction({ tagIds: [3] }, { tagIds: [3] })).toBe('rerun');
    expect(searchAction({ tagIds: [3] }, { tagIds: [3, 5] })).toBe('navigate');
    expect(searchAction({ tagIds: [3] }, {})).toBe('clear-url');
  });

  it('describes known tags only and says all must match', () => {
    const names = new Map(tags.map((t) => [t.id, t.name]));
    expect(describeFilters({ tagIds: [3, 5, 99] }, undefined, KIND_LABELS, names)).toEqual([
      'marcas casa y viaje',
    ]);
    expect(describeFilters({ tagIds: [5] }, undefined, KIND_LABELS, names)).toEqual([
      'marca viaje',
    ]);
    expect(describeFilters({ tagIds: [99] }, undefined, KIND_LABELS, names)).toEqual([]);
  });

  it('shows the checkboxes only when there are tags, with the selected ones checked', () => {
    const props = {
      categories: [],
      errors: {},
      busy: false,
      onChange: () => undefined,
      onSearch: () => undefined,
      onClear: () => undefined,
      onClose: () => undefined,
    };
    const values = { ...emptyFilters(), tagIds: '5' };
    const html = renderToStaticMarkup(<MovementFilters {...props} values={values} tags={tags} />);
    expect(html).toContain('Marcas (deben estar todas)');
    expect(html).toMatch(/<input type="checkbox" checked=""\/>\s*viaje/);
    expect(html).toMatch(/<input type="checkbox"\/>\s*casa/);
    expect(renderToStaticMarkup(<MovementFilters {...props} values={values} />)).not.toContain(
      'Marcas',
    );
  });
});

describe('tag management helpers', () => {
  it('validates a new name', () => {
    expect(validateTagName('  viaje ')).toEqual({ ok: true, name: 'viaje' });
    expect(validateTagName('  ')).toEqual({ ok: false, error: TAG_NAME_ERRORS.empty });
    expect(validateTagName('x'.repeat(31))).toEqual({ ok: false, error: TAG_NAME_ERRORS.length });
  });

  it('counts movements with Spanish plurals', () => {
    expect(countLabel(0)).toBe('Sin movimientos');
    expect(countLabel(1)).toBe('1 movimiento');
    expect(countLabel(4)).toBe('4 movimientos');
  });

  it('calls the tag endpoints', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response('[]', { status: 200 })));
    const api = createApiClient(fetchFn);
    await api.tags();
    await api.renameTag(4, 'Hogar');
    await api.deleteTag(4);
    expect(fetchFn.mock.calls.map((c) => c as unknown[])).toEqual([
      ['/api/tags', undefined],
      [
        '/api/tags/4',
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: '{"name":"Hogar"}',
        },
      ],
      ['/api/tags/4', { method: 'DELETE' }],
    ]);
  });
});
