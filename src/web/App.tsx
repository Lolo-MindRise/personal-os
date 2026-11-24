import { useState } from 'react';
import { BackupBanner } from './BackupBanner.js';
import { BudgetPage } from './BudgetPage.js';
import { CategoriesPage } from './CategoriesPage.js';
import { DebtsPage } from './DebtsPage.js';
import { GoalsPage } from './GoalsPage.js';
import { MilestonesPage } from './MilestonesPage.js';
import { MovementsPage } from './MovementsPage.js';
import { RecurringPage } from './RecurringPage.js';
import { SummaryPage } from './SummaryPage.js';

export const VIEWS = [
  ['movements', 'Movimientos'],
  ['recurring', 'Fijos'],
  ['budget', 'Presupuesto'],
  ['debts', 'Deudas'],
  ['summary', 'Resumen'],
  ['goals', 'Objetivos'],
  ['milestones', 'Hitos'],
  ['categories', 'Categorías'],
] as const;

export type View = (typeof VIEWS)[number][0];

/** The top-level sections, switched with a navigation bar. */
export function Navigation({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return (
    <nav className="main-nav" aria-label="Secciones">
      {VIEWS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-current={view === id ? 'page' : undefined}
          className={view === id ? 'nav-tab active' : 'nav-tab'}
          onClick={() => {
            onChange(id);
          }}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

function Screen({ view }: { view: View }) {
  switch (view) {
    case 'movements':
      return <MovementsPage />;
    case 'recurring':
      return <RecurringPage />;
    case 'budget':
      return <BudgetPage />;
    case 'debts':
      return <DebtsPage />;
    case 'summary':
      return <SummaryPage />;
    case 'goals':
      return <GoalsPage />;
    case 'milestones':
      return <MilestonesPage />;
    case 'categories':
      return <CategoriesPage />;
  }
}

export function App() {
  const [view, setView] = useState<View>('movements');
  return (
    <>
      <BackupBanner />
      <Navigation view={view} onChange={setView} />
      <Screen view={view} />
    </>
  );
}
