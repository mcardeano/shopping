import { env } from "../env";
import { getDb } from "../db";
import { hashPassword, verifyPassword } from "./password";

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_credentials" | "email_taken" | "weak_password" | "unavailable",
  ) {
    super(message);
  }
}

export interface AuthProvider {
  signUp(email: string, password: string): Promise<string>;
  signIn(email: string, password: string): Promise<string>;
}

/** Email + password stored in the embedded database's auth.users (scrypt). */
class LocalAuthProvider implements AuthProvider {
  async signUp(email: string, password: string): Promise<string> {
    if (password.length < 8) throw new AuthError("Use at least 8 characters.", "weak_password");
    const db = await getDb();
    const hash = await hashPassword(password);
    return db.asService(async (sql) => {
      const existing = await sql.one("select id from auth.users where lower(email) = lower($1)", [email]);
      if (existing) throw new AuthError("There's already an account with that email.", "email_taken");
      const row = await sql.one<{ id: string }>("insert into auth.users (email, encrypted_password) values (lower($1), $2) returning id", [email, hash]);
      return String(row!.id);
    });
  }

  async signIn(email: string, password: string): Promise<string> {
    const db = await getDb();
    const row = await db.asService((sql) => sql.one<{ id: string; encrypted_password: string }>("select id, encrypted_password from auth.users where lower(email) = lower($1)", [email]));
    if (!row || !(await verifyPassword(password, row.encrypted_password))) throw new AuthError("That email and password don't match.", "invalid_credentials");
    return String(row.id);
  }
}

/**
 * Supabase Auth (GoTrue) over its public REST API. Credentials are verified by Supabase;
 * the app then keeps its own signed session and talks to Postgres with the user's claims,
 * so the same RLS policies apply.
 */
class SupabaseAuthProvider implements AuthProvider {
  constructor(
    private readonly url: string,
    private readonly anonKey: string,
  ) {}

  private async call(path: string, body: object): Promise<{ user?: { id: string }; id?: string; error_description?: string; msg?: string }> {
    const res = await fetch(`${this.url}/auth/v1/${path}`, {
      method: "POST",
      headers: { apikey: this.anonKey, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { user?: { id: string }; id?: string; error_description?: string; msg?: string };
    if (!res.ok) {
      const message = json.error_description ?? json.msg ?? "Authentication failed.";
      throw new AuthError(message, res.status === 400 || res.status === 401 ? "invalid_credentials" : "unavailable");
    }
    return json;
  }

  async signUp(email: string, password: string): Promise<string> {
    const json = await this.call("signup", { email, password });
    const id = json.user?.id ?? json.id;
    if (!id) throw new AuthError("Check your inbox to confirm your email, then sign in.", "unavailable");
    return id;
  }

  async signIn(email: string, password: string): Promise<string> {
    const json = await this.call("token?grant_type=password", { email, password });
    if (!json.user?.id) throw new AuthError("That email and password don't match.", "invalid_credentials");
    return json.user.id;
  }
}

export function authProvider(): AuthProvider {
  if (env.AUTH_PROVIDER === "supabase") {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error("AUTH_PROVIDER=supabase requires SUPABASE_URL and SUPABASE_ANON_KEY");
    return new SupabaseAuthProvider(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  }
  return new LocalAuthProvider();
}
