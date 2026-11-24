import { describe, expect, it } from 'vitest';
import type { MovementSearchDto } from '../shared/api.js';
import { initialSearchState, searchReducer, type SearchAction } from './searchState.js';

const result = (page = 1): MovementSearchDto => ({
  rows: [],
  page,
  pageSize: 50,
  count: 0,
  pageCount: 0,
  totals: { incomeCents: 0, expenseCents: 0, repaymentCents: 0, netCents: 0 },
});

const run = (...actions: SearchAction[]) => actions.reduce(searchReducer, initialSearchState);

describe('searchReducer', () => {
  it('starts in the monthly view with the panel closed', () => {
    expect(initialSearchState).toMatchObject({
      showFilters: false,
      search: undefined,
      busy: false,
    });
  });

  it('opens the panel without searching, and closes it', () => {
    expect(run({ type: 'open' })).toMatchObject({ showFilters: true, search: undefined });
    expect(run({ type: 'open' }, { type: 'close' })).toEqual(initialSearchState);
  });

  it('a new search starts on page 1, busy, without the previous results', () => {
    const loaded = run({ type: 'search', query: { q: 'a' } }, { type: 'loaded', result: result() });
    expect(loaded).toMatchObject({ busy: false, result: result() });
    const again = searchReducer(loaded, { type: 'search', query: { q: 'b' } });
    expect(again).toMatchObject({
      search: { query: { q: 'b' }, page: 1 },
      result: undefined,
      busy: true,
    });
  });

  it('paging keeps the visible results while the next page loads', () => {
    const state = run(
      { type: 'search', query: { q: 'a' } },
      { type: 'loaded', result: result(1) },
      { type: 'page', page: 2 },
    );
    expect(state).toMatchObject({ search: { page: 2 }, result: result(1), busy: true });
    expect(searchReducer(state, { type: 'loaded', result: result(2) })).toMatchObject({
      result: result(2),
      busy: false,
    });
  });

  it('leaving while a page is loading clears busy, so the next search is not stuck disabled', () => {
    const loading = run(
      { type: 'search', query: {} },
      { type: 'loaded', result: result() },
      { type: 'page', page: 2 },
    );
    expect(loading.busy).toBe(true);
    const left = searchReducer(loading, { type: 'leave' });
    expect(left).toEqual(initialSearchState);
    // The next search works normally.
    expect(searchReducer(left, { type: 'search', query: {} }).busy).toBe(true);
  });

  it('ignores an answer that arrives after leaving the search', () => {
    const left = run({ type: 'search', query: {} }, { type: 'leave' });
    expect(searchReducer(left, { type: 'loaded', result: result() })).toBe(left);
    expect(searchReducer(left, { type: 'failed', error: 'x' })).toBe(left);
    expect(searchReducer(left, { type: 'page', page: 2 })).toBe(left);
  });

  it('a failure keeps the search, stops the busy flag and is cleared by the next search', () => {
    const failed = run({ type: 'search', query: {} }, { type: 'failed', error: 'sin conexión' });
    expect(failed).toMatchObject({ error: 'sin conexión', busy: false, search: { page: 1 } });
    expect(searchReducer(failed, { type: 'search', query: {} }).error).toBeUndefined();
  });

  it('closing the panel while a search is active leaves the search', () => {
    expect(run({ type: 'search', query: {} }, { type: 'close' })).toEqual(initialSearchState);
  });
});
