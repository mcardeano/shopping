import fs from "node:fs";
import path from "node:path";
import { env } from "../env";
import { createPgliteDatabase, createPostgresDatabase, type Database, type Sql } from "./driver";
import { seedReferenceData } from "../seed/reference";
import { seedDemoAccount } from "../seed/demo";

export type { Database, Sql } from "./driver";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");
const AUTH_STUB = path.join(process.cwd(), "supabase", "local", "auth_stub.sql");

export async function runMigrations(db: Database): Promise<string[]> {
  return db.asService(async (sql) => {
    if (db.kind === "pglite") await sql.exec(fs.readFileSync(AUTH_STUB, "utf8"));
    await sql.exec("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
    const applied = new Set((await sql.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name));
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const ran: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      await sql.exec(`begin;\n${fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")}\ninsert into schema_migrations (name) values ('${file.replace(/'/g, "''")}');\ncommit;`);
      ran.push(file);
    }
    return ran;
  });
}

type GlobalDb = { promise?: Promise<Database> };
const g = globalThis as unknown as { __larderDb?: GlobalDb };
g.__larderDb ??= {};

async function init(): Promise<Database> {
  const db = env.DATABASE_URL ? await createPostgresDatabase(env.DATABASE_URL) : await createPgliteDatabase(env.PGLITE_DATA_DIR);
  const ran = await runMigrations(db);
  if (ran.length) console.log(`[db] applied migrations: ${ran.join(", ")}`);
  await db.asService((sql) => seedReferenceData(sql));
  // The demo account only exists where we own auth.users (embedded database).
  if (db.kind === "pglite") await seedDemoAccount(db);
  return db;
}

/** Process-wide database handle (survives Next.js dev hot reloads). */
export function getDb(): Promise<Database> {
  const holder = g.__larderDb!;
  holder.promise ??= init().catch((e) => {
    holder.promise = undefined;
    throw e;
  });
  return holder.promise;
}

export async function withUser<T>(userId: string, fn: (sql: Sql) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.asUser(userId, fn);
}
