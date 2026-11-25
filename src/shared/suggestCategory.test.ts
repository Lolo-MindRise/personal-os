import { describe, expect, it } from 'vitest';
import {
  conceptTokens,
  normalizeConcept,
  suggestCategory,
  type SuggestionSource,
} from './suggestCategory.js';

let nextId = 1;
const m = (concept: string, categoryId: number, date = '2026-03-01'): SuggestionSource => ({
  id: nextId++,
  date,
  concept,
  categoryId,
});

describe('normalizeConcept', () => {
  it('ignores case, accents, punctuation and digits', () => {
    expect(normalizeConcept('  MERCADONA 0123, Valencia! ')).toBe('mercadona valencia');
    expect(normalizeConcept('Café-Bar Ñandú')).toBe('cafe bar nandu');
    expect(normalizeConcept('1234 ,.')).toBe('');
  });

  it('keeps only words of three letters or more as tokens', () => {
    expect([...conceptTokens('Pago de la luz')]).toEqual(['pago', 'luz']);
  });
});

describe('suggestCategory', () => {
  it('matches an exact normalised concept, ignoring accents and case', () => {
    expect(suggestCategory('CAFÉ', [m('cafe', 5)])).toBe(5);
  });

  it('prefers exact matches over shared words', () => {
    const past = [m('Cena Pizzeria', 1), m('Cena Pizzeria', 1), m('Cena', 2)];
    expect(suggestCategory('Cena', past)).toBe(2);
  });

  it('falls back to a shared word of three letters or more', () => {
    expect(suggestCategory('Compra Mercadona sur', [m('Mercadona centro 22', 7)])).toBe(7);
  });

  it('ignores short words', () => {
    expect(suggestCategory('Pago de luz', [m('Cena de gala', 3)])).toBeUndefined();
  });

  it('picks the most frequent category', () => {
    const past = [m('Bar Pepe', 1), m('Bar Luis', 2), m('Bar Ana', 2)];
    expect(suggestCategory('Bar', past)).toBe(2);
  });

  it('breaks a tie with the most recent use', () => {
    const past = [m('Bar Pepe', 1, '2026-03-10'), m('Bar Luis', 2, '2026-02-01')];
    expect(suggestCategory('Bar', past)).toBe(1);
    expect(suggestCategory('Bar', [...past].reverse())).toBe(1);
  });

  it('breaks a same-day tie with the higher id', () => {
    const a = { id: 90, date: '2026-03-10', concept: 'Bar uno', categoryId: 1 };
    const b = { id: 91, date: '2026-03-10', concept: 'Bar dos', categoryId: 2 };
    expect(suggestCategory('Bar', [b, a])).toBe(2);
  });

  it('gives no suggestion without a similar movement, for an empty concept, or no history', () => {
    expect(suggestCategory('Gasolina', [m('Alquiler', 1)])).toBeUndefined();
    expect(suggestCategory('   ', [m('Alquiler', 1)])).toBeUndefined();
    expect(suggestCategory('123', [m('123', 1)])).toBeUndefined();
    expect(suggestCategory('Alquiler', [])).toBeUndefined();
  });
});
