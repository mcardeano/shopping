import { z } from "zod";
import { handler, api, HttpError } from "@/server/context";
import { addRecipeContributions, removeRecipeFromList } from "@/server/services/shopping";
import { getRecipe } from "@/server/repos/recipes";

async function postHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { servings } = z.object({ servings: z.number().int().min(1).max(40).optional() }).parse(await req.json().catch(() => ({})));
  return api(async (ctx) => {
    const recipe = await getRecipe(ctx.sql, id);
    if (!recipe) throw new HttpError(404, "Recipe not found.");
    const count = await addRecipeContributions(ctx, id, { type: "recipe", sourceId: id, label: recipe.title }, { servings });
    return { count };
  });
}

async function deleteHandler(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return api(async (ctx) => {
    await removeRecipeFromList(ctx, id);
    return { ok: true };
  });
}

export const POST = handler(postHandler);
export const DELETE = handler(deleteHandler);
