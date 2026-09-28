import { NextResponse } from "next/server";
import { z } from "zod";
import { authProvider, AuthError } from "@/server/auth/providers";
import { setSession } from "@/server/auth/session";
import { errorResponse } from "@/server/context";
import { withUser } from "@/server/db";
import { seedSampleRecipes } from "@/server/seed/demo";

const Body = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().email(),
  password: z.string().min(8, "Use at least 8 characters.").max(200),
  withSamples: z.boolean().default(true),
});

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check your details." }, { status: 400 });
    const { name, email, password, withSamples } = parsed.data;
    const userId = await authProvider().signUp(email, password);
    await withUser(userId, async (sql) => {
      const householdId = String((await sql.one<{ bootstrap_user: string }>("select bootstrap_user($1)", [name]))!.bootstrap_user);
      if (withSamples) {
        const self = await sql.one<{ id: string }>("select id from household_members where user_id = $1", [userId]);
        await seedSampleRecipes({ sql, userId, householdId, selfMemberId: String(self!.id), displayName: name });
      }
    });
    await setSession(userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.code === "email_taken" ? 409 : 400 });
    return errorResponse(e);
  }
}
