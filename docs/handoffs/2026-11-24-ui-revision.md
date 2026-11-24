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

## Block 2: connected navigation (`agent/ui/02-connected`)

### Done
- Dashboard: key figures, goal and debt cards, pending items, milestones, category and month data
  tables are links; clicking a bar of the category chart opens that category's movements for the
  month, a bar of the months chart opens that month.
- Movimientos understands `category` (within the month, client-side), `debt` and `fixed` (across
  months, through the search API) in the URL. A filter bar says what is applied and clears it.
- Presupuesto row, Categorías row, Fijos concept, Deudas (`?debt=`) link the same way. Each debt
  card links to its linked movements (installments and extra repayments were already listed there).
- Server: `GET /api/movements/search` accepts `debtId` and `recurringItemId` (additive, tested).
- `docs/ui-glossary.md`; applied: "Añadir" is the only create verb (dashboard said "Crear" and
  "Registrar").
- Tests: server search by debt and fixed item; `e2e/connections.spec.ts` (links land filtered, back
  button, chart bars, debt filter); existing e2e updated (dashboard buttons became links).

### Decisions taken
- Movimientos search panel filters are still not in the URL (only link filters are). Reason: the
  panel is a free form with its own state machine; link filters cover the brief's connections.
- The `fixed` link keeps the selected month in the URL only so "clear filter" returns to it.
- The dashboard no longer takes an `onNavigate` prop: plain links replace it.

- Reviewer first pass (block 2): the debt filter also matches installments (fixed items linked to
  the debt), tested; filtered debt view opens its lists and says when the debt no longer exists;
  linked view names the fixed item and has one clear control; category filter says totals are the
  month's; `SummaryBar` label follows the glossary.

## Block 3: forms and states (`agent/ui/03-forms-and-states`)

### Done
- `SidePanel` + `usePanel`: add/edit forms of Movimientos (add, edit, confirm a fixed item),
  Presupuesto, Categorías, Deudas, Objetivos, Resumen (saldo inicial), Hitos, Fijos and Proyección
  (scenario adjustments) open in a modal panel. Esc (anywhere), overlay and "Cerrar" close it;
  Tab stays inside; focus returns to the element that opened it. Forms, validation and messages
  are the same components as before.
- Each screen has its primary action in the page header ("Añadir movimiento", "Añadir deuda",
  "Cambiar presupuesto", "Editar saldo inicial"…). Submit buttons say what they save: "Guardar
  movimiento / categoría / deuda / objetivo / hito / fijo / ajuste", "Confirmar fijo".
- Empty states say what is missing and where to add it (links to Importar, Fijos, Categorías).
- Errors: the network message says what to check; the server's bare "Datos no válidos." gets
  "Revisa lo escrito y vuelve a intentarlo." (client side only, API untouched).
- Tests: `sidePanel.test.tsx`, `e2e/panel.spec.ts` (focus kept inside, Esc, focus returns, overlay,
  empty state); every existing e2e opens the panel first and uses the new button names.

### Decisions taken
- The panel is modal, so "Confirmar todos" while a confirmation is open is no longer possible from
  the UI. The e2e step that did it now closes the panel first; the guard that cancels a confirmation
  whose entry is no longer pending stays for out-of-band changes (another tab).
- Resumen: saving the initial balance closes the panel and shows "Guardado." on the page.
- The scenario adjustments of Proyección are in a panel too, for one consistent pattern.

### Not verified
- Screen reader behaviour of the dialog; only keyboard behaviour is tested.

## End of run
Blocks 1, 2 and 3 are PRs #42, #43 and the block 3 PR (see the PR list), stacked in that order.
Merge in order. Open items: search-panel filters not in the URL; `useMonth` syncs module state
while reading; git author email is a placeholder (`TU_EMAIL_DE_GITHUB`) in the local config.
