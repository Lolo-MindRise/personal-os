# Handoff 2026-11-24: UI revision (task 0015)

Three stacked blocks: `agent/ui/01-foundation` → `02-connected` → `03-forms-and-states`.
This file accumulates across the blocks.

## Block 1: foundation (`agent/ui/01-foundation`)

### Done
- Design tokens in `styles.css` (space, type, radius by hierarchy, colour) for dark (default) and
  light themes; ad-hoc values removed. Palette: pine, granite, snow, amber, brick.
- Sidebar with groups (Inicio · Día a día · Planificar · Seguimiento · Ajustes), active item marked,
  theme toggle at the bottom (remembered in `localStorage`; applied before first paint by a small
  inline script in `index.html`). On phones the sidebar folds behind a "Menú" button.
- `PageHeader` on every screen: title, month selector when monthly, optional action, hint.
- Hash routing without a library (`router.ts`): `#/movements?month=2026-01`. Reload keeps the
  place, back/forward work. Month changes replace the history entry.
- Selected month follows the user across Inicio, Movimientos and Presupuesto (in the URL, and
  carried by sidebar links).
- "Objetivos y resumen" is one sidebar entry; Resumen and Objetivos are two screens with a sub-nav.
- New screen "Copias" (read-only view of `GET /api/backups/status`), because the sidebar spec
  lists it and no such screen existed.
- Code splitting per screen (`React.lazy`).
- Tests: `router.test.ts`, `e2e/navigation.spec.ts`; existing e2e and unit tests updated to the
  sidebar (buttons → links); none deleted.

### Bundle sizes (`vite build`)
| | before | after |
|---|---|---|
| main JS | 882.86 kB (gzip 250.50) | 326.12 kB (gzip 100.01) |
| largest other chunk | none (single chunk) | DashboardCharts (Recharts) 457.80 kB (gzip 128.48) |
| CSS | 9.07 kB (gzip 2.40) | 11.66 kB (gzip 2.92) |
Build no longer warns about chunks over 500 kB.

### Decisions taken
- App identity colour changed from blue to pine: `theme-color`, manifest and generated icon
  background (`pwaIcons.ts`) now use `#1f3b2d`; the manifest test reads the light-theme block.
  Reinstalling or refreshing the installed app is needed to see the new icon.
- Expense and budget bars use neutral tones (`--expense`, `--budget`); amber marks over budget;
  brick is used only for negatives and errors.
- Tables keep their element classes; amounts right-aligned through `.amount`.
- Dashboard links are still buttons: block 2 turns them into real links.

- The Resumen year is in the URL (`#/summary?year=2026`). The Movimientos search and filters are
  **not** in the URL yet: deferred to block 2, which adds the category/month filters and their
  "clear filter" display.
- "Copias" is a new read-only screen (no new API). Needed because the sidebar spec lists it;
  flagged in the PR for Manuel to accept.
- Reviewer first pass (block 1): budget-bar contrast fixed (`--budget` ≥ 3:1), year selector moved
  into the header, screenshots retaken from a fresh build including Importar and Proyección.
  Left: `useMonth` syncs the module variable inside the snapshot read; no test for storage-unavailable theme.

### Not verified
- Windows: installed-app icon and theme colour after the change.
- Screenshots were taken in headless Chromium (dark and light) under `/tmp/ui-shots`.

## Next
Block 2: connected navigation and `docs/ui-glossary.md`.
