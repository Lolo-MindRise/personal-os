import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DATA_MESSAGES,
  MAX_IMPORT_BYTES,
  ROW_SCHEMAS,
  TABLE_INSERT_ORDER,
  dataFileSchema,
  referenceProblems,
  type DataFile,
} from '../shared/dataFile.js';
import { tagKey } from '../shared/schemas.js';
import { buildApp } from './app.js';
import { exportData } from './dataExportApi.js';
import { hasData, importData, safeErrorSummary } from './dataImportApi.js';
import { SCHEMA_TABLES, tableOf } from './dataTables.js';
import { openDatabase, type DbHandle } from './db/index.js';
import { resetDevDatabase } from './db/reset.js';
import {
  appSettings,
  categories,
  categoryRules,
  importSettings,
  movements,
  recurringItems,
  recurringSkips,
  transfers,
} from './db/schema.js';

// Plan 0002, task 06: full data export and import. Invented data, temporary directories only.

let dir: string;
const handles: DbHandle[] = [];
const apps: FastifyInstance[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'personal-os-data-'));
});
afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.close();
  }
  for (const handle of handles.splice(0)) {
    handle.close();
  }
  rmSync(dir, { recursive: true, force: true });
});

const open = (name: string): DbHandle => {
  const handle = openDatabase(join(dir, name));
  handles.push(handle);
  return handle;
};

const appOf = (handle: DbHandle): FastifyInstance => {
  const app = buildApp({ db: handle.db });
  apps.push(app);
  return app;
};

/** The development seed plus one row in every table the seed leaves empty. */
function populatedSource(): DbHandle {
  const path = join(dir, 'source.db');
  resetDevDatabase({}, path);
  const handle = openDatabase(path);
  handles.push(handle);
  const { db } = handle;
  db.insert(transfers)
    .values({ date: '2026-01-15', amountCents: 2_000, fromAccountId: 1, toAccountId: 2 })
    .run();
  db.insert(appSettings)
    .values({ id: 1, initialSavingsCents: 12_300, initialSavingsDate: '2026-01-01' })
    .run();
  db.insert(importSettings).values({ id: 1, mapping: '{"date":0}' }).run();
  const category = db.select().from(categories).all()[0];
  db.insert(categoryRules)
    .values({ pattern: 'mercado', categoryId: category?.id ?? 1 })
    .run();
  const item = db.select().from(recurringItems).all().at(-1);
  db.insert(recurringSkips)
    .values({ recurringItemId: item?.id ?? 1, month: '2026-02' })
    .run();
  return handle;
}

/** Tags through the API, then a deleted movement so the id counters run ahead of the rows. */
async function tagSomeMovements(handle: DbHandle): Promise<void> {
  const app = appOf(handle);
  const [a, b] = handle.db.select().from(movements).all();
  for (const [m, tags] of [
    [a, ['Vacaciones', 'ÁRBOL']],
    [b, ['vacaciones']],
  ] as const) {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/movements/${String(m?.id)}`,
      payload: { tags },
    });
    expect(response.statusCode).toBe(200);
  }
  const extra = await app.inject({
    method: 'POST',
    url: '/api/movements',
    payload: {
      date: '2026-02-01',
      kind: a?.kind,
      categoryId: a?.categoryId,
      concept: 'Temporal',
      amountCents: 100,
      tags: ['solo-aqui'],
    },
  });
  const created = extra.json<{ id: number }>();
  await app.inject({ method: 'DELETE', url: `/api/movements/${String(created.id)}` });
}

/** Every table row by row in primary key order, plus the id counters. */
function dumpAll(handle: DbHandle): Record<string, unknown[]> {
  const { sqlite } = handle;
  const names = (
    sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' AND name <> 'sqlite_sequence' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((r) => r.name);
  const out: Record<string, unknown[]> = {};
  for (const name of names) {
    const pk = (
      sqlite
        .prepare(`SELECT name FROM pragma_table_info('${name}') WHERE pk > 0 ORDER BY pk`)
        .all() as {
        name: string;
      }[]
    )
      .map((c) => `"${c.name}"`)
      .join(', ');
    out[name] = sqlite.prepare(`SELECT * FROM "${name}" ORDER BY ${pk}`).all();
  }
  out.sqlite_sequence = sqlite.prepare('SELECT name, seq FROM sqlite_sequence ORDER BY name').all();
  return out;
}

const clone = (file: DataFile): DataFile => structuredClone(file);

describe('the table list comes from the schema', () => {
  it('covers every table of the schema, in the file schema and the insert order', () => {
    const schemaNames = SCHEMA_TABLES.map((t) => getTableName(t)).sort();
    expect(Object.keys(ROW_SCHEMAS).sort()).toEqual(schemaNames);
    expect([...TABLE_INSERT_ORDER].sort()).toEqual(schemaNames);
    const target = open('tables.db');
    const created = (
      target.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' AND name <> 'sqlite_sequence'",
        )
        .all() as { name: string }[]
    )
      .map((r) => r.name)
      .sort();
    expect(created).toEqual(schemaNames);
    expect(schemaNames).toContain('tags');
    expect(schemaNames).toContain('movement_tags');
    expect(schemaNames).toContain('accounts');
  });

  it('covers every column of every table', () => {
    for (const table of SCHEMA_TABLES) {
      const name = getTableName(table) as keyof typeof ROW_SCHEMAS;
      expect(Object.keys(ROW_SCHEMAS[name].shape).sort(), name).toEqual(
        Object.keys(getTableColumns(table)).sort(),
      );
    }
  });

  it('writes a table after every table it has a foreign key to, and accounts before movements', () => {
    const position = new Map(TABLE_INSERT_ORDER.map((name, i) => [name as string, i]));
    for (const table of SCHEMA_TABLES) {
      for (const fk of getTableConfig(table).foreignKeys) {
        const target = getTableName(fk.reference().foreignTable);
        expect(position.get(target), `${getTableName(table)} -> ${target}`).toBeLessThan(
          position.get(getTableName(table)) ?? -1,
        );
      }
    }
    expect(position.get('accounts')).toBeLessThan(position.get('movements') ?? -1);
    expect(position.get('tags')).toBeLessThan(position.get('movement_tags') ?? -1);
    expect(position.get('movements')).toBeLessThan(position.get('movement_tags') ?? -1);
    expect(tableOf('transfers')).toBeDefined();
  });
});

describe('export', () => {
  it('has the format version, the date, every table and the id counters', async () => {
    const source = populatedSource();
    await tagSomeMovements(source);
    const file = exportData(source.db, new Date('2026-03-01T10:00:00.000Z'));
    expect(file.app).toBe('personal-os');
    expect(file.formatVersion).toBe(1);
    expect(file.exportedAt).toBe('2026-03-01T10:00:00.000Z');
    expect(Object.keys(file.tables).sort()).toEqual(Object.keys(ROW_SCHEMAS).sort());
    expect(file.tables.tags.map((t) => t.nameKey)).toEqual(
      file.tables.tags.map((t) => tagKey(t.name)),
    );
    expect(file.tables.movement_tags.length).toBe(3);
    expect(file.tables.transfers).toHaveLength(1);
    // The deleted movement leaves the counter ahead of the highest id.
    const maxMovement = Math.max(...file.tables.movements.map((m) => m.id));
    expect(file.sequences.movements).toBeGreaterThan(maxMovement);
    expect(dataFileSchema.safeParse(JSON.parse(JSON.stringify(file))).success).toBe(true);
    expect(referenceProblems(file)).toEqual([]);
  });

  it('is served by GET /api/data/export', async () => {
    const source = populatedSource();
    const response = await appOf(source).inject({ method: 'GET', url: '/api/data/export' });
    expect(response.statusCode).toBe(200);
    expect(dataFileSchema.safeParse(response.json()).success).toBe(true);
  });
});

describe('round trip', () => {
  it('imports into a fresh database and leaves every table identical, ids and counters included', async () => {
    const source = populatedSource();
    await tagSomeMovements(source);
    const file = JSON.parse(JSON.stringify(exportData(source.db))) as unknown;

    const target = open('target.db');
    expect(hasData(target.db)).toBe(false);
    const response = await appOf(target).inject({
      method: 'POST',
      url: '/api/data/import',
      payload: file as object,
    });
    expect(response.statusCode).toBe(200);
    expect(
      response.json<{ imported: Record<string, number> }>().imported.movements,
    ).toBeGreaterThan(0);

    const before = dumpAll(source);
    const after = dumpAll(target);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    for (const name of Object.keys(before)) {
      expect(after[name], name).toEqual(before[name]);
    }
    // Every table of the schema had rows in the fixture, so the comparison is not vacuous.
    for (const table of SCHEMA_TABLES) {
      expect(before[getTableName(table)]?.length, getTableName(table)).toBeGreaterThan(0);
    }
    // The counters survive: the next movement does not reuse the deleted id.
    const next = await appOf(target).inject({
      method: 'POST',
      url: '/api/movements',
      payload: {
        date: '2026-02-02',
        kind: 'expense',
        categoryId: (before.categories as { id: number; kind: string }[]).find(
          (c) => c.kind === 'expense',
        )?.id,
        concept: 'Nuevo',
        amountCents: 100,
      },
    });
    const sourceNext = (before.sqlite_sequence as { name: string; seq: number }[]).find(
      (s) => s.name === 'movements',
    );
    expect(next.json<{ id: number }>().id).toBe((sourceNext?.seq ?? 0) + 1);
  });

  it('imports a file with an account other than Principal on a movement', () => {
    const source = populatedSource();
    const file = exportData(source.db);
    expect(file.tables.movements.some((m) => m.accountId !== 1)).toBe(true);
    const target = open('target.db');
    importData(target.db, file);
    expect(dumpAll(target).movements).toEqual(dumpAll(source).movements);
  });
});

describe('refusals', () => {
  const post = (handle: DbHandle, payload: unknown) =>
    appOf(handle).inject({ method: 'POST', url: '/api/data/import', payload: payload as object });

  it('refuses a database that has data and writes nothing', async () => {
    const source = populatedSource();
    const file = exportData(source.db);
    const target = open('target.db');
    target.db.insert(categories).values({ name: 'Ya existía', kind: 'expense' }).run();
    const before = dumpAll(target);
    const response = await post(target, file);
    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: string }>().error).toBe(DATA_MESSAGES.notEmpty);
    expect(dumpAll(target)).toEqual(before);
  });

  it('refuses a database with movements, fixed items or another account, and ignores Principal', async () => {
    const source = populatedSource();
    const file = exportData(source.db);
    const withAccount = open('with-account.db');
    withAccount.sqlite.exec(
      "INSERT INTO accounts (name, type, opening_balance_cents, opening_balance_date) VALUES ('Otra', 'cash', 0, '2026-01-01')",
    );
    expect((await post(withAccount, file)).statusCode).toBe(409);

    const fresh = open('fresh.db');
    expect(hasData(fresh.db)).toBe(false);
    fresh.db.insert(categories).values({ name: 'X', kind: 'expense' }).run();
    fresh.db
      .insert(recurringItems)
      .values({
        kind: 'expense',
        categoryId: 1,
        concept: 'Fijo',
        amountCents: 100,
        expectedDay: 1,
        startMonth: '2026-01',
      })
      .run();
    expect(hasData(fresh.db)).toBe(true);
  });

  it('accepts an untouched Principal and refuses an edited one, writing nothing', async () => {
    const source = populatedSource();
    const file = exportData(source.db);
    const edits = [
      "UPDATE accounts SET name = 'Mi cuenta' WHERE id = 1",
      'UPDATE accounts SET opening_balance_cents = 500 WHERE id = 1',
      "UPDATE accounts SET type = 'cash' WHERE id = 1",
      "UPDATE accounts SET opening_balance_date = '2026-01-01' WHERE id = 1",
    ];
    for (const edit of edits) {
      const target = open(`edited-${String(edits.indexOf(edit))}.db`);
      target.sqlite.exec(edit);
      const before = dumpAll(target);
      const response = await post(target, file);
      expect(response.statusCode, edit).toBe(409);
      expect(response.json<{ error: string }>().error).toBe(DATA_MESSAGES.principalEdited);
      expect(dumpAll(target), edit).toEqual(before);
    }
    expect((await post(open('untouched.db'), file)).statusCode).toBe(200);
  });

  it('rejects inherited names in sequences as invalid file content, writing nothing', async () => {
    const source = populatedSource();
    const target = open('target.db');
    const before = dumpAll(target);
    for (const name of ['constructor', '__proto__', 'toString']) {
      const file = JSON.parse(JSON.stringify(exportData(source.db))) as DataFile;
      Object.defineProperty(file.sequences, name, { value: 5, enumerable: true });
      const response = await post(target, JSON.parse(JSON.stringify(file)));
      expect(response.statusCode, name).toBe(400);
      // Fastify's secure JSON parser already refuses "__proto__" keys as a malformed body.
      expect(response.json<{ error: string }>().error, name).toContain(
        name === '__proto__' ? DATA_MESSAGES.notJson : DATA_MESSAGES.invalid,
      );
      expect(dumpAll(target), name).toEqual(before);
    }
  });

  it('does not put the query, parameters or row contents in the failure log', () => {
    const source = populatedSource();
    const file = clone(exportData(source.db));
    const first = file.tables.movements.find((m) => m.recurringItemId !== null);
    if (first === undefined) {
      throw new Error('fixture has no confirmed fixed item');
    }
    file.tables.movements.push({ ...first, id: 9_999 });
    let caught: unknown;
    try {
      importData(open('target.db').db, file);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();
    const summary = safeErrorSummary(caught);
    expect(summary).not.toContain(first.concept);
    expect(summary).not.toMatch(/insert into|values|params/i);
    expect(summary.length).toBeLessThan(200);
  });

  it('refuses an invalid file and leaves the database untouched', async () => {
    const source = populatedSource();
    await tagSomeMovements(source);
    const good = exportData(source.db);
    const target = open('target.db');
    const before = dumpAll(target);

    const cases: [string, (f: DataFile) => void][] = [
      ['wrong version', (f) => ((f as { formatVersion: number }).formatVersion = 2)],
      ['missing table', (f) => delete (f.tables as Partial<DataFile['tables']>).tags],
      ['unknown column', (f) => Object.assign(f.tables.goals[0] ?? {}, { extra: 1 })],
      ['float money', (f) => ((f.tables.movements[0] ?? ({} as never)).amountCents = 10.5)],
      [
        'movement to a missing account',
        (f) => ((f.tables.movements[0] ?? ({} as never)).accountId = 99),
      ],
      [
        'movement to a missing category',
        (f) => ((f.tables.movements[0] ?? ({} as never)).categoryId = 999),
      ],
      [
        'movement_tags to a missing movement',
        (f) => ((f.tables.movement_tags[0] ?? ({} as never)).movementId = 999),
      ],
      [
        'movement_tags to a missing tag',
        (f) => ((f.tables.movement_tags[0] ?? ({} as never)).tagId = 999),
      ],
      ['wrong tag key', (f) => ((f.tables.tags[0] ?? ({} as never)).nameKey = 'otra')],
      [
        'duplicate tag keys',
        (f) => {
          const [a, b] = f.tables.tags;
          if (a !== undefined && b !== undefined) {
            b.name = a.name.toUpperCase();
            b.nameKey = a.nameKey;
          }
        },
      ],
      [
        'transfer to a missing account',
        (f) => ((f.tables.transfers[0] ?? ({} as never)).toAccountId = 77),
      ],
      ['no Principal', (f) => (f.tables.accounts = f.tables.accounts.filter((a) => a.id !== 1))],
      ['counter below max id', (f) => (f.sequences.movements = 1)],
      ['duplicate ids', (f) => f.tables.goals.push(clone(good).tables.goals[0] as never)],
    ];
    for (const [label, mutate] of cases) {
      const file = clone(good);
      mutate(file);
      const response = await post(target, file);
      expect(response.statusCode, label).toBe(400);
      expect(response.json<{ error: string }>().error, label).toContain(DATA_MESSAGES.invalid);
      expect(dumpAll(target), label).toEqual(before);
    }
  });

  it('rolls everything back when the database rejects a row the checks did not foresee', () => {
    const source = populatedSource();
    const file = clone(exportData(source.db));
    // Valid for the shape, but referenceProblems reports it (two movements confirming the same
    // item in a month); the database's composite unique index rejects it too. Force it through
    // importData directly to prove the rollback.
    const withItem = file.tables.movements.filter((m) => m.recurringItemId !== null);
    const first = withItem[0];
    if (first === undefined) {
      throw new Error('fixture has no confirmed fixed item');
    }
    file.tables.movements.push({ ...first, id: 9_999 });
    const target = open('target.db');
    const before = dumpAll(target);
    expect(referenceProblems(file).length).toBeGreaterThan(0);
    expect(() => importData(target.db, file)).toThrow();
    expect(dumpAll(target)).toEqual(before);
  });

  it('answers malformed JSON in Spanish and bounds the body size', async () => {
    const target = open('target.db');
    const app = appOf(target);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/data/import',
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json<{ error: string }>().error).toBe(DATA_MESSAGES.notJson);

    const big = await app.inject({
      method: 'POST',
      url: '/api/data/import',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ filler: 'x'.repeat(MAX_IMPORT_BYTES) }),
    });
    expect(big.statusCode).toBe(413);
    expect(big.json<{ error: string }>().error).toBe(DATA_MESSAGES.tooBig);
  });
});
