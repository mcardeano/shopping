/**
 * ProductMatchingService
 * Ranks retailer products for a list item:
 *   ingredient match × purchase frequency × brand preference × pack-size fit × price
 */
import type { RetailProduct } from "./provider";
import { unitDef } from "../text/quantity";

export type PurchaseSignal = { brand?: string | null; retailProductId?: string | null; count: number };

export type RankedProduct = RetailProduct & { score: number; badge?: string; packsNeeded?: number };

export function rankProducts(
  products: RetailProduct[],
  need: { quantity?: number | null; unit?: string | null },
  history: PurchaseSignal[],
): RankedProduct[] {
  const totalPurchases = history.reduce((s, h) => s + h.count, 0) || 1;
  const prices = products.map((p) => p.price ?? 0).filter((x) => x > 0);
  const minPrice = Math.min(...prices, Infinity);
  return products
    .map((p) => {
      const exact = history.find((h) => h.retailProductId === p.id)?.count ?? 0;
      const brand = history.filter((h) => h.brand && p.brand && h.brand.toLowerCase() === p.brand.toLowerCase()).reduce((s, h) => s + h.count, 0);
      const frequency = 0.3 + 0.7 * (exact / totalPurchases);
      const brandPref = 0.5 + 0.5 * (brand / totalPurchases);

      let packFit = 0.8;
      let packsNeeded: number | undefined;
      const needDef = unitDef(need.unit ?? undefined);
      const packDef = unitDef(p.packUnit);
      if (need.quantity && p.packSize && needDef && packDef && needDef.dimension === packDef.dimension && needDef.dimension !== "count") {
        const needBase = need.quantity * needDef.toBase;
        const packBase = p.packSize * packDef.toBase;
        packsNeeded = Math.max(1, Math.ceil(needBase / packBase - 0.05));
        const waste = (packsNeeded * packBase - needBase) / (packsNeeded * packBase);
        packFit = 1 - Math.min(0.8, waste);
      }
      const price = p.price && minPrice < Infinity ? 0.7 + 0.3 * (minPrice / p.price) : 0.85;
      const score = frequency * brandPref * packFit * price;
      const badge = exact >= 2 ? "You usually buy this" : brand >= 2 ? `You usually buy ${p.brand}` : undefined;
      return { ...p, score, badge, packsNeeded };
    })
    .sort((a, b) => b.score - a.score);
}
