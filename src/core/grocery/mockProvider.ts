import type { BasketItem, BasketResult, GroceryProvider, RetailProduct } from "./provider";
import { MOCK_PRODUCTS } from "./mockCatalog";
import { resolveItem } from "../services/normalization";

/**
 * Local mock retailer. Behaves like a real provider (search, get, basket handoff) so the
 * product-matching and basket flows can be built and tested before any retailer integration.
 */
export class MockGroceryProvider implements GroceryProvider {
  readonly id = "mock";
  readonly displayName = "Demo supermarket";
  readonly supportsBasket = false;

  async searchProducts(query: string): Promise<RetailProduct[]> {
    const target = resolveItem(query).name;
    const q = query.toLowerCase();
    return MOCK_PRODUCTS.filter((p) => p.itemName === target || p.name.toLowerCase().includes(q));
  }

  async getProduct(id: string): Promise<RetailProduct | undefined> {
    return MOCK_PRODUCTS.find((p) => p.id === id);
  }

  async createBasket(items: BasketItem[]): Promise<BasketResult> {
    const lines = await Promise.all(items.map(async (i) => ({ i, p: await this.getProduct(i.productId) })));
    return {
      kind: "handoff",
      links: [],
      exportText: lines.filter((l) => l.p).map((l) => `${l.i.quantity} × ${l.p!.name}`).join("\n"),
    };
  }

  searchUrl(): string | undefined {
    return undefined;
  }
}
