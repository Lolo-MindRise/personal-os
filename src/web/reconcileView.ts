import type { ReconciliationPreviewDto } from '../shared/api.js';
import { formatCents } from '../shared/money.js';
import { KIND_LABELS } from './labels.js';
import { formatDate } from './months.js';

/** A preview is shown only while it answers the date currently chosen (never a stale one). */
export function visiblePreview(
  preview: ReconciliationPreviewDto | undefined,
  wantedDate: string | undefined,
): ReconciliationPreviewDto | undefined {
  return preview !== undefined && wantedDate !== undefined && preview.date === wantedDate
    ? preview
    : undefined;
}

export interface ReconcileRow {
  key: string;
  text: string;
}

/** Movements and transfers in ONE list: by date, then kind (movements first), then id. */
export function reconcileRows(
  preview: ReconciliationPreviewDto,
  accountId: number,
  nameOf: (id: number) => string,
): ReconcileRow[] {
  const rows: (ReconcileRow & { date: string; order: number; id: number })[] = [
    ...preview.movements.map((m) => ({
      key: `m${String(m.id)}`,
      date: m.date,
      order: 0,
      id: m.id,
      text: `${formatDate(m.date)} · ${KIND_LABELS[m.kind]} · ${m.concept} · ${
        m.kind === 'income' ? '+' : '−'
      }${formatCents(m.amountCents)}`,
    })),
    ...preview.transfers.map((t) => {
      const out = t.fromAccountId === accountId;
      const other = nameOf(out ? t.toAccountId : t.fromAccountId);
      return {
        key: `t${String(t.id)}`,
        date: t.date,
        order: 1,
        id: t.id,
        text: `${formatDate(t.date)} · ${
          out ? `Transferencia a «${other}»` : `Transferencia desde «${other}»`
        } · ${out ? '−' : '+'}${formatCents(t.amountCents)}`,
      };
    }),
  ];
  return rows
    .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.id - b.id)
    .map(({ key, text }) => ({ key, text }));
}

/** Extra warning of the account delete confirmation when it has reconciliation records. */
export function reconciliationsWarning(count: number): string {
  if (count <= 0) {
    return '';
  }
  return count === 1
    ? 'Se borrará también su conciliación.'
    : `Se borrarán también sus ${String(count)} conciliaciones.`;
}

export function deleteAccountConfirmText(name: string, reconciliationCount: number): string {
  const warning = reconciliationsWarning(reconciliationCount);
  return `¿Eliminar la cuenta «${name}»?${warning === '' ? '' : ` ${warning}`}`;
}
