import { NextResponse } from "next/server";
import { handler, api, errorResponse } from "@/server/context";
import { ImportBody } from "@/core/domain/schemas";
import { extractFromInput, recordImport } from "@/server/services/imports";
import { sessionUserId } from "@/server/auth/session";

export const maxDuration = 60;

async function postHandler(req: Request) {
  try {
    if (!(await sessionUserId())) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const parsed = ImportBody.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "That doesn't look like a link, text or image we can read." }, { status: 400 });
    // Network + AI work happens outside the database transaction.
    const outcome = await extractFromInput(parsed.data);
    return api(async (ctx) => ({ importId: await recordImport(ctx, parsed.data, outcome), ...outcome }));
  } catch (e) {
    return errorResponse(e);
  }
}

export const POST = handler(postHandler);
