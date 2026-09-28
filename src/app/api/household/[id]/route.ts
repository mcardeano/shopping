import { handler, api } from "@/server/context";
import { removeMember } from "@/server/repos/misc";

async function deleteHandler(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return api(async (ctx) => {
    await removeMember(ctx.sql, id);
    return { ok: true };
  });
}

export const DELETE = handler(deleteHandler);
