import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dueEntries } from './recurring.js';
import { openDatabase, type DbHandle } from './index.js';
import { categories, movements, recurringItems, recurringSkips } from './schema.js';
import { seed } from './seed.js';

// Database-level rules of recurring items (ADR-0005). The API tests cover behaviour;
// these check that the database itself rejects what must never be stored.

let handle: DbHandle;
beforeEach(() => {
  handle = openDatabase(':memory:');
});
afterEach(() => {
  handle.close();
});

const category = (name: string, kind: 'income' | 'expense' | 'repayment') =>
  handle.db.insert(categories).values({ name, kind }).returning().get();

function item(over: Partial<typeof recurringItems.$inferInsert> = {}) {
  const expense =
    handle.db.select().from(categories).where(eq(categories.name, 'Casa')).get() ??
    category('Casa', 'expense');
  return handle.db
    .insert(recurringItems)
    .values({
      kind: 'expense',
      categoryId: expense.id,
      concept: 'Alquiler',
      amountCents: 70_000,
      expectedDay: 2,
      startMonth: '2026-01',
      ...over,
    })
    .returning()
    .get();
}

function movement(recurringItemId: number | null, date: string) {
  const casa = handle.db.select().from(categories).where(eq(categories.name, 'Casa')).get();
  if (casa === undefined) {
    throw new Error('create an item first');
  }
  return handle.db
    .insert(movements)
    .values({
      date,
      kind: 'expense',
      categoryId: casa.id,
      concept: 'Pago',
      amountCents: 100,
      recurringItemId,
    })
    .returning()
    .get();
}

describe('recurring_items', () => {
  it('stamps id, created_at and updated_at', () => {
    const row = item();
    expect(row.id).toBe(1);
    expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(row.updatedAt).toBe(row.createdAt);
  });

  it("rejects an item whose kind differs from its category's kind", () => {
    const income = category('Sueldo', 'income');
    expect(() => item({ kind: 'expense', categoryId: income.id })).toThrow(/FOREIGN KEY/);
  });

  it.each([0, 32, -1])('rejects expected day %i, accepts 1 and 31', (day) => {
    expect(() => item({ expectedDay: day })).toThrow(/CHECK/);
    expect(item({ expectedDay: 1 }).expectedDay).toBe(1);
    expect(item({ expectedDay: 31 }).expectedDay).toBe(31);
  });

  it('rejects a non-positive or fractional amount', () => {
    expect(() => item({ amountCents: 0 })).toThrow(/CHECK/);
    expect(() => item({ amountCents: -1 })).toThrow(/CHECK/);
    expect(() => item({ amountCents: 12.5 })).toThrow(/CHECK/);
  });

  it('rejects malformed months and an end month before the start month', () => {
    expect(() => item({ startMonth: '2026-1' })).toThrow(/CHECK/);
    expect(() => item({ endMonth: '2026-1' })).toThrow(/CHECK/);
    expect(() => item({ startMonth: '2026-05', endMonth: '2026-04' })).toThrow(/CHECK/);
    expect(item({ startMonth: '2026-05', endMonth: '2026-05' }).endMonth).toBe('2026-05');
    expect(item({ startMonth: '2026-05', endMonth: null }).endMonth).toBeNull();
  });

  it('rejects a blank concept', () => {
    expect(() => item({ concept: '  ' })).toThrow(/CHECK/);
  });
});

describe('confirmed movements', () => {
  it('rejects a second confirmed movement for the same item in the same month', () => {
    const rent = item();
    movement(rent.id, '2026-03-02');
    expect(() => movement(rent.id, '2026-03-28')).toThrow(/UNIQUE/);
  });

  it('allows the same item in different months, and different items in the same month', () => {
    const rent = item();
    const other = item({ concept: 'Internet' });
    movement(rent.id, '2026-03-02');
    movement(rent.id, '2026-04-02');
    movement(other.id, '2026-03-02');
    expect(handle.db.select().from(movements).all()).toHaveLength(3);
  });

  it('does not limit movements without a recurring item', () => {
    item();
    movement(null, '2026-03-02');
    movement(null, '2026-03-02');
    movement(null, '2026-03-03');
    expect(handle.db.select().from(movements).all()).toHaveLength(3);
  });

  it('rejects moving a confirmed movement into a month already confirmed', () => {
    const rent = item();
    movement(rent.id, '2026-03-02');
    const april = movement(rent.id, '2026-04-02');
    expect(() =>
      handle.db
        .update(movements)
        .set({ date: '2026-03-10' })
        .where(eq(movements.id, april.id))
        .run(),
    ).toThrow(/UNIQUE/);
  });

  it('rejects a link to an item that does not exist', () => {
    item();
    expect(() => movement(999, '2026-03-02')).toThrow(/FOREIGN KEY/);
  });

  it('keeps its movements, unlinked, when the item is deleted', () => {
    const rent = item();
    const confirmed = movement(rent.id, '2026-03-02');
    handle.db.delete(recurringItems).where(eq(recurringItems.id, rent.id)).run();

    const kept = handle.db.select().from(movements).where(eq(movements.id, confirmed.id)).get();
    expect(kept).toMatchObject({ concept: 'Pago', amountCents: 100, recurringItemId: null });
  });
});

describe('recurring_skips', () => {
  it('allows one skip per item and month', () => {
    const rent = item();
    handle.db.insert(recurringSkips).values({ recurringItemId: rent.id, month: '2026-03' }).run();
    handle.db.insert(recurringSkips).values({ recurringItemId: rent.id, month: '2026-04' }).run();
    expect(() =>
      handle.db.insert(recurringSkips).values({ recurringItemId: rent.id, month: '2026-03' }).run(),
    ).toThrow(/UNIQUE/);
  });

  it('rejects a malformed month and an unknown item', () => {
    const rent = item();
    expect(() =>
      handle.db.insert(recurringSkips).values({ recurringItemId: rent.id, month: '2026-3' }).run(),
    ).toThrow(/CHECK/);
    expect(() =>
      handle.db.insert(recurringSkips).values({ recurringItemId: 999, month: '2026-03' }).run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it('are removed with their item', () => {
    const rent = item();
    handle.db.insert(recurringSkips).values({ recurringItemId: rent.id, month: '2026-03' }).run();
    handle.db.delete(recurringItems).where(eq(recurringItems.id, rent.id)).run();
    expect(handle.db.select().from(recurringSkips).all()).toEqual([]);
  });
});

describe('dueEntries', () => {
  it('computes pending and skipped entries from items, confirmations and skips', () => {
    const rent = item();
    const web = item({ concept: 'Internet', expectedDay: 10 });
    const gym = item({ concept: 'Gimnasio', expectedDay: 15 });
    movement(rent.id, '2026-03-02');
    handle.db.insert(recurringSkips).values({ recurringItemId: gym.id, month: '2026-03' }).run();

    const march = dueEntries(handle.db, '2026-03');
    expect(march.pending.map((e) => e.recurringItemId)).toEqual([web.id]);
    expect(march.skipped.map((e) => e.recurringItemId)).toEqual([gym.id]);

    // Nothing is stored for April: the same items are simply due again.
    const april = dueEntries(handle.db, '2026-04');
    expect(april.pending.map((e) => e.recurringItemId)).toEqual([rent.id, web.id, gym.id]);
    expect(april.skipped).toEqual([]);
  });
});

describe('seed', () => {
  it('adds fictional fixed items: one income, several expenses, two confirmed in January', () => {
    seed(handle.db);
    const items = handle.db.select().from(recurringItems).all();
    expect(items.filter((i) => i.kind === 'income')).toHaveLength(1);
    expect(items.filter((i) => i.kind === 'expense').length).toBeGreaterThanOrEqual(3);
    const confirmed = handle.db
      .select()
      .from(movements)
      .all()
      .filter((m) => m.recurringItemId !== null);
    expect(confirmed.map((m) => m.concept).sort()).toEqual(['Alquiler', 'Nómina']);
    expect(dueEntries(handle.db, '2026-01').pending).toHaveLength(3);
  });
});
