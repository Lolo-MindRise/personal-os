import type { ReactNode, Ref } from 'react';
import { MonthPicker } from './MonthPicker.js';

/**
 * The header every screen starts with: the title, the month selector when the screen is monthly,
 * and at most one primary action. The hint under it says what the screen is for.
 */
export function PageHeader({
  title,
  month,
  onMonthChange,
  action,
  hint,
  headingRef,
  period,
}: {
  /** A non-monthly period selector (the year in Resumen). */
  period?: ReactNode;
  title: string;
  month?: string | undefined;
  onMonthChange?: ((month: string) => void) | undefined;
  action?: ReactNode;
  hint?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <header className="page-header">
      <div className="page-header-row">
        <h1 ref={headingRef} tabIndex={headingRef === undefined ? undefined : -1}>
          {title}
        </h1>
        {action !== undefined && <div className="page-action">{action}</div>}
      </div>
      {month !== undefined && onMonthChange !== undefined && (
        <MonthPicker month={month} onChange={onMonthChange} />
      )}
      {period}
      {hint !== undefined && <p className="hint">{hint}</p>}
    </header>
  );
}

/** Two screens that share one sidebar entry. */
export function SubNav({
  items,
  current,
}: {
  items: { href: string; label: string; id: string }[];
  current: string;
}) {
  return (
    <nav className="sub-nav" aria-label="Vistas">
      {items.map((item) => (
        <a
          key={item.id}
          href={item.href}
          aria-current={item.id === current ? 'page' : undefined}
          className={item.id === current ? 'active' : undefined}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
