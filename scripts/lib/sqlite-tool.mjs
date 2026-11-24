// Small SQLite helper for scripts/restore.sh (better-sqlite3 is already a dependency).
//   node sqlite-tool.mjs check <file>            exit 0 when <file> is a healthy database with tables
//   node sqlite-tool.mjs snapshot <db> <dest>    consistent copy of <db> (WAL included) into <dest>
import Database from 'better-sqlite3';

const [command, first, second] = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (command === 'check' && first) {
  let db;
  try {
    db = new Database(first, { readonly: true, fileMustExist: true });
    const rows = db.pragma('integrity_check');
    const problems = rows.filter((row) => row.integrity_check !== 'ok');
    if (problems.length > 0) {
      fail(`integrity check failed: ${problems[0].integrity_check}`);
    }
    const tables = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get();
    if (tables.n === 0) {
      fail('the file is a valid SQLite database but has no tables');
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    db?.close();
  }
} else if (command === 'snapshot' && first && second) {
  const db = new Database(first, { fileMustExist: true });
  try {
    await db.backup(second);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    db.close();
  }
} else {
  fail('usage: sqlite-tool.mjs check <file> | snapshot <db> <dest>');
}
