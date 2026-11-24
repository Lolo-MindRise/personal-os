import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MilestoneDto } from '../shared/api.js';
import { Navigation } from './App.js';
import { createApiClient } from './api.js';
import {
  emptyMilestoneForm,
  formFromMilestone,
  mapMilestoneApiErrors,
  validateMilestoneForm,
} from './milestoneForm.js';
import { MilestoneForm, MilestoneList } from './MilestonesPage.js';

const noop = () => undefined;
const today = '2026-11-25';

const milestone = (over: Partial<MilestoneDto> = {}): MilestoneDto => ({
  id: 1,
  title: 'Abrir cuenta',
  targetDate: '2027-01-15',
  status: 'pending',
  notes: null,
  ...over,
});

describe('MilestoneList', () => {
  const render = (milestones: MilestoneDto[]) =>
    renderToStaticMarkup(<MilestoneList milestones={milestones} today={today} onEdit={noop} />);

  it('shows date, title, notes and the status in Spanish, in the order given', () => {
    const html = render([
      milestone({ id: 1, title: 'Primero', targetDate: '2026-12-01', notes: 'Con notas' }),
      milestone({ id: 2, title: 'Segundo', targetDate: '2027-03-09', status: 'in_progress' }),
      milestone({ id: 3, title: 'Tercero', targetDate: '2027-04-01', status: 'done' }),
    ]);
    expect(html).toContain('01/12/2026');
    expect(html).toContain('Con notas');
    expect(html).toContain('Pendiente');
    expect(html).toContain('En curso');
    expect(html).toContain('Hecho');
    expect(html.indexOf('Primero')).toBeLessThan(html.indexOf('Segundo'));
    expect(html.indexOf('Segundo')).toBeLessThan(html.indexOf('Tercero'));
  });

  it('highlights a milestone that is past its date and not done, with a text flag too', () => {
    const html = render([milestone({ targetDate: '2026-11-01' })]);
    expect(html).toContain('overdue-row');
    expect(html).toContain('Vencido');
    const inProgress = render([milestone({ targetDate: '2026-11-01', status: 'in_progress' })]);
    expect(inProgress).toContain('overdue-row');
  });

  it('does not highlight done milestones, today, or future ones', () => {
    for (const m of [
      milestone({ targetDate: '2020-01-01', status: 'done' }),
      milestone({ targetDate: today }),
      milestone({ targetDate: '2027-01-01' }),
    ]) {
      const html = render([m]);
      expect(html).not.toContain('overdue-row');
      expect(html).not.toContain('Vencido');
    }
  });

  it('highlights only the overdue rows of a mixed list', () => {
    const html = render([
      milestone({ id: 1, targetDate: '2026-01-01' }),
      milestone({ id: 2, targetDate: '2026-01-02', status: 'done' }),
      milestone({ id: 3, targetDate: '2027-01-01' }),
    ]);
    expect(html.match(/overdue-row/g)).toHaveLength(1);
  });

  it('explains an empty list', () => {
    expect(render([])).toContain('Todavía no hay hitos');
  });
});

describe('MilestoneForm', () => {
  const render = (editing: boolean) =>
    renderToStaticMarkup(
      <MilestoneForm
        values={emptyMilestoneForm()}
        errors={{ title: 'Escribe un título.' }}
        formError="Algo falló"
        editing={editing}
        busy={false}
        onChange={noop}
        onSubmit={noop}
        onCancel={noop}
      />,
    );

  it('adds or edits, offering the three statuses in Spanish', () => {
    const html = render(false);
    expect(html).toContain('Añadir hito');
    for (const label of ['Pendiente', 'En curso', 'Hecho']) {
      expect(html).toContain(`>${label}</option>`);
    }
    expect(html).toContain('aria-describedby="milestone-title-error"');
    expect(html).toContain('Algo falló');
    expect(render(true)).toContain('Editar hito');
    expect(render(true)).toContain('Cancelar');
  });
});

describe('validateMilestoneForm', () => {
  it('builds the payload, status pending by default, empty notes as null', () => {
    expect(
      validateMilestoneForm({
        ...emptyMilestoneForm(),
        title: ' Abrir ',
        targetDate: '2027-01-15',
      }),
    ).toEqual({
      ok: true,
      payload: { title: 'Abrir', targetDate: '2027-01-15', status: 'pending', notes: null },
    });
  });

  it('reports a blank title and a missing or impossible date', () => {
    const result = validateMilestoneForm({ ...emptyMilestoneForm(), targetDate: '2027-02-30' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(['targetDate', 'title']);
      expect(result.errors.title).toBe('Escribe un título.');
    }
  });

  it('round-trips a milestone and maps API field names', () => {
    const m = milestone({ notes: 'Algo', status: 'in_progress' });
    const result = validateMilestoneForm(formFromMilestone(m));
    expect(result.ok && result.payload).toEqual({
      title: m.title,
      targetDate: m.targetDate,
      status: 'in_progress',
      notes: 'Algo',
    });
    expect(mapMilestoneApiErrors({ title: 'a', status: 'b', _: 'c' })).toEqual({
      title: 'a',
      status: 'b',
    });
  });
});

describe('navigation and api client', () => {
  it('has a Hitos section', () => {
    expect(renderToStaticMarkup(<Navigation view="milestones" />)).toContain('Hitos');
  });

  it('uses the right URLs and methods', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
    );
    const api = createApiClient(fetchFn);
    await api.milestones();
    await api.createMilestone({
      title: 'X',
      targetDate: '2027-01-01',
      status: 'pending',
      notes: null,
    });
    await api.updateMilestone(5, { status: 'done' });
    expect(fetchFn.mock.calls.map((c) => [c[0], c[1]?.method])).toEqual([
      ['/api/milestones', undefined],
      ['/api/milestones', 'POST'],
      ['/api/milestones/5', 'PATCH'],
    ]);
    expect(fetchFn.mock.calls[2]?.[1]?.body).toBe(JSON.stringify({ status: 'done' }));
  });
});
