import type { Ctx } from "../context";
import { rankProducts, type RankedProduct } from "@/core/grocery/matching";
import { RETAILER_SEARCH } from "@/core/grocery/retailerLinks";
import type { RetailProduct } from "@/core/grocery/provider";
import { productPurchaseSignals, retailProductsFor } from "../repos/misc";
import { listItems, activeListId } from "../repos/shopping";

export type ProductOptions = { products: (RankedProduct & { dbId: string })[]; links: { name: string; url: string }[] };

export async function productOptionsForItem(ctx: Ctx, itemId: string): Promise<ProductOptions> {
  const listId = await activeListId(ctx.sql, ctx.householdId);
  const item = (await listItems(ctx.sql, listId)).find((i) => i.id === itemId);
  if (!item) return { products: [], links: [] };
  const [rows, signals] = await Promise.all([retailProductsFor(ctx.sql, item.normalizedName), productPurchaseSignals(ctx.sql, item.normalizedName)]);
  const products: (RetailProduct & { dbId: string })[] = rows.map((r) => ({
    dbId: String(r.id),
    id: String(r.id),
    provider: String(r.provider),
    name: String(r.name),
    brand: r.brand ? String(r.brand) : undefined,
    itemName: item.normalizedName,
    packSize: r.pack_size != null ? Number(r.pack_size) : undefined,
    packUnit: r.pack_unit ? String(r.pack_unit) : undefined,
    price: r.price != null ? Number(r.price) : undefined,
    currency: String(r.currency ?? "EUR"),
  }));
  const qSource = item.sources.find((s) => s.quantity != null);
  const ranked = rankProducts(products, { quantity: item.quantityOverride ?? qSource?.quantity, unit: item.unitOverride ?? qSource?.unit }, signals.map((s) => ({ brand: s.brand, retailProductId: s.retail_product_id, count: Number(s.n) })));
  return {
    products: ranked.map((p) => ({ ...p, dbId: p.id })),
    links: RETAILER_SEARCH.map((r) => ({ name: r.name, url: r.url(item.displayName) })),
  };
}
