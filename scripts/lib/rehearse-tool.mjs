// Helper for scripts/rehearse-migration.sh. Works ONLY on the file it is given
// (a temporary copy of a backup), never on a live database.
//   node rehearse-tool.mjs <copy> <migrations folder>
// Counts rows per table, applies the pending migrations with the same migrator
// the app uses (drizzle, no server), counts again and prints the comparison.
// Exit 0: migrations applied and no table lost rows. Exit 1: a migration failed
// or a table lost rows (or disappeared).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const [copy, migrationsDir] = process.argv.slice(2);
if (!copy || !migrationsDir) {
  console.error('usage: rehearse-tool.mjs <copy> <migrations folder>');
  process.exit(1);
}

const MIGRATIONS_TABLE = '__drizzle_migrations';

function countRows(db) {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> ? ORDER BY name",
    )
    .all(MIGRATIONS_TABLE);
  const counts = new Map();
  for (const { name } of tables) {
    const quoted = `"${name.replaceAll('"', '""')}"`;
    counts.set(name, db.prepare(`SELECT count(*) AS n FROM ${quoted}`).get().n);
  }
  return counts;
}

/** Same rule as drizzle: an entry is pending when it is newer than the last applied one. */
function lastAppliedAt(db) {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(MIGRATIONS_TABLE);
  if (exists === undefined) return -Infinity;
  const row = db.prepare(`SELECT max(created_at) AS at FROM ${MIGRATIONS_TABLE}`).get();
  return row.at ?? -Infinity;
}

/** Runs the rehearsal; failures set process.exitCode and return, so `finally` always closes the copy. */
function run() {
  let db;
  try {
    db = new Database(copy, { fileMustExist: true });
    // Same pragmas, same order, as the app (src/server/db/index.ts) before it migrates.
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    const before = countRows(db);
    const lastApplied = lastAppliedAt(db);
    const journal = JSON.parse(readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf8'));
    const pending = journal.entries.filter((entry) => entry.when > lastApplied);

    try {
      migrate(drizzle(db), { migrationsFolder: migrationsDir });
    } catch (error) {
      console.error(`MIGRATION FAILED: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
      return;
    }
    const after = countRows(db);

    const names = [...new Set([...before.keys(), ...after.keys()])].sort();
    const width = Math.max(5, ...names.map((name) => name.length));
    const lines = [
      `${'table'.padEnd(width)}  ${'before'.padStart(8)}  ${'after'.padStart(8)}  ${'difference'.padStart(10)}`,
    ];
    const problems = [];
    for (const name of names) {
      const b = before.get(name);
      const a = after.get(name);
      const note = b === undefined ? ' (new table)' : a === undefined ? ' (table removed)' : '';
      const diff = (a ?? 0) - (b ?? 0);
      const shownDiff = diff > 0 ? `+${String(diff)}` : String(diff);
      lines.push(
        `${name.padEnd(width)}  ${String(b ?? 0).padStart(8)}  ${String(a ?? 0).padStart(8)}  ${shownDiff.padStart(10)}${note}`,
      );
      if (a === undefined) problems.push(`${name}: table no longer exists`);
      else if (a < (b ?? 0)) problems.push(`${name}: lost ${String(-diff)} row(s)`);
    }
    console.log(lines.join('\n'));
    console.log('');
    if (pending.length === 0) {
      console.log(
        'Migrations applied: none (the backup already has every migration of this build).',
      );
    } else {
      console.log(`Migrations applied (${String(pending.length)}):`);
      for (const entry of pending) console.log(`  ${entry.tag}`);
    }
    if (problems.length > 0) {
      console.error('');
      console.error('ROWS LOST: do not deploy this build.');
      for (const problem of problems) console.error(`  ${problem}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    db?.close();
  }
}

run();
