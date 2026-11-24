import { monthLabel, shiftMonth } from './months.js';

/** Previous / next buttons and a month input, with the month written out in Spanish. */
export function MonthPicker({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  return (
    <nav className="month-picker" aria-label="Mes">
      <button
        type="button"
        aria-label="Mes anterior"
        onClick={() => {
          onChange(shiftMonth(month, -1));
        }}
      >
        ←
      </button>
      <input
        type="month"
        aria-label="Mes"
        value={month}
        onChange={(e) => {
          if (e.target.value !== '') {
            onChange(e.target.value);
          }
        }}
      />
      <button
        type="button"
        aria-label="Mes siguiente"
        onClick={() => {
          onChange(shiftMonth(month, 1));
        }}
      >
        →
      </button>
      <span className="month-label">{monthLabel(month)}</span>
    </nav>
  );
}
