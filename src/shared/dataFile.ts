import { z } from 'zod';
import { ACCOUNT_TYPES, DEFAULT_ACCOUNT_ID, KINDS, MILESTONE_STATUSES } from './constants.js';
import { tagKey } from './schemas.js';

// The full-data file (plan 0002, task 06): one JSON document with every table, to move the data to
// a new installation. Tables are keyed by their SQL name; a row's keys are the property names of
// the Drizzle schema (camelCase), so the exporter and the importer need no column mapping. A
// test ties this file to the schema: a table or column forgotten here fails it.

export const DATA_FILE_APP = 'personal-os';
export const DATA_FILE_VERSION = 1;

/** Largest import file accepted: 25 MiB (a JSON export of many years of data is a few MiB). */
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

const id = z.number().int().positive();
const int = z.number().int();
const nullableId = id.nullable();
const timestamp = z.string().min(1);
const date = z.string().regex(/^\d{4}-[01]\d-[0-3]\d$/);
const month = z.string().regex(/^\d{4}-[01]\d$/);
const text = z.string().refine((s) => s.trim().length > 0);
const notes = z.string().nullable();
const kind = z.enum(KINDS);

const categories = z.strictObject({
  id,
  name: text,
  kind,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const accounts = z.strictObject({
  id,
  name: text,
  type: z.enum(ACCOUNT_TYPES),
  openingBalanceCents: int,
  openingBalanceDate: date,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const transfers = z.strictObject({
  id,
  date,
  amountCents: id,
  fromAccountId: id,
  toAccountId: id,
  notes,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const debts = z.strictObject({
  id,
  name: text,
  monthlyPaymentCents: id,
  balanceCents: int.nonnegative(),
  balanceAsOf: date,
  remainingInstallments: int.nonnegative(),
  annualRateBps: int.nonnegative(),
  notes,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const recurringItems = z.strictObject({
  id,
  kind,
  categoryId: id,
  concept: text,
  amountCents: id,
  expectedDay: int.min(1).max(31),
  startMonth: month,
  endMonth: month.nullable(),
  notes,
  debtId: nullableId,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const recurringSkips = z.strictObject({
  id,
  recurringItemId: id,
  month,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const movements = z.strictObject({
  id,
  date,
  kind,
  categoryId: id,
  concept: text,
  amountCents: id,
  notes,
  debtId: nullableId,
  accountId: id,
  recurringItemId: nullableId,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const tags = z.strictObject({
  id,
  name: text,
  nameKey: z.string(),
  createdAt: timestamp,
});

const movementTags = z.strictObject({ movementId: id, tagId: id });

const budgetLines = z.strictObject({
  id,
  categoryId: id,
  amountCents: id,
  validFrom: month,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const appSettings = z.strictObject({
  id: z.literal(1),
  initialSavingsCents: int.nonnegative(),
  initialSavingsDate: date,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const categoryRules = z.strictObject({
  id,
  pattern: text,
  categoryId: id,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const importSettings = z.strictObject({
  id: z.literal(1),
  mapping: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const goals = z.strictObject({
  id,
  name: text,
  targetAmountCents: id,
  targetDate: date,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const milestones = z.strictObject({
  id,
  title: text,
  targetDate: date,
  status: z.enum(MILESTONE_STATUSES),
  notes,
  createdAt: timestamp,
  updatedAt: timestamp,
});

/** Row schema of every table, by SQL table name. */
export const ROW_SCHEMAS = {
  categories,
  accounts,
  transfers,
  debts,
  recurring_items: recurringItems,
  recurring_skips: recurringSkips,
  movements,
  tags,
  movement_tags: movementTags,
  budget_lines: budgetLines,
  app_settings: appSettings,
  category_rules: categoryRules,
  import_settings: importSettings,
  goals,
  milestones,
} as const;

export type DataTableName = keyof typeof ROW_SCHEMAS;

/**
 * Order tables are written in: every table after the ones it points at. Accounts come before
 * movements even though no foreign key says so (triggers enforce it, migration 0006). Clearing, if
 * ever needed, goes in the reverse order.
 */
export const TABLE_INSERT_ORDER: readonly DataTableName[] = [
  'accounts',
  'categories',
  'tags',
  'debts',
  'recurring_items',
  'recurring_skips',
  'movements',
  'movement_tags',
  'transfers',
  'budget_lines',
  'category_rules',
  'goals',
  'milestones',
  'app_settings',
  'import_settings',
];

const tableShape = Object.fromEntries(
  Object.entries(ROW_SCHEMAS).map(([name, row]) => [name, z.array(row)]),
) as { [K in DataTableName]: z.ZodArray<(typeof ROW_SCHEMAS)[K]> };

export const dataFileSchema = z.strictObject({
  app: z.literal(DATA_FILE_APP),
  formatVersion: z.literal(DATA_FILE_VERSION),
  exportedAt: z.string().min(1),
  tables: z.strictObject(tableShape),
  /** Last id handed out by each AUTOINCREMENT table (sqlite_sequence), so ids are never reused. */
  sequences: z.record(z.string(), z.number().int().nonnegative()),
});

export type DataFile = z.infer<typeof dataFileSchema>;

export interface DataImportResultDto {
  /** Rows written, by table. */
  imported: Record<string, number>;
}

export const DATA_MESSAGES = {
  notJson: 'El archivo no es un JSON válido. Usa un archivo creado con «Exportar datos».',
  tooBig: 'El archivo es demasiado grande (máximo 25 MB).',
  notEmpty:
    'Solo se pueden importar datos en una instalación vacía: ya hay datos guardados (movimientos, categorías, fijos u otros). Para recuperar una copia de seguridad sigue «Restore a backup» del README.',
  invalid: 'El archivo no es válido y no se ha importado nada.',
  failed: 'No se ha podido importar el archivo y no se ha cambiado nada.',
} as const;

function pathText(path: PropertyKey[]): string {
  return path.map((p) => (typeof p === 'number' ? `[${String(p + 1)}]` : `.${String(p)}`)).join('');
}

/** Spanish problems found by the shape check (at most `limit`), each saying where. */
export function shapeProblems(error: z.ZodError, limit = 5): string[] {
  return error.issues
    .slice(0, limit)
    .map((issue) => `${pathText(issue.path).replace(/^\./, '') || 'archivo'}: valor no válido`);
}

const dupes = (values: (string | number)[]): (string | number)[] => {
  const seen = new Set<string | number>();
  const out = new Set<string | number>();
  for (const v of values) {
    if (seen.has(v)) {
      out.add(v);
    }
    seen.add(v);
  }
  return [...out];
};

/**
 * Checks what the shape cannot: unique ids and keys, references between tables (including the
 * ones only triggers enforce in the database) and the rules a CHECK or a composite key enforces.
 * Returns Spanish problems, none when the file is consistent. Pure, so it runs before any write.
 */
export function referenceProblems(file: DataFile): string[] {
  const t = file.tables;
  const problems: string[] = [];
  const add = (message: string) => problems.push(message);

  for (const name of Object.keys(ROW_SCHEMAS) as DataTableName[]) {
    if (name === 'movement_tags') {
      continue;
    }
    const rows = t[name] as { id: number }[];
    const dup = dupes(rows.map((r) => r.id));
    if (dup.length > 0) {
      add(`${name}: ids repetidos (${dup.slice(0, 3).join(', ')})`);
    }
  }
  if (t.app_settings.length > 1 || t.import_settings.length > 1) {
    add('app_settings e import_settings admiten una sola fila');
  }

  const unique = (table: string, label: string, values: (string | number)[]) => {
    const dup = dupes(values);
    if (dup.length > 0) {
      add(`${table}: ${label} repetido (${dup.slice(0, 3).join(', ')})`);
    }
  };
  unique(
    'categories',
    'nombre',
    t.categories.map((r) => r.name),
  );
  unique(
    'accounts',
    'nombre',
    t.accounts.map((r) => r.name),
  );
  for (const tag of t.tags) {
    if (tag.nameKey !== tagKey(tag.name) || tag.nameKey.length === 0) {
      add(`tags: la clave de la marca «${tag.name}» no coincide con su nombre`);
    }
  }
  unique(
    'tags',
    'nombre (sin mayúsculas ni espacios)',
    t.tags.map((r) => r.nameKey),
  );
  unique(
    'movement_tags',
    'par movimiento-marca',
    t.movement_tags.map((r) => `${String(r.movementId)}-${String(r.tagId)}`),
  );
  unique(
    'recurring_skips',
    'fijo y mes',
    t.recurring_skips.map((r) => `${String(r.recurringItemId)}-${r.month}`),
  );
  unique(
    'budget_lines',
    'categoría y mes',
    t.budget_lines.map((r) => `${String(r.categoryId)}-${r.validFrom}`),
  );
  unique(
    'movements',
    'fijo confirmado en el mismo mes',
    t.movements
      .filter((r) => r.recurringItemId !== null)
      .map((r) => `${String(r.recurringItemId)}-${r.date.slice(0, 7)}`),
  );

  const ids = (rows: { id: number }[]) => new Set(rows.map((r) => r.id));
  const accountIds = ids(t.accounts);
  const categoryKind = new Map(t.categories.map((r) => [r.id, r.kind]));
  const debtIds = ids(t.debts);
  const itemIds = ids(t.recurring_items);
  const movementIds = ids(t.movements);
  const tagIds = ids(t.tags);

  if (!accountIds.has(DEFAULT_ACCOUNT_ID)) {
    add('accounts: falta la cuenta Principal (id 1)');
  }
  const ref = (table: string, row: number, what: string, ok: boolean) => {
    if (!ok) {
      add(`${table}: la fila ${String(row)} apunta a ${what} que no existe en el archivo`);
    }
  };

  for (const m of t.movements) {
    ref('movements', m.id, 'una cuenta', accountIds.has(m.accountId));
    ref(
      'movements',
      m.id,
      'una categoría de su mismo tipo',
      categoryKind.get(m.categoryId) === m.kind,
    );
    ref('movements', m.id, 'una deuda', m.debtId === null || debtIds.has(m.debtId));
    ref('movements', m.id, 'un fijo', m.recurringItemId === null || itemIds.has(m.recurringItemId));
    if (m.debtId !== null && m.kind !== 'repayment') {
      add(`movements: la fila ${String(m.id)} tiene deuda y no es una amortización`);
    }
  }
  for (const r of t.recurring_items) {
    ref(
      'recurring_items',
      r.id,
      'una categoría de su mismo tipo',
      categoryKind.get(r.categoryId) === r.kind,
    );
    ref('recurring_items', r.id, 'una deuda', r.debtId === null || debtIds.has(r.debtId));
    if (r.debtId !== null && r.kind !== 'repayment') {
      add(`recurring_items: la fila ${String(r.id)} tiene deuda y no es una amortización`);
    }
    if (r.endMonth !== null && r.endMonth < r.startMonth) {
      add(`recurring_items: la fila ${String(r.id)} termina antes de empezar`);
    }
  }
  for (const r of t.recurring_skips) {
    ref('recurring_skips', r.id, 'un fijo', itemIds.has(r.recurringItemId));
  }
  for (const r of t.movement_tags) {
    const label = `${String(r.movementId)}-${String(r.tagId)}`;
    if (!movementIds.has(r.movementId) || !tagIds.has(r.tagId)) {
      add(`movement_tags: el par ${label} apunta a un movimiento o una marca que no existe`);
    }
  }
  for (const r of t.transfers) {
    ref('transfers', r.id, 'una cuenta de origen', accountIds.has(r.fromAccountId));
    ref('transfers', r.id, 'una cuenta de destino', accountIds.has(r.toAccountId));
    if (r.fromAccountId === r.toAccountId) {
      add(`transfers: la fila ${String(r.id)} tiene la misma cuenta de origen y destino`);
    }
  }
  for (const r of t.budget_lines) {
    ref('budget_lines', r.id, 'una categoría', categoryKind.has(r.categoryId));
  }
  for (const r of t.category_rules) {
    ref('category_rules', r.id, 'una categoría', categoryKind.has(r.categoryId));
  }

  for (const [table, seq] of Object.entries(file.sequences)) {
    if (!(table in ROW_SCHEMAS) || table === 'movement_tags') {
      add(`sequences: la tabla ${table} no existe`);
      continue;
    }
    const max = (t[table as DataTableName] as { id: number }[]).reduce(
      (acc, r) => Math.max(acc, r.id),
      0,
    );
    if (seq < max) {
      add(`sequences: ${table} (${String(seq)}) es menor que su id más alto (${String(max)})`);
    }
  }
  return problems;
}
