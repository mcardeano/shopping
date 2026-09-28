import { z } from "zod";
import { handler, api, HttpError } from "@/server/context";
import { RecipeDraft } from "@/core/domain/schemas";
import { getRecipe, getFeedback, setNotes } from "@/server/repos/recipes";
import { editRecipe, removeRecipe } from "@/server/services/recipes";

type Params = { params: Promise<{ id: string }> };

async function getHandler(_: Request, { params }: Params) {
  const { id } = await params;
  return api(async (ctx) => {
    const recipe = await getRecipe(ctx.sql, id);
    if (!recipe) throw new HttpError(404, "Recipe not found.");
    return { recipe, feedback: await getFeedback(ctx.sql, id) };
  });
}

const Patch = z.union([z.object({ notes: z.string().max(4000).nullable() }), z.object({ draft: RecipeDraft })]);

async function patchHandler(req: Request, { params }: Params) {
  const { id } = await params;
  const body = Patch.parse(await req.json());
  return api(async (ctx) => {
    if ("notes" in body) await setNotes(ctx.sql, id, body.notes?.trim() || null);
    else await editRecipe(ctx, id, body.draft);
    return { ok: true };
  });
}

async function deleteHandler(_: Request, { params }: Params) {
  const { id } = await params;
  return api(async (ctx) => {
    await removeRecipe(ctx, id);
    return { ok: true };
  });
}

export const GET = handler(getHandler);
export const PATCH = handler(patchHandler);
export const DELETE = handler(deleteHandler);
