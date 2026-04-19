import "server-only";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

let _pool: Pool | null = null;

/**
 * Lazy-initialised Postgres pool. Used for application-side tables
 * (dontopedia.*). donto's tables live in `public` and are reached through
 * dontosrv, not through this pool.
 */
export function pool(): Pool {
  if (_pool) return _pool;
  const connectionString =
    process.env.DATABASE_URL ?? "postgres://donto:donto@localhost:55432/donto";
  _pool = new Pool({ connectionString, max: 5 });
  return _pool;
}

let _migrated = false;

/**
 * Apply app-side migrations. Idempotent — each file is guarded by IF NOT
 * EXISTS. Called on first DB use so we don't couple server boot to DB
 * availability.
 */
export async function ensureMigrations(): Promise<void> {
  if (_migrated) return;
  const dir = join(process.cwd(), "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const p = pool();
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");
    await p.query(sql);
  }
  _migrated = true;
}
