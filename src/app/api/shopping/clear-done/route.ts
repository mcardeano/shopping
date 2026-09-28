import { handler, api } from "@/server/context";
import { activeListId, clearChecked } from "@/server/repos/shopping";

async function postHandler() {
  return api(async (ctx) => {
    await clearChecked(ctx.sql, await activeListId(ctx.sql, ctx.householdId));
    return { ok: true };
  });
}

export const POST = handler(postHandler);
