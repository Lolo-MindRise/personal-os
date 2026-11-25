import { describe, expect, it } from 'vitest';
import {
  paramsToQuery,
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
