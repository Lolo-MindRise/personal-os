import { getTableName, is } from 'drizzle-orm';
import { getTableConfig, SQLiteTable, type AnySQLiteTable } from 'drizzle-orm/sqlite-core';
import { TABLE_INSERT_ORDER, type DataTableName } from '../shared/dataFile.js';
import { schema } from './db/index.js';

/** Every table of the Drizzle schema, found by looking at what the schema module exports. */
export const SCHEMA_TABLES = Object.values(schema).filter((value) =>
  is(value, SQLiteTable),
) as unknown as AnySQLiteTable[];

const BY_NAME = new Map(SCHEMA_TABLES.map((table) => [getTableName(table), table]));

/** The schema table behind a name of the data file. */
export function tableOf(name: DataTableName): AnySQLiteTable {
  const table = BY_NAME.get(name);
  if (table === undefined) {
    throw new Error(`Table ${name} is not in the schema.`);
  }
  return table;
}

/** Tables in the order they are written (see TABLE_INSERT_ORDER). */
export const ORDERED_TABLES: { name: DataTableName; table: AnySQLiteTable }[] =
  TABLE_INSERT_ORDER.map((name) => ({ name, table: tableOf(name) }));

/** Primary key columns of a table, for a stable order of its rows. */
export function primaryKeyColumns(table: AnySQLiteTable) {
  const config = getTableConfig(table);
  const single = config.columns.filter((column) => column.primary);
  return single.length > 0 ? single : (config.primaryKeys[0]?.columns ?? []);
}
