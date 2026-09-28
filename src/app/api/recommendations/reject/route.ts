import { z } from "zod";
import { handler, api } from "@/server/context";
import { rejectRecommendation } from "@/server/services/recipes";

async function postHandler(req: Request) {
  const { recipeId } = z.object({ recipeId: z.string().uuid() }).parse(await req.json());
  return api(async (ctx) => {
    await rejectRecommendation(ctx, recipeId);
    return { ok: true };
  });
}

export const POST = handler(postHandler);
