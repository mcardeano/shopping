/**
 * Minimal SQL abstraction over two drivers:
 *  - PGlite (embedded Postgres + pgvector, zero setup) for local development/demo
 *  - node-postgres for Supabase / any Postgres via DATABASE_URL
 *
 * User traffic always goes through `asUser`, which runs the work in a transaction as the
 * `authenticated` role with Supabase-compatible JWT claims, so Row Level Security applies.
 */
export type Row = Record<string, unknown>;

export interface Sql {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  one<T = Row>(text: string, params?: unknown[]): Promise<T | undefined>;
  exec(text: string): Promise<void>;
}

export interface Database {
  readonly kind: "pglite" | "postgres";
  /** Run as the signed-in user (RLS enforced). */
  asUser<T>(userId: string, fn: (sql: Sql) => Promise<T>): Promise<T>;
  /** Run with the service connection (migrations, reference data, auth bookkeeping). */
  asService<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>; exec?: (text: string) => Promise<unknown> };

function wrap(q: Queryable): Sql {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const res = await q.query(text, params.map(normalizeParam));
      return res.rows as T[];
    },
    async one<T>(text: string, params: unknown[] = []) {
      const res = await q.query(text, params.map(normalizeParam));
      return res.rows[0] as T | undefined;
    },
    async exec(text: string) {
      if (q.exec) await q.exec(text);
      else await q.query(text);
    },
  };
}

function normalizeParam(p: unknown): unknown {
  if (p === undefined) return null;
  if (p instanceof Date) return p.toISOString();
  return p;
}

const claimsSql = "select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)";

export async function createPgliteDatabase(dataDir: string): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite-pgvector");
  const fs = await import("node:fs");
  if (dataDir !== "memory://") fs.mkdirSync(dataDir, { recursive: true });
  const db = await PGlite.create(dataDir === "memory://" ? undefined : dataDir, { extensions: { vector } });
  return {
    kind: "pglite",
    asUser: (userId, fn) =>
      db.transaction(async (tx) => {
        await tx.query(claimsSql, [JSON.stringify({ sub: userId, role: "authenticated" })]);
        return fn(wrap(tx as unknown as Queryable));
      }),
    asService: (fn) => fn(wrap(db as unknown as Queryable)),
    close: () => db.close(),
  };
}

export async function createPostgresDatabase(connectionString: string): Promise<Database> {
  const pg = await import("pg");
  const pool = new pg.default.Pool({ connectionString, max: 10, ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? undefined : { rejectUnauthorized: false } });
  return {
    kind: "postgres",
    async asUser(userId, fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(claimsSql, [JSON.stringify({ sub: userId, role: "authenticated" })]);
        const result = await fn(wrap(client as unknown as Queryable));
        await client.query("commit");
        return result;
      } catch (e) {
        await client.query("rollback").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
    asService: (fn) => fn(wrap(pool as unknown as Queryable)),
    close: () => pool.end(),
  };
}
