// Safety check for SQL migrations (task 0014): a migration must never drop a table or rebuild one.
//
// drizzle-kit rebuilds a table (`CREATE TABLE __new_x`, copy, `DROP TABLE x`, rename) for changes
// SQLite cannot do in place. Inside the migrator's transaction `PRAGMA foreign_keys=OFF` has no
// effect, so the DROP cascades to child tables and nulls references: data loss on the real
// database. Write an additive migration by hand instead (see drizzle/0004_*.sql).

/** Removes `-- ...` line comments and `/* ... *\/` blocks, so a comment may talk about DROP TABLE. */
export function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** The reasons a migration is unsafe, in plain words; empty when it is fine. */
export function unsafeReasons(sql: string): string[] {
  const code = stripSqlComments(sql);
  const reasons: string[] = [];
  if (/\bdrop\s+table\b/i.test(code)) {
    reasons.push('contains DROP TABLE');
  }
  if (/__new_/i.test(code)) {
    reasons.push('rebuilds a table (a __new_ table)');
  }
  return reasons;
}
