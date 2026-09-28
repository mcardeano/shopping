import { handler, api } from "@/server/context";
import { deleteHouseholdData } from "@/server/services/account";

async function deleteHandler() {
  return api(async (ctx) => {
    await deleteHouseholdData(ctx);
    return { ok: true };
  });
}

export const DELETE = handler(deleteHandler);
