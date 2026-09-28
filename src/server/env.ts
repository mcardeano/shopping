import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  SESSION_SECRET: z.string().min(16).optional(),
  DATABASE_URL: z.string().optional(),
  PGLITE_DATA_DIR: z.string().default("./.data/pglite"),
  AUTH_PROVIDER: z.enum(["local", "supabase"]).default("local"),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5"),
});

const parsed = Env.safeParse(Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v])));
if (!parsed.success) {
  throw new Error(`Invalid environment: ${parsed.error.message}`);
}

export const env = parsed.data;

let generated: string | undefined;

export function sessionSecret(): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (env.NODE_ENV !== "production") return "larder-dev-only-session-secret-change-me";
  if (env.DATABASE_URL) throw new Error("SESSION_SECRET must be set in production");
  // Local production build on the embedded database: keep a random secret next to the data.
  if (!generated) {
    const file = path.join(process.cwd(), ".data", "session-secret");
    if (fs.existsSync(file)) generated = fs.readFileSync(file, "utf8").trim();
    else {
      generated = randomBytes(32).toString("base64url");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, generated, { mode: 0o600 });
    }
  }
  return generated;
}
