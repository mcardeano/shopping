import { handler, api } from "@/server/context";
import { openRecipe } from "@/server/services/recipes";

async function postHandler(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return api(async (ctx) => {
    await openRecipe(ctx, id);
    return { ok: true };
  });
}

export const POST = handler(postHandler);
