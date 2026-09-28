import { z } from "zod";
import { handler, api } from "@/server/context";
import { swapMeal } from "@/server/services/plan";

async function postHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { weekStart } = z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(await req.json());
  return api(async (ctx) => {
    await swapMeal(ctx, weekStart, id);
    return { ok: true };
  });
}

export const POST = handler(postHandler);
