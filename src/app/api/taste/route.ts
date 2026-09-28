import { handler, api } from "@/server/context";
import { TasteStatementBody } from "@/core/domain/schemas";
import { applyPreferenceStatement, getTasteView } from "@/server/services/taste";
import { ai } from "@/server/ai";

async function getHandler() {
  return api((ctx) => getTasteView(ctx));
}

async function postHandler(req: Request) {
  const { text } = TasteStatementBody.parse(await req.json());
  const parsed = await ai().parsePreferenceStatement(text);
  return api(async (ctx) => ({ added: await applyPreferenceStatement(ctx, text, parsed), parsed }));
}

export const GET = handler(getHandler);
export const POST = handler(postHandler);
