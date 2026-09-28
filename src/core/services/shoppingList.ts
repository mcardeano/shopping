/**
 * ShoppingListService (pure parts)
 * - converts recipe ingredients into list contributions
 * - merges quantities across sources ("2 tbsp + 1 tbsp + 3 tbsp soy sauce" → "6 tbsp")
 * - semantic duplicate detection ("Greek yoghurt" / "Fage yogurt" / "yogurt for breakfast")
 * - human provenance labels ("Meal plan", "Added by you", "Usually buy weekly")
 */
import type { ShoppingCategory } from "../domain/categories";
import type { ItemSourceType, ItemStatus } from "../domain/schemas";
import type { ShoppingItemSource } from "../domain/types";
import { ALWAYS_HAVE } from "../catalog/ingredients";
import { formatQuantity, sumQuantities, type Quantity } from "../text/quantity";
import { findIngredient, resolveItem, singularKey, GENERIC_TERMS, type ResolvedItem } from "./normalization";
import { describeInterval } from "./pantry";

export type ExistingItem = { id: string; normalizedName: string; displayName: string; checked: boolean };

/**
 * Finds the list item a new phrase should merge into, if any.
 * Exact canonical match first; then generic-to-specific ("yogurt" → "Greek yogurt" already on the list).
 */
export function findDuplicate(resolved: ResolvedItem, existing: ExistingItem[]): ExistingItem | undefined {
  const active = existing.filter((e) => !e.checked);
  const exact = active.find((e) => e.normalizedName === resolved.name) ?? active.find((e) => singularKey(e.normalizedName) === singularKey(resolved.name));
  if (exact) return exact;
  const key = singularKey(resolved.name);
  const words = key.split(" ");
  const genericWord = words.find((w) => GENERIC_TERMS.has(w));
  if (resolved.generic || (genericWord && words.length <= 2)) {
    const g = genericWord ?? key;
    const candidates = active.filter((e) => singularKey(e.normalizedName).split(" ").includes(g));
    if (candidates.length === 1) return candidates[0];
  }
  // A specific phrase matching a generic item already on the list ("Greek yogurt" when "Yogurt" is there).
  const generalOnList = active.find((e) => {
    const k = singularKey(e.normalizedName);
    return GENERIC_TERMS.has(k) && words.includes(k);
  });
  return generalOnList;
}

export type ItemContribution = {
  name: string; // canonical key
  display: string;
  category: ShoppingCategory;
  quantity?: number;
  unit?: string;
  kind: ResolvedItem["kind"];
};

/** Recipe ingredient → shopping contribution (skips salt/pepper/water). */
export function contributionFromIngredient(line: { normalizedName: string; amount: number | null; unit: string | null; optional: boolean }, scale = 1): ItemContribution | null {
  if (line.optional || ALWAYS_HAVE.has(line.normalizedName)) return null;
  const resolved = resolveItem(line.normalizedName);
  return {
    name: resolved.name,
    display: resolved.display,
    category: resolved.category,
    quantity: line.amount != null ? line.amount * scale : undefined,
    unit: line.unit ?? undefined,
    kind: resolved.kind,
  };
}

export function mergedQuantity(name: string, sources: Pick<ShoppingItemSource, "quantity" | "unit">[]): string | null {
  const qs: Quantity[] = sources.filter((s) => s.quantity != null && s.quantity > 0).map((s) => ({ amount: Number(s.quantity), unit: s.unit ?? undefined }));
  if (!qs.length) return null;
  const noun = findIngredient(name)?.countNoun;
  return sumQuantities(qs)
    .map((q) => (q.unit || !noun ? formatQuantity(q) : formatQuantity(q, noun)))
    .join(" + ");
}

const SOURCE_PRIORITY: ItemSourceType[] = ["manual", "meal_plan", "recipe", "repeat_purchase", "pantry_prediction"];

export function sourceLabel(sources: ShoppingItemSource[], opts: { intervalDays?: number } = {}): string {
  const types = new Set(sources.map((s) => s.type));
  const parts: string[] = [];
  if (types.has("manual")) parts.push("Added by you");
  const plan = sources.filter((s) => s.type === "meal_plan");
  const recipes = sources.filter((s) => s.type === "recipe");
  const recipeLabels = [...new Set([...plan, ...recipes].map((s) => s.label).filter((x): x is string => !!x))];
  if (plan.length && !types.has("manual")) parts.push(recipeLabels.length > 1 ? `Meal plan · ${recipeLabels.length} meals` : "Meal plan");
  else if (recipeLabels.length) parts.push(recipeLabels.length > 1 ? `${recipeLabels.length} recipes` : shortTitle(recipeLabels[0]!));
  if (types.has("repeat_purchase") && !parts.length) parts.push(opts.intervalDays ? `Usually buy ${describeInterval(opts.intervalDays)}` : "Usually buy this");
  if (types.has("pantry_prediction") && !parts.length) parts.push("Probably running low");
  return parts.join(" · ") || "On your list";
}

export function shortTitle(title: string): string {
  const words = title.split(" ");
  return words.length > 4 ? words.slice(0, 4).join(" ") + "…" : title;
}

export function primarySource(sources: ShoppingItemSource[]): ItemSourceType | undefined {
  return SOURCE_PRIORITY.find((t) => sources.some((s) => s.type === t));
}

/** Manual items default to "need to buy": the user asked for it, don't second-guess them. */
export function initialStatus(sourceType: ItemSourceType, pantryStatus: ItemStatus | undefined): ItemStatus {
  if (sourceType === "manual" || sourceType === "repeat_purchase") return "need_to_buy";
  return pantryStatus ?? "need_to_buy";
}

/** Plain-text export for sharing / pasting into a retailer's search. */
export function exportListText(groups: { title: string; items: { displayName: string; quantityLabel: string | null; note: string | null }[] }[]): string {
  return groups
    .filter((g) => g.items.length)
    .map((g) => `${g.title}\n${g.items.map((i) => `• ${i.displayName}${i.quantityLabel ? ` — ${i.quantityLabel}` : ""}${i.note ? ` (${i.note})` : ""}`).join("\n")}`)
    .join("\n\n");
}
