import { handler, api } from "@/server/context";
import { RecipeDraft } from "@/core/domain/schemas";
import { saveRecipe, searchLibrary } from "@/server/services/recipes";

async function getHandler(req: Request) {
  const url = new URL(req.url);
  return api((ctx) => searchLibrary(ctx, url.searchParams.get("q") ?? "", url.searchParams.get("chip") ?? undefined));
}

async function postHandler(req: Request) {
  const draft = RecipeDraft.parse(await req.json());
  return api(async (ctx) => ({ id: await saveRecipe(ctx, { ...draft, sourcePlatform: draft.sourcePlatform ?? "manual" }) }));
}

export const GET = handler(getHandler);
export const POST = handler(postHandler);
