import { handler, api } from "@/server/context";
import { getShoppingView } from "@/server/services/shopping";

async function getHandler() {
  return api((ctx) => getShoppingView(ctx));
}

export const GET = handler(getHandler);
