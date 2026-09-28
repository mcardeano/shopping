import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { Sql } from "./db/driver";
import { withUser } from "./db";
import { sessionUserId } from "./auth/session";

/** Everything a service needs to act on behalf of the signed-in user. */
export type Ctx = {
  sql: Sql;
  userId: string;
  householdId: string;
  selfMemberId: string;
  displayName: string;
};

async function buildCtx(sql: Sql, userId: string): Promise<Ctx | null> {
  let profile = await sql.one<{ household_id: string; display_name: string }>("select household_id, display_name from profiles where user_id = $1", [userId]);
  if (!profile) {
    // First request after sign-up (or Supabase account created elsewhere).
    await sql.query("select bootstrap_user($1)", [""]);
    profile = await sql.one("select household_id, display_name from profiles where user_id = $1", [userId]);
    if (!profile) return null;
  }
  const self = await sql.one<{ id: string }>("select id from household_members where user_id = $1 and role = 'self' limit 1", [userId]);
  return { sql, userId, householdId: String(profile.household_id), selfMemberId: String(self!.id), displayName: String(profile.display_name) };
}

/** Runs `fn` as the signed-in user inside an RLS-scoped transaction; redirects to /login otherwise. */
export async function asViewer<T>(fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  const userId = await sessionUserId();
  if (!userId) redirect("/login");
  const result = await withUser(userId, async (sql) => {
    const ctx = await buildCtx(sql, userId);
    if (!ctx) return { missing: true as const };
    return { value: await fn(ctx) };
  });
  if ("missing" in result) redirect("/login");
  return result.value;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Route-handler wrapper: auth, RLS transaction, JSON errors. */
export async function api<T>(fn: (ctx: Ctx) => Promise<T>): Promise<NextResponse> {
  try {
    const userId = await sessionUserId();
    if (!userId) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const result = await withUser(userId, async (sql) => {
      const ctx = await buildCtx(sql, userId);
      if (!ctx) throw new HttpError(401, "Please sign in.");
      return fn(ctx);
    });
    return NextResponse.json(result ?? { ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: "That request didn't look right.", issues: error.issues }, { status: 400 });
  console.error(error);
  return NextResponse.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
}

export async function requireUserId(): Promise<string> {
  const userId = await sessionUserId();
  if (!userId) throw new HttpError(401, "Please sign in.");
  return userId;
}

/** Wraps a route handler so thrown errors (validation, auth, unexpected) become JSON responses. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
