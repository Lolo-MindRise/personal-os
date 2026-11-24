import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { GoalDto, YearSummaryDto } from '../shared/api.js';
import { Navigation } from './App.js';
import { createApiClient } from './api.js';
import { GoalForm, GoalList } from './GoalsPage.js';
import { SettingsForm, YearTable } from './SummaryPage.js';
import {
  barPercent,
  emptyGoalForm,
  formFromGoal,
  formFromSettings,
  mapGoalApiErrors,
  mapSettingsApiErrors,
  validateGoalForm,
  validateSettingsForm,
} from './summaryForms.js';

const noop = () => undefined;

const row = (n: number, over: Partial<YearSummaryDto['rows'][number]> = {}) => ({
  month: `2026-${String(n).padStart(2, '0')}`,
  incomeCents: 0,
  expenseCents: 0,
  repaymentCents: 0,
  savingsCents: 0,
  accumulatedCents: 0 as number | null,
  ...over,
});

const summary: YearSummaryDto = {
  year: 2026,
  settings: { initialSavingsCents: 100_000, initialSavingsDate: '2026-01-15' },
  rows: [
    row(1, {
      incomeCents: 200_000,
      expenseCents: 90_070,
      repaymentCents: 10_000,
      savingsCents: 99_930,
      accumulatedCents: 199_930,
    }),
    row(2, { expenseCents: 100_000, savingsCents: -100_000, accumulatedCents: 99_930 }),
    row(3, { accumulatedCents: -50_000 }),
    ...Array.from({ length: 9 }, (_, i) => row(i + 4, { accumulatedCents: null })),
  ],
  totals: {
    incomeCents: 200_000,
    expenseCents: 190_070,
    repaymentCents: 10_000,
    savingsCents: -70,
  },
};

describe('barPercent', () => {
  it('scales against the maximum, 0 to 100', () => {
    expect(barPercent(50, 100)).toBe(50);
    expect(barPercent(100, 100)).toBe(100);
    expect(barPercent(0, 100)).toBe(0);
  });

  it('shows at least 1 % for a non-zero value, and never divides by zero or goes negative', () => {
    expect(barPercent(1, 1_000_000)).toBe(1);
    expect(barPercent(5, 0)).toBe(0);
    expect(barPercent(-5, 100)).toBe(0);
    expect(barPercent(300, 100)).toBe(100);
  });
});

describe('YearTable', () => {
  const html = renderToStaticMarkup(<YearTable summary={summary} />);

  it('has a row per month in Spanish and the six columns', () => {
    for (const month of ['enero', 'febrero', 'marzo', 'diciembre']) {
      expect(html).toContain(`>${month}</th>`);
    }
    for (const head of ['Ingresos', 'Gastos', 'Amortizaciones', 'Ahorro', 'Ahorro acumulado']) {
      expect(html).toContain(`>${head}</th>`);
    }
    expect(html.match(/<tbody>[\s\S]*<\/tbody>/)?.[0].match(/<tr>/g)).toHaveLength(12);
  });

  it('shows the figures in Spanish format', () => {
    expect(html).toMatch(/2\.000,00\s€/);
    expect(html).toMatch(/900,70\s€/);
    expect(html).toMatch(/999,30\s€/);
    expect(html).toMatch(/1\.999,30\s€/);
  });

  it('draws CSS bars, hidden from assistive technology, with widths relative to the year', () => {
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('bar-income');
    expect(html).toContain('bar-expense');
    expect(html).toContain('bar-repayment');
    // The largest income is 100 % of the flow scale; the 100.000 expense is 50 % of it.
    expect(html).toContain('style="width:100%"');
    expect(html).toContain('style="width:50%"');
  });

  it('marks deficits and a negative accumulated balance, and uses a dash before the initial date', () => {
    expect(html).toContain('class="amount negative"');
    expect(html).toContain('bar-negative');
    expect(html).toContain('<span class="muted">—</span>');
  });

  it('ends with the year total, without a total for the accumulated balance', () => {
    expect(html).toContain('Total 2026');
    expect(html).toMatch(/<tfoot>[\s\S]*1\.900,70\s€[\s\S]*<td><\/td>/);
  });
});

describe('SettingsForm and its validation', () => {
  it('explains how the accumulated savings are built', () => {
    const html = renderToStaticMarkup(
      <SettingsForm
        values={{ balance: '', date: '' }}
        errors={{ balance: 'Introduce un importe.' }}
        formError={undefined}
        saved
        busy={false}
        onChange={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('Saldo inicial de ahorro');
    expect(html).toContain('parte de este saldo');
    expect(html).toContain('aria-describedby="settings-balance-error"');
    expect(html).toContain('Guardado.');
  });

  it('builds the payload, accepting a zero balance, and reports each invalid field', () => {
    expect(validateSettingsForm({ balance: '2.500,00', date: '2026-01-15' })).toEqual({
      ok: true,
      payload: { initialSavingsCents: 250_000, initialSavingsDate: '2026-01-15' },
    });
    expect(validateSettingsForm({ balance: '0', date: '2026-01-15' }).ok).toBe(true);
    const bad = validateSettingsForm({ balance: 'x', date: '' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(Object.keys(bad.errors).sort()).toEqual(['balance', 'date']);
    }
  });

  it('starts empty without settings and round-trips saved ones', () => {
    expect(formFromSettings({ initialSavingsCents: 0, initialSavingsDate: null })).toEqual({
      balance: '',
      date: '',
    });
    const form = formFromSettings({
      initialSavingsCents: 250_050,
      initialSavingsDate: '2026-01-15',
    });
    expect(form).toEqual({ balance: '2500,50', date: '2026-01-15' });
    expect(validateSettingsForm(form).ok).toBe(true);
    expect(
      mapSettingsApiErrors({ initialSavingsCents: 'a', initialSavingsDate: 'b', z: 'c' }),
    ).toEqual({
      balance: 'a',
      date: 'b',
    });
  });
});

const goal = (over: Partial<GoalDto> = {}): GoalDto => ({
  id: 1,
  name: 'Fondo de emergencia',
  targetAmountCents: 600_000,
  targetDate: '2026-12-31',
  accumulatedCents: 300_000,
  progressPercent: 50,
  remainingCents: 300_000,
  status: 'open',
  monthsLeft: 3,
  monthlyRequiredCents: 100_000,
  ...over,
});

describe('GoalList', () => {
  const render = (g: GoalDto) => renderToStaticMarkup(<GoalList goals={[g]} onEdit={noop} />);

  it('shows progress, what is left, the date and the monthly saving needed', () => {
    const html = render(goal());
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain('style="width:50%"');
    expect(html).toMatch(/3\.000,00\s€ de(\s|&nbsp;)*6\.000,00\s€/);
    expect(html).toContain('50 %');
    expect(html).toMatch(/Falta<\/dt><dd>3\.000,00\s€/);
    expect(html).toContain('31/12/2026');
    expect(html).toMatch(/1\.000,00\s€<span class="notes">en 3 meses/);
  });

  it('uses the singular for one month', () => {
    expect(render(goal({ monthsLeft: 1 }))).toContain('en 1 mes<');
  });

  it('says when a goal is reached or overdue, with no monthly figure', () => {
    const reached = render(
      goal({
        status: 'reached',
        progressPercent: 100,
        remainingCents: 0,
        monthsLeft: null,
        monthlyRequiredCents: null,
      }),
    );
    expect(reached).toContain('Objetivo conseguido.');
    expect(reached).toContain('<dd class="debt-estimate">—</dd>');
    const overdue = render(
      goal({ status: 'overdue', monthsLeft: null, monthlyRequiredCents: null }),
    );
    expect(overdue).toContain('La fecha ya ha pasado');
    expect(overdue).toContain('bar-negative');
  });

  it('never shows negative savings as a negative amount, and explains an empty list', () => {
    expect(render(goal({ accumulatedCents: -5_000, progressPercent: 0 }))).toMatch(/0,00\s€ de/);
    expect(renderToStaticMarkup(<GoalList goals={[]} onEdit={noop} />)).toContain(
      'Todavía no hay objetivos',
    );
  });
});

describe('GoalForm and its validation', () => {
  it('adds or edits', () => {
    const render = (editing: boolean) =>
      renderToStaticMarkup(
        <GoalForm
          values={emptyGoalForm()}
          errors={{ name: 'Escribe un nombre.' }}
          formError={undefined}
          editing={editing}
          busy={false}
          onChange={noop}
          onSubmit={noop}
          onCancel={noop}
        />,
      );
    expect(render(false)).toContain('Añadir objetivo');
    expect(render(false)).toContain('aria-describedby="goal-name-error"');
    expect(render(true)).toContain('Editar objetivo');
    expect(render(true)).toContain('Cancelar');
  });

  it('builds the payload in cents; the target must be above zero', () => {
    expect(
      validateGoalForm({ name: ' Viaje ', target: '1.500', targetDate: '2027-06-30' }),
    ).toEqual({
      ok: true,
      payload: { name: 'Viaje', targetAmountCents: 150_000, targetDate: '2027-06-30' },
    });
    const bad = validateGoalForm({ name: '', target: '0', targetDate: '2027-02-30' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(Object.keys(bad.errors).sort()).toEqual(['name', 'target', 'targetDate']);
    }
  });

  it('round-trips a goal and maps API field names', () => {
    expect(validateGoalForm(formFromGoal(goal())).ok).toBe(true);
    expect(mapGoalApiErrors({ targetAmountCents: 'a', name: 'b', other: 'c' })).toEqual({
      target: 'a',
      name: 'b',
    });
  });
});

describe('navigation and api client', () => {
  it('has Resumen and Objetivos', () => {
    const html = renderToStaticMarkup(<Navigation view="summary" onChange={noop} />);
    expect(html).toContain('Resumen');
    expect(html).toContain('Objetivos');
  });

  it('uses the right URLs and methods', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
    );
    const api = createApiClient(fetchFn);
    await api.settings();
    await api.saveSettings({ initialSavingsCents: 1, initialSavingsDate: '2026-01-01' });
    await api.yearSummary(2026);
    await api.goals();
    await api.createGoal({ name: 'X', targetAmountCents: 1, targetDate: '2026-01-01' });
    await api.updateGoal(3, { name: 'Y' });
    const calls = fetchFn.mock.calls.map((c) => [c[0], c[1]?.method]);
    expect(calls).toEqual([
      ['/api/settings', undefined],
      ['/api/settings', 'PUT'],
      ['/api/years/2026/summary', undefined],
      ['/api/goals', undefined],
      ['/api/goals', 'POST'],
      ['/api/goals/3', 'PATCH'],
    ]);
  });
});
