import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

// A minimal D1 stand-in over a real SQLite database, so migrations and SQL run
// for real in the tests
export function sqliteDb(migrations) {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of migrations) {
    sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  }
  const bound = (sql, args) => ({
    run: async () => (sqlite.prepare(sql).run(...args), { success: true }),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
  });
  return {
    sqlite,
    prepare: (sql) => ({ ...bound(sql, []), bind: (...args) => ({ ...bound(sql, args), sql, args }) }),
    batch: async (statements) => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map(({ sql, args }) =>
          /^\s*select/i.test(sql) ? { results: sqlite.prepare(sql).all(...args) } : (sqlite.prepare(sql).run(...args), { results: [] })
        );
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
