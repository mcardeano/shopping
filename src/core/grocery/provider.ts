/**
 * GroceryProvider — the seam between core shopping logic and any retailer.
 * Core code only ever sees these types; retailer specifics live in implementations.
 */
export type RetailProduct = {
  id: string; // provider-scoped external id
  provider: string;
  name: string;
  brand?: string;
  /** Canonical ingredient or shopping-product name this SKU satisfies. */
  itemName: string;
  packSize?: number;
  packUnit?: string; // g, ml, piece
  price?: number;
  currency: string;
  url?: string;
  tags?: string[]; // "organic", "0% fat", "private label"
};

export type BasketItem = { productId: string; quantity: number };

export type BasketResult =
  | { kind: "created"; basketUrl: string }
  | { kind: "handoff"; links: { label: string; url: string }[]; exportText: string };

export interface GroceryProvider {
  readonly id: string;
  readonly displayName: string;
  /** Whether the retailer supports creating a basket programmatically (few do, officially). */
  readonly supportsBasket: boolean;
  searchProducts(query: string): Promise<RetailProduct[]>;
  getProduct(id: string): Promise<RetailProduct | undefined>;
  createBasket(items: BasketItem[]): Promise<BasketResult>;
  /** A public search page URL — the documented, zero-integration fallback. */
  searchUrl(query: string): string | undefined;
}
