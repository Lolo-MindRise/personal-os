import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PendingEntryDto,
  TrashDto,
  TrashedMovementDto,
  TrashedTransferDto,
} from '../shared/api.js';
import { ApiError, createApiClient } from './api.js';
import { NAV_GROUPS } from './App.js';
import { PendingList } from './PendingList.js';
import {
  confirmForeverText,
  deleteRowForever,
  deletedOn,
  restoreRow,
  trashRows,
  type TrashRow,
  TrashView,
} from './TrashPage.js';
import { UndoToast } from './UndoToast.js';
import { newToast, startUndoTimer, UNDO_MS } from './undo.js';

const noop = () => undefined;

const trashedMovement: TrashedMovementDto = {
  id: 7,
  date: '2026-11-03',
  kind: 'expense',
  categoryId: 4,
  categoryName: 'Ocio',
  concept: 'Cine',
  amountCents: 2_400,
  notes: null,
  debtId: null,
  accountId: 1,
  tags: [],
  recurringItemId: null,
  deletedAt: '2026-11-20T10:00:00.000Z',
};

const trashedTransfer: TrashedTransferDto = {
  id: 3,
  date: '2026-11-05',
  amountCents: 10_000,
  fromAccountId: 1,
  toAccountId: 2,
  notes: null,
  deletedAt: '2026-11-24T10:00:00.000Z',
};

const trash: TrashDto = { movements: [trashedMovement], transfers: [trashedTransfer] };
const movementRow: TrashRow = { type: 'movement', item: trashedMovement };
const transferRow: TrashRow = { type: 'transfer', item: trashedTransfer };

const accounts = [
  { id: 1, name: 'Principal' },
  { id: 2, name: 'Efectivo' },
];

describe('undo timer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lasts 10 seconds', () => {
    expect(UNDO_MS).toBe(10_000);
    vi.useFakeTimers();
    const expired = vi.fn();
    startUndoTimer(expired);
    vi.advanceTimersByTime(9_999);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('does not fire once cancelled', () => {
    vi.useFakeTimers();
    const expired = vi.fn();
    const cancel = startUndoTimer(expired);
    vi.advanceTimersByTime(5_000);
    cancel();
    vi.advanceTimersByTime(20_000);
    expect(expired).not.toHaveBeenCalled();
  });

  it('gives every deletion its own toast id', () => {
    const a = newToast('a', () => Promise.resolve());
    const b = newToast('b', () => Promise.resolve());
    expect(a.id).not.toBe(b.id);
  });
});

describe('UndoToast', () => {
  it('always renders an announced region, empty without a toast', () => {
    const html = renderToStaticMarkup(
      <UndoToast toast={undefined} onUndo={noop} onExpire={noop} />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('Deshacer');
  });

  it('says what happened and offers a button', () => {
    const html = renderToStaticMarkup(
      <UndoToast
        toast={newToast('Movimiento «Cine» eliminado.', () => Promise.resolve())}
        onUndo={noop}
        onExpire={noop}
      />,
    );
    expect(html).toContain('Movimiento «Cine» eliminado.');
    expect(html).toMatch(/<button[^>]*>Deshacer<\/button>/);
  });
});

describe('Papelera', () => {
  it('is in the Ajustes group', () => {
    const settings = NAV_GROUPS.find((g) => g.title === 'Ajustes');
    expect(settings?.items.map((i) => i.label)).toContain('Papelera');
  });

  it('lists movements and transfers, newest deletion first, with date and actions', () => {
    const rows = trashRows(trash);
    expect(rows.map((r) => r.type)).toEqual(['transfer', 'movement']);
    const html = renderToStaticMarkup(
      <TrashView
        trash={trash}
        accounts={accounts}
        errors={{}}
        busy={false}
        onRestore={noop}
        onDeleteForever={noop}
      />,
    );
    expect(html).toContain('Cine');
    expect(html).toContain('Principal → Efectivo');
    expect(html).toContain('Eliminado el');
    expect(html.match(/>Restaurar</g)).toHaveLength(2);
    expect(html.match(/>Eliminar definitivamente</g)).toHaveLength(2);
    expect(html).not.toContain('Vaciar');
  });

  it('shows an empty state', () => {
    const html = renderToStaticMarkup(
      <TrashView
        trash={{ movements: [], transfers: [] }}
        accounts={accounts}
        errors={{}}
        busy={false}
        onRestore={noop}
        onDeleteForever={noop}
      />,
    );
    expect(html).toContain('La papelera está vacía');
  });

  it('shows a restore error next to its row and keeps the row', () => {
    const html = renderToStaticMarkup(
      <TrashView
        trash={trash}
        accounts={accounts}
        errors={{ 'movement-7': 'No se puede restaurar: la categoría ya no existe.' }}
        busy={false}
        onRestore={noop}
        onDeleteForever={noop}
      />,
    );
    expect(html).toContain('No se puede restaurar: la categoría ya no existe.');
    expect(html).toContain('Cine');
  });

  it('formats the deletion date and the confirmation text', () => {
    // No offset: read as local time, so the day does not depend on the time zone of the machine.
    expect(deletedOn('2026-11-20T12:00:00')).toBe('20/11/2026');
    expect(confirmForeverText(movementRow)).toContain('No se puede deshacer');
    expect(confirmForeverText(movementRow)).toContain('Cine');
    expect(confirmForeverText(transferRow)).toContain('transferencia');
  });

  it('calls the right endpoint for a movement or a transfer', async () => {
    const calls: string[] = [];
    const fetchFn = (url: unknown, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    };
    const api = createApiClient(fetchFn);
    await restoreRow(api, movementRow);
    await restoreRow(api, transferRow);
    await deleteRowForever(api, movementRow).catch(noop);
    await deleteRowForever(api, transferRow).catch(noop);
    expect(calls).toEqual([
      'POST /api/trash/movements/7/restore',
      'POST /api/trash/transfers/3/restore',
      'DELETE /api/trash/movements/7',
      'DELETE /api/trash/transfers/3',
    ]);
  });

  it('a refused restore surfaces the Spanish server message', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'No se puede restaurar: la cuenta ya no existe.' }), {
          status: 409,
        }),
      ),
    );
    const api = createApiClient(fetchFn);
    await expect(restoreRow(api, movementRow)).rejects.toBeInstanceOf(ApiError);
    await expect(restoreRow(api, movementRow)).rejects.toThrow(/No se puede restaurar/);
  });
});

describe('pending entries held by the trash', () => {
  const entry = (heldByTrash: boolean): PendingEntryDto => ({
    recurringItemId: 1,
    month: '2026-11',
    date: '2026-11-05',
    kind: 'expense',
    categoryId: 4,
    categoryName: 'Ocio',
    concept: 'Gimnasio',
    amountCents: 3_000,
    notes: null,
    heldByTrash,
  });

  it('shows «En la papelera» instead of Confirmar', () => {
    const html = renderToStaticMarkup(
      <PendingList
        pending={[entry(true)]}
        skipped={[]}
        onConfirm={noop}
        onSkip={noop}
        onUndo={noop}
        onConfirmAll={noop}
      />,
    );
    expect(html).toContain('En la papelera');
    expect(html).toContain('#/trash');
    expect(html).not.toMatch(/>Confirmar</);
  });

  it('keeps Confirmar for free items', () => {
    const html = renderToStaticMarkup(
      <PendingList
        pending={[entry(false)]}
        skipped={[]}
        onConfirm={noop}
        onSkip={noop}
        onUndo={noop}
        onConfirmAll={noop}
      />,
    );
    expect(html).toMatch(/>Confirmar</);
    expect(html).not.toContain('En la papelera');
  });
});
