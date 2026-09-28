import { handler, api } from "@/server/context";
import { productOptionsForItem } from "@/server/services/products";

async function getHandler(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return api((ctx) => productOptionsForItem(ctx, id));
}

export const GET = handler(getHandler);
