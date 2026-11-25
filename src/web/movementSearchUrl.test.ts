import { describe, expect, it } from 'vitest';
import { parseMoney } from '../shared/money.js';
import {
  emptyFilters,
  paramsToQuery,
  searchAction,
  queryToFilters,
  queryToParams,
  validateFilters,
  type SearchQuery,
} from './movementSearch.js';
import { buildHash, parseHash } from './router.js';

const full: SearchQuery = {
  q: 'café & té',
  categoryId: 3,
  kind: 'expense',
  from: '2027-01-01',
  to: '2027-02-28',
  minAmountCents: 450,
  maxAmountCents: 123_456,
};

describe('search filters in the URL', () => {
  it('round-trips every filter through a hash', () => {
    const hash = buildHash('movements', { month: '2027-01', ...queryToParams(full) });
    expect(paramsToQuery(parseHash(hash).params)).toEqual(full);
  });

  it('does not use the month or link params', () => {
    expect(queryToParams({ q: 'a' })).toEqual({ q: 'a' });
    expect(paramsToQuery({ month: '2027-01', category: '3', debt: '1' })).toBeUndefined();
  });

  it('turns a query into the panel fields and back into the same query', () => {
    const filters = queryToFilters(full);
    expect(filters).toMatchObject({ categoryId: '3', minAmount: '4,50', maxAmount: '1234,56' });
    const result = validateFilters(filters);
    expect(result.ok && result.query).toEqual(full);
  });

  it('keeps any amount parseMoney accepts through a round trip', () => {
    const parsed = parseMoney('90.071.992.547.409,91');
    expect(parsed.ok && parsed.cents).toBe(Number.MAX_SAFE_INTEGER);
    const filters = { ...emptyFilters(), minAmount: '90.071.992.547.409,91' };
    const result = validateFilters(filters);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(paramsToQuery(queryToParams(result.query))).toEqual(result.query);
    }
    expect(paramsToQuery({ min: '9007199254740992' })).toBeUndefined();
  });

  it('decides what "Buscar" does against the search held by the URL', () => {
    expect(searchAction(undefined, { q: 'foo' })).toBe('navigate');
    expect(searchAction({ q: 'foo' }, { q: 'foo' })).toBe('rerun');
    expect(searchAction({ q: 'foo' }, { q: 'bar' })).toBe('navigate');
    // Cleared fields with a search in the URL: the URL must drop it too.
    expect(searchAction({ q: 'foo' }, {})).toBe('clear-url');
    expect(searchAction(undefined, {})).toBe('run-in-place');
  });

  it('ignores invalid values one by one', () => {
    expect(
      paramsToQuery({
        q: 'ok',
        cat: 'abc',
        kind: 'nope',
        from: '2027-13-45',
        to: 'x',
        min: '-5',
        max: '1.5',
        unknown: 'y',
      }),
    ).toEqual({ q: 'ok' });
  });

  it('returns undefined when nothing valid is left', () => {
    expect(paramsToQuery({})).toBeUndefined();
    expect(paramsToQuery({ cat: '0', kind: '', q: '   ' })).toBeUndefined();
    expect(paramsToQuery({ q: 'x'.repeat(101) })).toBeUndefined();
  });

  it('drops an end that is before its start', () => {
    expect(paramsToQuery({ from: '2027-05-01', to: '2027-04-01' })).toEqual({ from: '2027-05-01' });
    expect(paramsToQuery({ min: '500', max: '100' })).toEqual({ minAmountCents: 500 });
  });
});
