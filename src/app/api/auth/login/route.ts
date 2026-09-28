import { NextResponse } from "next/server";
import { z } from "zod";
import { authProvider, AuthError } from "@/server/auth/providers";
import { setSession } from "@/server/auth/session";
import { errorResponse } from "@/server/context";

const Body = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  try {
    const { email, password } = Body.parse(await req.json());
    const userId = await authProvider().signIn(email, password);
    await setSession(userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    return errorResponse(e);
  }
}
