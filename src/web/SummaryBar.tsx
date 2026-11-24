import type { MonthSummaryDto } from '../shared/api.js';
import { formatCents } from '../shared/money.js';

export function SummaryBar({ summary }: { summary: MonthSummaryDto }) {
  const items = [
    ['Ingresos', summary.incomeCents, ''],
    ['Gastos', summary.expenseCents, ''],
    ['Amortizaciones', summary.repaymentCents, ''],
    ['Ahorro', summary.savingsCents, summary.savingsCents < 0 ? 'negative' : ''],
  ] as const;
  return (
    <dl className="summary">
      {items.map(([label, cents, tone]) => (
        <div key={label} className={`summary-item ${tone}`}>
          <dt>{label}</dt>
          <dd>{formatCents(cents)}</dd>
        </div>
      ))}
    </dl>
  );
}
