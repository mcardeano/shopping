import { z } from "zod";
import { handler, api } from "@/server/context";
import { addManualItems, dismissSuggestion } from "@/server/services/shopping";

async function postHandler(req: Request) {
  const { name, accept } = z.object({ name: z.string().min(1).max(120), accept: z.boolean() }).parse(await req.json());
  return api(async (ctx) => {
    if (accept) await addManualItems(ctx, [{ rawText: name, name, increment: false }], "repeat_purchase");
    else await dismissSuggestion(ctx, name);
    return { ok: true };
  });
}

export const POST = handler(postHandler);
