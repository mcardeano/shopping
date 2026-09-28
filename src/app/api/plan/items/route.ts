import { z } from "zod";
import { handler, api } from "@/server/context";
import { addToPlan } from "@/server/services/plan";

async function postHandler(req: Request) {
  const { day, recipeId } = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), recipeId: z.string().uuid() }).parse(await req.json());
  return api(async (ctx) => {
    await addToPlan(ctx, day, recipeId);
    return { ok: true };
  });
}

export const POST = handler(postHandler);
