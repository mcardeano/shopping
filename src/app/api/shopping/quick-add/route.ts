import { handler, api } from "@/server/context";
import { QuickAddBody } from "@/core/domain/schemas";
import { parseShoppingText } from "@/core/services/shoppingIntent";
import { applyShoppingActions } from "@/server/services/shopping";

async function postHandler(req: Request) {
  const { text } = QuickAddBody.parse(await req.json());
  const actions = parseShoppingText(text);
  return api(async (ctx) => {
    const result = await applyShoppingActions(ctx, actions);
    return { ...result, createdIds: result.added.filter((a) => !a.merged).map((a) => a.id) };
  });
}

export const POST = handler(postHandler);
