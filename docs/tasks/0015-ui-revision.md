# Task 0015: UI revision — simple, intuitive, connected

**Branches:** `agent/ui/01-foundation`, `agent/ui/02-connected`, `agent/ui/03-forms-and-states`
**ADRs:** all (0001–0007)

## Goal

The app works but each screen was built on its own. Manuel wants a very
simple, intuitive interface where everything is connected by navigation.
**Understanding at a glance matters more than visual impact.** No
functional changes: same data, same calculations, same API behaviour.

## Protocol

Three stacked blocks. Follow the run protocol and hard rules of
`docs/tasks/0008-overnight-run.md`, with these changes:
- Step 1: confirm `main` contains ADR-0007. If not, stop.
- PR titles are prefixed `[ui N/3]` and follow the PR template (ADR-0007).
- Reviewer: run it, fix, run it again on the final diff; both verdicts in
  the PR.
- Before opening each PR, take Playwright screenshots of every screen you
  changed, in both themes, into `/tmp`, and look at them with the Read
  tool. Fix what looks wrong before the reviewer runs.
- No new dependencies (no router, no font packages, no UI library). If
  something seems to need one, stop and report.

## Design direction (decided by Manuel)

- **Themes:** dark by default, light available through a toggle in the
  sidebar; the choice is remembered in the browser.
- **Palette:** pine green `#1F3B2D` (primary, positive savings), granite
  `#5E6668` (secondary text), snow `#F7F8F6` (light background), amber
  `#B7791F` (warnings, over budget), muted brick `#A4462F` (negative values
  and errors only). Derive the dark theme from the same hues. WCAG AA
  contrast in both themes.
- **Type:** the system font stack (Segoe UI on Windows). Tabular figures
  (`font-variant-numeric: tabular-nums`) for every amount. One clear type
  scale. Sentence case everywhere; no all-caps labels.
- **Restraint:** no decorative effects, gradients or entrance animations.
  Motion only to show what changed after an action. Visible keyboard focus.

## Block 1 — Foundation

- Design tokens as CSS variables (colour, spacing scale, type scale,
  radius by hierarchy) for both themes, used everywhere; remove ad-hoc
  values.
- **Layout:** a sidebar with grouped navigation and a clear active item:
  Inicio · Día a día (Movimientos, Importar) · Planificar (Presupuesto,
  Fijos, Proyección) · Seguimiento (Deudas, Objetivos y resumen, Hitos) ·
  Ajustes (Categorías, Copias).
- **Page header pattern** on every screen: title, month selector where the
  screen is monthly, and at most one primary action.
- **Routing without a library:** each screen has its own URL (hash based),
  including its month and filters, so links can be shared, reloading keeps
  the place and the browser back button works.
- **The selected month follows you** across monthly screens.
- **Code splitting per screen** (dynamic imports), so the build no longer
  warns about chunks over 500 kB. Record bundle sizes before and after.
- **Tables:** amounts right-aligned, same date format everywhere.

## Block 2 — Connected navigation

From any figure, one click to what is behind it, landing on the target
screen already filtered:
- Dashboard cards and chart elements → their screen (a category bar →
  that category's movements for that month; a debt → its detail; a goal →
  goals; a pending item → the month's pending list).
- Budget row → movements of that category and month.
- Debt → its installments and extra repayments.
- Fixed item → its confirmed movements.
- Category → its movements.
- Filtered views show what filter is applied and how to clear it.
- **Vocabulary:** write `docs/ui-glossary.md` (one name per concept, in
  Spanish) and apply it to every label, button, message and heading.

## Block 3 — Forms and states

- Add and edit forms open in a **side panel** on every screen (Esc closes,
  focus stays inside, returns to the triggering element). Same validation
  and messages as today.
- Buttons say exactly what they do ("Guardar movimiento", not "Enviar").
- **Empty states** on every screen: what is missing and a link to set it up.
- Errors say what happened and how to fix it.

## Tests

- Update existing e2e tests to the new structure; none may be deleted to
  make the suite pass.
- New e2e: navigation links land on the right filtered view; the back
  button returns to the previous view; the selected month persists between
  screens; the theme toggle persists after reload; a side panel opens,
  saves and closes.

## Manual test (for each PR)

Exact steps for Manuel with what he should see, in both themes. At minimum:
navigate every sidebar entry; follow three connections from the dashboard
and come back with the browser back button; change the month and switch
screens; add and edit a movement in the side panel.

## Out of scope

New features, data model changes, API changes beyond what navigation
filters need, anything touching the real instance.

## Done when

Each block has its PR with both CI jobs green, both reviewer verdicts, the
review guide and the manual test, and the handoff says where the run ended.
