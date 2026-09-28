import { z } from "zod";
import { handler, api } from "@/server/context";
import { toggleFavorite } from "@/server/services/recipes";

async function postHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { favorite } = z.object({ favorite: z.boolean() }).parse(await req.json());
  return api(async (ctx) => {
    await toggleFavorite(ctx, id, favorite);
    return { ok: true };
  });
}

export const POST = handler(postHandler);
