import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrashDto } from '../shared/api.js';
import { ApiError } from './api.js';
import {
  errorsAfter,
  errorsBefore,
  rowKey,
  runRowAction,
  trashRows,
  type TrashRow,
} from './TrashPage.js';
import {
  afterExpire,
  newToast,
  performUndo,
  startUndoTimer,
  UNDO_MS,
  type UndoFlight,
} from './undo.js';

afterEach(() => {
  vi.useRealTimers();
});

const conflict = () => new ApiError('La cuenta de este movimiento ya no existe.');

describe('performUndo', () => {
  it('a failed restore (409) calls onError, then settles so the toast closes', async () => {
    const toast = newToast('x', () => Promise.reject(conflict()));
    const calls: string[] = [];
    const ok = await performUndo(
      toast,
      { current: false },
      {
        onError: (e) => calls.push(`error:${(e as ApiError).message}`),
        onSettled: () => calls.push('settled'),
      },
    );
    expect(ok).toBe(false);
    expect(calls).toEqual(['error:La cuenta de este movimiento ya no existe.', 'settled']);
  });

  it('a restore that works reports no error and settles', async () => {
    const toast = newToast('x', () => Promise.resolve({}));
    const onError = vi.fn();
    const onSettled = vi.fn();
    expect(await performUndo(toast, { current: false }, { onError, onSettled })).toBe(true);
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('a double click sends the restore once', async () => {
    const restore = vi.fn(() => Promise.resolve({}));
    const toast = newToast('x', restore);
    const flight: UndoFlight = { current: false };
    const hooks = { onError: vi.fn(), onSettled: vi.fn() };
    const first = performUndo(toast, flight, hooks);
    const second = performUndo(toast, flight, hooks);
    expect(await second).toBe(false);
    expect(await first).toBe(true);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(hooks.onSettled).toHaveBeenCalledTimes(1);
    expect(hooks.onError).not.toHaveBeenCalled();
    expect(flight.current).toBe(false);
  });
});

describe('afterExpire', () => {
  it('closes the toast that expired', () => {
    const toast = newToast('a', () => Promise.resolve());
    expect(afterExpire(toast, toast)).toBeUndefined();
  });

  it('ignores a stale toast after a second deletion replaced it', () => {
    const first = newToast('a', () => Promise.resolve());
    const second = newToast('b', () => Promise.resolve());
    expect(afterExpire(second, first)).toBe(second);
    expect(afterExpire(undefined, first)).toBeUndefined();
  });
});

describe('the toast timer', () => {
  it('cancelled on replacement or unmount, it never expires the toast', () => {
    vi.useFakeTimers();
    const first = newToast('a', () => Promise.resolve());
    const second = newToast('b', () => Promise.resolve());
    const expired: number[] = [];
    let current: ReturnType<typeof newToast> | undefined = first;
    const schedule = (t: typeof first) =>
      startUndoTimer(() => {
        expired.push(t.id);
        current = afterExpire(current, t);
      });
    const cancelFirst = schedule(first);
    vi.advanceTimersByTime(UNDO_MS - 1);
    // A second deletion: the effect cleanup cancels the first timer, the second one starts.
    cancelFirst();
    current = second;
    const cancelSecond = schedule(second);
    vi.advanceTimersByTime(UNDO_MS - 1);
    expect(expired).toEqual([]);
    expect(current).toBe(second);
    // Unmount: the cleanup cancels the last timer.
    cancelSecond();
    vi.advanceTimersByTime(UNDO_MS * 2);
    expect(expired).toEqual([]);
  });

  it('expires only the toast it belongs to', () => {
    vi.useFakeTimers();
    const first = newToast('a', () => Promise.resolve());
    const second = newToast('b', () => Promise.resolve());
    let current: ReturnType<typeof newToast> | undefined = second;
    // The first timer was not cancelled by mistake: it must still leave the second toast alone.
    startUndoTimer(() => {
      current = afterExpire(current, first);
    });
    vi.advanceTimersByTime(UNDO_MS);
    expect(current).toBe(second);
  });
});

describe('Papelera row actions', () => {
  const movement = { type: 'movement', item: { id: 7 } } as unknown as TrashRow;
  const transfer = { type: 'transfer', item: { id: 7 } } as unknown as TrashRow;

  it('a failing action keeps the row and puts the error next to it', async () => {
    const outcome = await runRowAction(() => Promise.reject(conflict()));
    expect(outcome).toEqual({ ok: false, message: 'La cuenta de este movimiento ya no existe.' });
    const errors = errorsAfter({}, movement, outcome);
    expect(errors[rowKey(movement)]).toBe('La cuenta de este movimiento ya no existe.');
    // Only that row: the transfer with the same id has none.
    expect(errors[rowKey(transfer)]).toBeUndefined();
  });

  it('a network failure shows the generic message', async () => {
    const outcome = await runRowAction(() => Promise.reject(new TypeError('fetch failed')));
    expect(outcome.ok).toBe(false);
  });

  it('a new attempt clears the old error, a success adds none', async () => {
    const failed = errorsAfter({}, movement, { ok: false, message: 'mal' });
    expect(errorsBefore(failed, movement)[rowKey(movement)]).toBeUndefined();
    expect(await runRowAction(() => Promise.resolve({}))).toEqual({ ok: true });
    expect(errorsAfter(failed, transfer, { ok: true })).toBe(failed);
  });
});

describe('trashRows order', () => {
  it('is newest first, with a stable order on equal deletion times', () => {
    const base = {
      date: '2026-11-01',
      amountCents: 1,
      notes: null,
      deletedAt: '2026-11-20T10:00:00.000Z',
    };
    const trash = {
      movements: [
        { ...base, id: 9, deletedAt: '2026-11-19T10:00:00.000Z' },
        { ...base, id: 5 },
        { ...base, id: 2 },
      ],
      transfers: [{ ...base, id: 1 }],
    } as unknown as TrashDto;
    const keys = trashRows(trash).map(rowKey);
    expect(keys).toEqual(['movement-2', 'movement-5', 'transfer-1', 'movement-9']);
    expect(trashRows(trash).map(rowKey)).toEqual(keys);
  });
});
