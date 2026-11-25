import { describe, expect, it } from 'vitest';
import {
  shouldOpenQuickAdd,
  suggestionToShow,
  type QuickAddKey,
  type QuickAddTarget,
} from './quickAdd.js';

const key = (over: Partial<QuickAddKey> = {}): QuickAddKey => ({
  key: 'n',
  repeat: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  isComposing: false,
  defaultPrevented: false,
  ...over,
});
const target = (over: Partial<QuickAddTarget> = {}): QuickAddTarget => ({
  tag: 'BODY',
  editable: false,
  inToast: false,
  dialogOpen: false,
  ...over,
});

describe('shouldOpenQuickAdd', () => {
  it('opens on n and N from a page with nothing special focused (Informes included)', () => {
    expect(shouldOpenQuickAdd(key(), target())).toBe(true);
    expect(shouldOpenQuickAdd(key({ key: 'N' }), target())).toBe(true);
    expect(shouldOpenQuickAdd(key(), target({ tag: 'A' }))).toBe(true);
    expect(shouldOpenQuickAdd(key(), target({ tag: 'MAIN' }))).toBe(true);
  });

  it('ignores other keys', () => {
    expect(shouldOpenQuickAdd(key({ key: 'm' }), target())).toBe(false);
    expect(shouldOpenQuickAdd(key({ key: 'Enter' }), target())).toBe(false);
  });

  it.each(['INPUT', 'TEXTAREA', 'SELECT'])('does nothing while typing in %s', (tag) => {
    expect(shouldOpenQuickAdd(key(), target({ tag }))).toBe(false);
  });

  it('does nothing in a contenteditable', () => {
    expect(shouldOpenQuickAdd(key(), target({ editable: true }))).toBe(false);
  });

  it('does nothing with Ctrl, Alt or Meta held', () => {
    expect(shouldOpenQuickAdd(key({ ctrlKey: true }), target())).toBe(false);
    expect(shouldOpenQuickAdd(key({ altKey: true }), target())).toBe(false);
    expect(shouldOpenQuickAdd(key({ metaKey: true }), target())).toBe(false);
  });

  it('does nothing on key repeat, while composing, or when already handled', () => {
    expect(shouldOpenQuickAdd(key({ repeat: true }), target())).toBe(false);
    expect(shouldOpenQuickAdd(key({ isComposing: true }), target())).toBe(false);
    expect(shouldOpenQuickAdd(key({ defaultPrevented: true }), target())).toBe(false);
  });

  it('does nothing while a panel or dialog is open, or the toast action is focused', () => {
    expect(shouldOpenQuickAdd(key(), target({ dialogOpen: true }))).toBe(false);
    expect(shouldOpenQuickAdd(key(), target({ tag: 'BUTTON', inToast: true }))).toBe(false);
  });
});

describe('suggestionToShow', () => {
  const categories = [
    { id: 1, name: 'Supermercado', kind: 'expense' },
    { id: 2, name: 'Nómina', kind: 'income' },
  ];
  const result = { kind: 'expense', concept: 'Mercadona', categoryId: 1 };
  const form = { kind: 'expense', concept: 'Mercadona ', categoryId: '' };

  it('offers the category without touching the form', () => {
    const before = { ...form };
    expect(suggestionToShow(result, form, categories)).toEqual(categories[0]);
    expect(form).toEqual(before);
  });

  it('hides it when the concept or the kind changed since the answer', () => {
    expect(
      suggestionToShow(result, { ...form, concept: 'Mercadona 2' }, categories),
    ).toBeUndefined();
    expect(suggestionToShow(result, { ...form, kind: 'income' }, categories)).toBeUndefined();
  });

  it('hides it when there is none, the category is gone, or it is already chosen', () => {
    expect(suggestionToShow(undefined, form, categories)).toBeUndefined();
    expect(suggestionToShow({ ...result, categoryId: null }, form, categories)).toBeUndefined();
    expect(suggestionToShow({ ...result, categoryId: 99 }, form, categories)).toBeUndefined();
    expect(suggestionToShow(result, { ...form, categoryId: '1' }, categories)).toBeUndefined();
  });

  it('never offers a category of another kind', () => {
    expect(suggestionToShow({ ...result, categoryId: 2 }, form, categories)).toBeUndefined();
  });
});
