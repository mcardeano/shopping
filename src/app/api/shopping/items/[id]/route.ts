import { handler, api } from "@/server/context";
import { UpdateShoppingItemBody } from "@/core/domain/schemas";
import { deleteItem, setQuantityOverride, updateItem } from "@/server/repos/shopping";
import { setChecked, setStatus } from "@/server/services/shopping";
import { canonicalUnit } from "@/core/text/quantity";

type Params = { params: Promise<{ id: string }> };

async function patchHandler(req: Request, { params }: Params) {
  const { id } = await params;
  const body = UpdateShoppingItemBody.parse(await req.json());
  return api(async (ctx) => {
    if (body.checked !== undefined) await setChecked(ctx, id, body.checked);
    if (body.status !== undefined && body.status !== "purchased") await setStatus(ctx, id, body.status);
    if (body.quantity !== undefined) await setQuantityOverride(ctx.sql, id, body.quantity, body.unit ? (canonicalUnit(body.unit) ?? body.unit) : null);
    await updateItem(ctx.sql, id, {
      displayName: body.displayName,
      note: body.note === undefined ? undefined : body.note?.trim() || null,
      category: body.category,
      preferredRetailProductId: body.preferredRetailProductId,
    });
    return { ok: true };
  });
}

async function deleteHandler(_: Request, { params }: Params) {
  const { id } = await params;
  return api(async (ctx) => {
    await deleteItem(ctx.sql, id);
    return { ok: true };
  });
}

export const PATCH = handler(patchHandler);
export const DELETE = handler(deleteHandler);
