import { handler, api } from "@/server/context";
import { cookRecipe } from "@/server/services/recipes";

async function postHandler(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return api(async (ctx) => {
    await cookRecipe(ctx, id);
    return { ok: true };
  });
}

export const POST = handler(postHandler);
