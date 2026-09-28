import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { setSession } from "@/server/auth/session";
import { DEMO_EMAIL } from "@/server/seed/demo";
import { errorResponse } from "@/server/context";

/** One-tap sign-in to the seeded demo household (embedded database only). */
export async function POST() {
  try {
    const db = await getDb();
    if (db.kind !== "pglite") return NextResponse.json({ error: "The demo account is only available in local mode." }, { status: 404 });
    const row = await db.asService((sql) => sql.one<{ id: string }>("select id from auth.users where email = $1", [DEMO_EMAIL]));
    if (!row) return NextResponse.json({ error: "Demo account not found." }, { status: 404 });
    await setSession(String(row.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
