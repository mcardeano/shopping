import type { Ctx } from "../context";
import type { PantryEstimate } from "@/core/domain/types";
import { estimatePantry } from "@/core/services/pantry";
import { pantryCorrections, purchaseHistories } from "../repos/misc";
import { cookEvents } from "../repos/recipes";

export type PantryLookup = { estimate: (name: string) => PantryEstimate; probability: (name: string) => number };

/** Loads purchase history, corrections and recent cooking once, then answers per-ingredient. */
export async function loadPantry(ctx: Ctx): Promise<PantryLookup> {
  const [histories, corrections, cooks] = await Promise.all([purchaseHistories(ctx.sql), pantryCorrections(ctx.sql), cookEvents(ctx.sql)]);
  const recipeIds = [...new Set(cooks.map((c) => String(c.recipe_id)))];
  const ingRows = recipeIds.length
    ? await ctx.sql.query<{ recipe_id: string; normalized_name: string }>("select recipe_id, normalized_name from recipe_ingredients where recipe_id = any($1::uuid[])", [recipeIds])
    : [];
  const byRecipe = new Map<string, Set<string>>();
  for (const r of ingRows) {
    const k = String(r.recipe_id);
    if (!byRecipe.has(k)) byRecipe.set(k, new Set());
    byRecipe.get(k)!.add(r.normalized_name);
  }
  const cache = new Map<string, PantryEstimate>();
  const now = new Date();
  const estimate = (name: string): PantryEstimate => {
    const hit = cache.get(name);
    if (hit) return hit;
    const purchases = histories.get(name) ?? [];
    const last = purchases.reduce((m, p) => Math.max(m, new Date(p).getTime()), 0);
    const uses = last ? cooks.filter((c) => new Date(c.created_at).getTime() > last && byRecipe.get(String(c.recipe_id))?.has(name)).length : 0;
    const e = estimatePantry(name, { purchases, corrections: corrections.get(name) ?? [], usesSinceLastPurchase: uses }, now);
    cache.set(name, e);
    return e;
  };
  return { estimate, probability: (name) => estimate(name).probability };
}
