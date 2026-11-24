import { useState } from 'react';
import { MovementsPage } from './MovementsPage.js';
import { RecurringPage } from './RecurringPage.js';

export const VIEWS = [
  ['movements', 'Movimientos'],
  ['recurring', 'Fijos'],
] as const;

export type View = (typeof VIEWS)[number][0];

/** The two top-level sections, switched with a navigation bar. */
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

export function App() {
  const [view, setView] = useState<View>('movements');
  return (
    <>
      <Navigation view={view} onChange={setView} />
      {view === 'movements' ? <MovementsPage /> : <RecurringPage />}
    </>
  );
}
