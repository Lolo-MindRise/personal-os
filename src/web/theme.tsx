import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'personal-os-theme';

/** The saved choice, or dark (the default). Storage can be unavailable: never throw. */
export function readTheme(): Theme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not remembered, still applied for this visit.
  }
}

/** Sidebar toggle. The choice is remembered in the browser. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => {
        saveTheme(next);
        setTheme(next);
      }}
    >
      {theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
    </button>
  );
}
