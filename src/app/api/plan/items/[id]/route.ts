import { z } from "zod";
import { handler, api } from "@/server/context";
import { lockPlanItem, removeFromPlan } from "@/server/services/plan";

type Params = { params: Promise<{ id: string }> };

async function patchHandler(req: Request, { params }: Params) {
  const { id } = await params;
  const { locked } = z.object({ locked: z.boolean() }).parse(await req.json());
  return api(async (ctx) => {
    await lockPlanItem(ctx, id, locked);
    return { ok: true };
  });
}

async function deleteHandler(_: Request, { params }: Params) {
  const { id } = await params;
  return api(async (ctx) => {
    await removeFromPlan(ctx, id);
    return { ok: true };
  });
}

export const PATCH = handler(patchHandler);
export const DELETE = handler(deleteHandler);
