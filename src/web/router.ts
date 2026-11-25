import { useCallback, useSyncExternalStore } from 'react';
import { currentMonth } from './months.js';

/**
 * Hash routing without a library: `#/movements?month=2026-01&category=3`.
 * Every screen has its own URL, so reloads keep the place and the back button works.
 */
export const VIEW_IDS = [
  'dashboard',
  'movements',
  'import',
  'budget',
  'recurring',
  'projection',
  'debts',
  'reports',
  'summary',
  'goals',
  'milestones',
  'categories',
  'tags',
  'accounts',
  'backups',
] as const;

export type View = (typeof VIEW_IDS)[number];

export type Params = Record<string, string>;

export interface Route {
  view: View;
  params: Params;
}

/** Screens that show one month; the selected month follows the user across them. */
export const MONTHLY_VIEWS: readonly View[] = ['dashboard', 'movements', 'budget'];

export const isMonthly = (view: View) => MONTHLY_VIEWS.includes(view);

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isMonth = (value: string | undefined): value is string =>
  value !== undefined && MONTH_RE.test(value);

const isView = (value: string): value is View => (VIEW_IDS as readonly string[]).includes(value);

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?', 2);
  const view = isView(path) ? path : 'dashboard';
  const params: Params = {};
  new URLSearchParams(query).forEach((value, key) => {
    if (value !== '') {
      params[key] = value;
    }
  });
  return { view, params };
}

export function buildHash(view: View, params: Params = {}): string {
  const entries = Object.entries(params).filter(([, value]) => value !== '');
  const query = new URLSearchParams(entries).toString();
  return `#/${view}${query === '' ? '' : `?${query}`}`;
}

/** The month last chosen or visited. Links to monthly screens carry it. */
let selectedMonth: string | undefined;

export function getSelectedMonth(): string {
  return selectedMonth ?? currentMonth();
}

export function setSelectedMonth(month: string): void {
  selectedMonth = month;
}

/** Test helper: forget the selected month. */
export function resetSelectedMonth(): void {
  selectedMonth = undefined;
}

/** The URL for a screen; monthly screens get the selected month unless one is given. */
export function hrefFor(view: View, params: Params = {}): string {
  if (isMonthly(view) && params.month === undefined) {
    return buildHash(view, { month: getSelectedMonth(), ...params });
  }
  return buildHash(view, params);
}

function readRoute(): Route {
  const route = parseHash(window.location.hash);
  if (isMonthly(route.view) && isMonth(route.params.month)) {
    selectedMonth = route.params.month;
  }
  return route;
}

let cachedHash: string | undefined;
let cachedRoute: Route = { view: 'dashboard', params: {} };

function getSnapshot(): Route {
  const hash = window.location.hash;
  if (hash !== cachedHash) {
    cachedHash = hash;
    cachedRoute = readRoute();
  }
  return cachedRoute;
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => {
    window.removeEventListener('hashchange', listener);
  };
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Go to a screen. `replace` swaps the current history entry instead of adding one. */
export function navigate(view: View, params: Params = {}, options: { replace?: boolean } = {}) {
  const hash = hrefFor(view, params);
  if (options.replace === true) {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

/** Change only some parameters of the current screen, replacing the history entry. */
export function updateParams(change: Record<string, string | undefined>) {
  const { view, params } = parseHash(window.location.hash);
  const merged: Record<string, string | undefined> = { ...params, ...change };
  const next: Params = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== '') {
      next[key] = value;
    }
  }
  navigate(view, next, { replace: true });
}

const monthListeners = new Set<() => void>();

function subscribeMonth(listener: () => void): () => void {
  monthListeners.add(listener);
  window.addEventListener('hashchange', listener);
  return () => {
    monthListeners.delete(listener);
    window.removeEventListener('hashchange', listener);
  };
}

/**
 * The month of the current screen: the one in the URL, else the one selected before, else this
 * month. Changing it rewrites the URL in place, so the back button leaves the screen, not the month.
 */
export function useMonth(): [string, (month: string) => void] {
  const month = useSyncExternalStore(subscribeMonth, () => {
    const { view, params } = parseHash(window.location.hash);
    if (isMonthly(view) && isMonth(params.month)) {
      selectedMonth = params.month;
    }
    return getSelectedMonth();
  });
  const setMonth = useCallback((next: string) => {
    selectedMonth = next;
    if (isMonthly(parseHash(window.location.hash).view)) {
      updateParams({ month: next });
    }
    monthListeners.forEach((listener) => {
      listener();
    });
  }, []);
  return [month, setMonth];
}
