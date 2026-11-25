import { lazy, Suspense, useState } from 'react';
import { BackupBanner } from './BackupBanner.js';
import { hrefFor, useRoute, type View } from './router.js';
import { ThemeToggle } from './theme.js';

export type { View } from './router.js';

const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, key: K) =>
  lazy(async () => ({ default: (await load())[key] }));

const DashboardPage = named(() => import('./DashboardPage.js'), 'DashboardPage');
const MovementsPage = named(() => import('./MovementsPage.js'), 'MovementsPage');
const ImportPage = named(() => import('./ImportPage.js'), 'ImportPage');
const BudgetPage = named(() => import('./BudgetPage.js'), 'BudgetPage');
const RecurringPage = named(() => import('./RecurringPage.js'), 'RecurringPage');
const ProjectionPage = named(() => import('./ProjectionPage.js'), 'ProjectionPage');
const DebtsPage = named(() => import('./DebtsPage.js'), 'DebtsPage');
const SummaryPage = named(() => import('./SummaryPage.js'), 'SummaryPage');
const GoalsPage = named(() => import('./GoalsPage.js'), 'GoalsPage');
const MilestonesPage = named(() => import('./MilestonesPage.js'), 'MilestonesPage');
const CategoriesPage = named(() => import('./CategoriesPage.js'), 'CategoriesPage');
const AccountsPage = named(() => import('./AccountsPage.js'), 'AccountsPage');
const BackupsPage = named(() => import('./BackupsPage.js'), 'BackupsPage');

const SCREENS: Record<View, React.LazyExoticComponent<React.ComponentType>> = {
  dashboard: DashboardPage,
  movements: MovementsPage,
  import: ImportPage,
  budget: BudgetPage,
  recurring: RecurringPage,
  projection: ProjectionPage,
  debts: DebtsPage,
  summary: SummaryPage,
  goals: GoalsPage,
  milestones: MilestonesPage,
  categories: CategoriesPage,
  accounts: AccountsPage,
  backups: BackupsPage,
};

interface NavItem {
  /** The screen the link opens. */
  view: View;
  label: string;
  /** Other screens that keep this item marked as the active one. */
  also?: View[];
}

interface NavGroup {
  title?: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  { items: [{ view: 'dashboard', label: 'Inicio' }] },
  {
    title: 'Día a día',
    items: [
      { view: 'movements', label: 'Movimientos' },
      { view: 'import', label: 'Importar' },
    ],
  },
  {
    title: 'Planificar',
    items: [
      { view: 'budget', label: 'Presupuesto' },
      { view: 'recurring', label: 'Fijos' },
      { view: 'projection', label: 'Proyección' },
    ],
  },
  {
    title: 'Seguimiento',
    items: [
      { view: 'debts', label: 'Deudas' },
      { view: 'summary', label: 'Objetivos y resumen', also: ['goals'] },
      { view: 'milestones', label: 'Hitos' },
    ],
  },
  {
    title: 'Ajustes',
    items: [
      { view: 'categories', label: 'Categorías' },
      { view: 'accounts', label: 'Cuentas' },
      { view: 'backups', label: 'Copias' },
    ],
  },
];

/** The sidebar: grouped links, one per screen, with the active one marked. */
export function Navigation({ view }: { view: View }) {
  return (
    <nav className="main-nav" aria-label="Secciones">
      {NAV_GROUPS.map((group) => (
        <div key={group.title ?? 'main'} className="nav-group">
          {group.title !== undefined && <p className="nav-title">{group.title}</p>}
          <ul>
            {group.items.map((item) => {
              const active = view === item.view || (item.also?.includes(view) ?? false);
              return (
                <li key={item.view}>
                  <a
                    href={hrefFor(item.view)}
                    aria-current={active ? 'page' : undefined}
                    className={active ? 'nav-link active' : 'nav-link'}
                  >
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function App() {
  const { view } = useRoute();
  // On a phone the menu folds away. It is open only for the screen it was opened on, so
  // choosing another screen closes it.
  const [openOn, setOpenOn] = useState<View | undefined>();
  const menuOpen = openOn === view;
  const Screen = SCREENS[view];
  return (
    <div className="app-shell">
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <div className="sidebar-top">
          <p className="brand">Personal OS</p>
          <button
            type="button"
            className="menu-button"
            aria-expanded={menuOpen}
            aria-controls="sidebar-body"
            onClick={() => {
              setOpenOn(menuOpen ? undefined : view);
            }}
          >
            Menú
          </button>
        </div>
        <div className="sidebar-body" id="sidebar-body">
          <Navigation view={view} />
          <ThemeToggle />
        </div>
      </aside>
      <div className="content">
        <BackupBanner />
        <Suspense fallback={<p className="page loading">Cargando…</p>}>
          <Screen />
        </Suspense>
      </div>
    </div>
  );
}
