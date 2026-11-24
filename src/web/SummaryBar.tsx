import type { MonthSummaryDto } from '../shared/api.js';
import { formatCents } from '../shared/money.js';

/**
 * The month's totals count confirmed movements only. Pending fixed items are
 * shown apart, with the projected savings if every one of them is confirmed (ADR-0005).
 */
export function SummaryBar({ summary }: { summary: MonthSummaryDto }) {
  const totals = [
    ['Ingresos', summary.incomeCents, ''],
    ['Gastos', summary.expenseCents, ''],
    ['Amortizaciones', summary.repaymentCents, ''],
    ['Ahorro', summary.savingsCents, summary.savingsCents < 0 ? 'negative' : ''],
  ] as const;
  const pending = [
    ['Ingresos pendientes', summary.pendingIncomeCents, ''],
    ['Gastos pendientes', summary.pendingExpenseCents, ''],
    ['Amortizaciones pendientes', summary.pendingRepaymentCents, ''],
    [
      'Ahorro previsto',
      summary.projectedSavingsCents,
      summary.projectedSavingsCents < 0 ? 'negative' : '',
    ],
  ] as const;
  return (
    <>
      <dl className="summary">
        {totals.map(([label, cents, tone]) => (
          <div key={label} className={`summary-item ${tone}`}>
            <dt>{label}</dt>
            <dd>{formatCents(cents)}</dd>
          </div>
        ))}
      </dl>
      <dl className="summary pending-summary" aria-label="Pendientes y ahorro previsto">
        {pending.map(([label, cents, tone]) => (
          <div key={label} className={`pending-item ${tone}`}>
            <dt>{label}</dt>
            <dd>{formatCents(cents)}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
