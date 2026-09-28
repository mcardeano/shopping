import { handler, api } from "@/server/context";
import { UpdatePreferenceBody } from "@/core/domain/schemas";
import { deletePreference, updatePreference } from "@/server/repos/taste";

type Params = { params: Promise<{ id: string }> };

async function patchHandler(req: Request, { params }: Params) {
  const { id } = await params;
  const body = UpdatePreferenceBody.parse(await req.json());
  return api(async (ctx) => {
    await updatePreference(ctx.sql, id, body);
    return { ok: true };
  });
}

async function deleteHandler(_: Request, { params }: Params) {
  const { id } = await params;
  return api(async (ctx) => {
    await deletePreference(ctx.sql, id);
    return { ok: true };
  });
}

export const PATCH = handler(patchHandler);
export const DELETE = handler(deleteHandler);
