export const SHOPPING_CATEGORIES = [
  "Produce",
  "Meat & Fish",
  "Dairy & Eggs",
  "Bakery",
  "Pantry",
  "Frozen",
  "Drinks",
  "Household",
  "Personal Care",
  "Baby",
  "Pets",
  "Other",
] as const;

export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number];

/** Order in which aisles appear on the list (roughly a supermarket walk). */
export const CATEGORY_ORDER: Record<ShoppingCategory, number> = Object.fromEntries(
  SHOPPING_CATEGORIES.map((c, i) => [c, i]),
) as Record<ShoppingCategory, number>;

export function isShoppingCategory(value: string): value is ShoppingCategory {
  return (SHOPPING_CATEGORIES as readonly string[]).includes(value);
}

export const CUISINE_FAMILIES: Record<string, string> = {
  japanese: "asian",
  korean: "asian",
  thai: "asian",
  chinese: "asian",
  vietnamese: "asian",
  indonesian: "asian",
  asian: "asian",
  "middle eastern": "middle eastern",
  levantine: "middle eastern",
  "north african": "middle eastern",
  mediterranean: "mediterranean",
  greek: "mediterranean",
  italian: "mediterranean",
};

export function cuisineFamily(cuisine: string | null | undefined): string | undefined {
  if (!cuisine) return undefined;
  return CUISINE_FAMILIES[cuisine.toLowerCase()] ?? cuisine.toLowerCase();
}

export const CUISINE_FAMILY_LABEL: Record<string, string> = {
  asian: "Asian",
  "middle eastern": "Middle Eastern",
  mediterranean: "Mediterranean",
};
