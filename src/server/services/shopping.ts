import type { Ctx } from "../context";
import { CATEGORY_ORDER, type ShoppingCategory } from "@/core/domain/categories";
import type { ItemStatus, ParsedShoppingItem, ShoppingAction } from "@/core/domain/schemas";
import type { ReplenishmentSuggestion, ShoppingListItem } from "@/core/domain/types";
import { resolveItem, type ResolvedItem } from "@/core/services/normalization";
import { classify, describeInterval, replenishmentCandidates, typicalInterval } from "@/core/services/pantry";
import { contributionFromIngredient, findDuplicate, mergedQuantity, sourceLabel } from "@/core/services/shoppingList";
import { formatQuantity } from "@/core/text/quantity";
import { scaleAmount } from "@/core/text/quantity";
import * as repo from "../repos/shopping";
import { addPantryCorrection, pantryCorrections, planItemsBetween, purchaseHistories, recordPurchase, undoTodaysPurchase } from "../repos/misc";
import { loadRecipes } from "../repos/recipes";
import { loadPantry, type PantryLookup } from "./pantry";
import { localDate } from "../time";

export type ShoppingView = {
  need: { category: ShoppingCategory; items: ShoppingListItem[] }[];
  check: ShoppingListItem[];
  have: ShoppingListItem[];
  done: ShoppingListItem[];
  suggestions: ReplenishmentSuggestion[];
  totalOpen: number;
};

function toItem(row: repo.ItemRow, pantry: PantryLookup, intervals: Map<string, number>): ShoppingListItem {
  const hasManual = row.sources.some((s) => s.type === "manual" || s.type === "repeat_purchase");
  const estimate = pantry.estimate(row.normalizedName);
  let status: ItemStatus = row.status;
  if (!row.statusOverridden && !row.checked) status = hasManual ? "need_to_buy" : classify(estimate.probability);
  const quantityLabel =
    row.quantityOverride != null ? formatQuantity({ amount: row.quantityOverride, unit: row.unitOverride ?? undefined }) : mergedQuantity(row.normalizedName, row.sources);
  return {
    id: row.id,
    rawText: row.rawText,
    normalizedName: row.normalizedName,
    displayName: row.displayName,
    ingredientId: row.ingredientId,
    shoppingProductId: row.shoppingProductId,
    preferredRetailProductId: row.preferredRetailProductId,
    category: row.category,
    note: row.note,
    status,
    statusOverridden: row.statusOverridden,
    checked: row.checked,
    checkedAt: row.checkedAt,
    createdAt: row.createdAt,
    sources: row.sources,
    quantityLabel,
    sourceLabel: sourceLabel(row.sources, { intervalDays: intervals.get(row.normalizedName) }),
    pantryProbability: row.ingredientId ? estimate.probability : null,
  };
}

export async function getShoppingView(ctx: Ctx): Promise<ShoppingView> {
  const listId = await repo.activeListId(ctx.sql, ctx.householdId);
  const [rows, pantry, histories, corrections] = await Promise.all([repo.listItems(ctx.sql, listId), loadPantry(ctx), purchaseHistories(ctx.sql), pantryCorrections(ctx.sql)]);
  const intervals = new Map<string, number>();
  for (const [name, purchases] of histories) {
    const i = typicalInterval(name, purchases);
    if (i) intervals.set(name, i);
  }
  const items = rows.map((r) => toItem(r, pantry, intervals));
  const open = items.filter((i) => !i.checked);
  const need = open.filter((i) => i.status === "need_to_buy");
  const groups = new Map<ShoppingCategory, ShoppingListItem[]>();
  for (const i of need) groups.set(i.category, [...(groups.get(i.category) ?? []), i]);

  const onList = new Set(items.filter((i) => !i.checked || (i.checkedAt && Date.now() - new Date(i.checkedAt).getTime() < 86_400_000 * 2)).map((i) => i.normalizedName));
  const suggestions = replenishmentCandidates([...histories.entries()].map(([name, purchases]) => ({ name, purchases })))
    .filter((c) => !onList.has(c.name))
    .filter((c) => {
      const recent = (corrections.get(c.name) ?? []).find((x) => Date.now() - new Date(x.at).getTime() < c.intervalDays * 0.6 * 86_400_000);
      return !recent;
    })
    .slice(0, 4)
    .map((c) => {
      const resolved = resolveItem(c.name);
      return {
        name: c.name,
        display: resolved.display,
        category: resolved.category,
        intervalDays: c.intervalDays,
        daysSinceLast: c.daysSinceLast,
        reason: `Usually ${describeInterval(c.intervalDays)} · last bought ${c.daysSinceLast} days ago`,
      };
    });

  const byName = (a: ShoppingListItem, b: ShoppingListItem) => a.displayName.localeCompare(b.displayName);
  return {
    need: [...groups.entries()].sort((a, b) => CATEGORY_ORDER[a[0]] - CATEGORY_ORDER[b[0]]).map(([category, list]) => ({ category, items: list.sort(byName) })),
    check: open.filter((i) => i.status === "check_at_home").sort(byName),
    have: open.filter((i) => i.status === "probably_have").sort(byName),
    done: items.filter((i) => i.checked).sort((a, b) => (b.checkedAt ?? "").localeCompare(a.checkedAt ?? "")),
    suggestions,
    totalOpen: need.length,
  };
}

type Existing = repo.ItemRow;

async function reuseOrCreate(
  ctx: Ctx,
  listId: string,
  all: Existing[],
  resolved: ResolvedItem,
  init: { rawText: string; displayName: string; note?: string | null; status: ItemStatus },
): Promise<{ id: string; created: boolean; existing?: Existing }> {
  const dup = findDuplicate(resolved, all);
  if (dup) return { id: dup.id, created: false, existing: all.find((a) => a.id === dup.id) };
  // A bought (checked) item with the same name comes back rather than duplicating.
  const bought = all.find((a) => a.checked && a.normalizedName === resolved.name);
  if (bought) {
    await ctx.sql.query("delete from shopping_list_item_sources where shopping_list_item_id = $1", [bought.id]);
    await repo.updateItem(ctx.sql, bought.id, { checked: false, status: init.status, statusOverridden: false, note: init.note ?? null });
    bought.checked = false;
    bought.sources = [];
    return { id: bought.id, created: false, existing: bought };
  }
  const id = await repo.insertItem(ctx.sql, listId, ctx.householdId, {
    rawText: init.rawText,
    normalizedName: resolved.name,
    displayName: init.displayName,
    category: resolved.category,
    note: init.note,
    status: init.status,
    ingredientName: resolved.kind === "ingredient" ? resolved.name : undefined,
    productName: resolved.kind === "product" ? resolved.name : undefined,
  });
  const row: Existing = {
    id,
    rawText: init.rawText,
    normalizedName: resolved.name,
    displayName: init.displayName,
    ingredientId: null,
    shoppingProductId: null,
    preferredRetailProductId: null,
    category: resolved.category,
    note: init.note ?? null,
    status: init.status,
    statusOverridden: false,
    checked: false,
    checkedAt: null,
    createdAt: new Date().toISOString(),
    sources: [],
    quantityOverride: null,
    unitOverride: null,
  };
  all.push(row);
  return { id, created: true };
}

export type AddResult = { id: string; name: string; display: string; merged: boolean; quantity?: string | null };

export async function addManualItems(ctx: Ctx, items: ParsedShoppingItem[], sourceType: "manual" | "repeat_purchase" = "manual"): Promise<AddResult[]> {
  const listId = await repo.activeListId(ctx.sql, ctx.householdId);
  const all = await repo.listItems(ctx.sql, listId);
  const results: AddResult[] = [];
  for (const item of items) {
    const resolved = resolveItem(item.name);
    const display = resolved.kind === "unknown" ? resolved.display : resolved.display;
    const note = [resolved.brand && !item.note?.toLowerCase().includes(resolved.brand.toLowerCase()) ? resolved.brand : null, item.note].filter(Boolean).join(" · ") || null;
    const { id, created, existing } = await reuseOrCreate(ctx, listId, all, resolved, { rawText: item.rawText, displayName: display, note, status: "need_to_buy" });
    const manual = existing?.sources.find((s) => s.type === "manual");
    if (created || !existing || !manual) {
      await repo.addSource(ctx.sql, id, { type: sourceType, quantity: item.quantity ?? (item.increment && existing ? 1 : null), unit: item.unit ?? null, label: item.note ?? null });
      if (existing) existing.sources.push({ id: "new", type: sourceType, sourceId: null, label: item.note ?? null, quantity: item.quantity ?? null, unit: item.unit ?? null });
    } else if (item.increment) {
      await repo.bumpManualSource(ctx.sql, id, item.quantity ?? 1, item.unit ?? null);
    } else if (item.quantity != null) {
      await ctx.sql.query("update shopping_list_item_sources set quantity = $2, unit = $3 where id = $1", [manual.id, item.quantity, item.unit ?? null]);
    }
    if (!created && note) await repo.appendNote(ctx.sql, id, note);
    if (!created && existing?.statusOverridden) await repo.updateItem(ctx.sql, id, { status: "need_to_buy", statusOverridden: false });
    results.push({ id, name: resolved.name, display: existing?.displayName ?? display, merged: !created });
  }
  return results;
}

/** Adds (or re-adds) every ingredient of a recipe, attributed to that recipe / plan item. */
export async function addRecipeContributions(
  ctx: Ctx,
  recipeId: string,
  source: { type: "recipe" | "meal_plan"; sourceId: string; label: string },
  opts: { servings?: number | null; pantry?: PantryLookup } = {},
): Promise<number> {
  const [recipe] = await loadRecipes(ctx.sql, { ids: [recipeId] });
  if (!recipe) return 0;
  const listId = await repo.activeListId(ctx.sql, ctx.householdId);
  const all = await repo.listItems(ctx.sql, listId);
  const pantry = opts.pantry ?? (await loadPantry(ctx));
  let n = 0;
  for (const line of recipe.ingredients) {
    const amount = scaleAmount(line.amount ?? undefined, recipe.servings ?? undefined, opts.servings ?? undefined);
    const c = contributionFromIngredient({ ...line, amount: amount ?? null });
    if (!c) continue;
    const resolved = resolveItem(c.name);
    const status = classify(pantry.probability(resolved.name));
    const { id, existing } = await reuseOrCreate(ctx, listId, all, resolved, { rawText: line.rawText, displayName: resolved.display, status });
    if (existing?.sources.some((s) => s.type === source.type && s.sourceId === source.sourceId)) continue;
    await repo.addSource(ctx.sql, id, { type: source.type, sourceId: source.sourceId, label: source.label, quantity: c.quantity ?? null, unit: c.unit ?? null });
    existing?.sources.push({ id: "new", type: source.type, sourceId: source.sourceId, label: source.label, quantity: c.quantity ?? null, unit: c.unit ?? null });
    n++;
  }
  return n;
}

/**
 * Keeps meal-plan-generated items in step with the plan. Only meal_plan sources are
 * added/removed; manual sources (and so manual items) are never affected.
 */
export async function syncMealPlanSources(ctx: Ctx): Promise<void> {
  const listId = await repo.activeListId(ctx.sql, ctx.householdId);
  const today = localDate(new Date());
  const all = await planItemsBetween(ctx.sql, "1900-01-01", "2999-12-31");
  const existing = new Set(await repo.sourceIdsOfType(ctx.sql, listId, "meal_plan"));
  const allIds = new Set(all.map((i) => i.id));
  await repo.removeSourcesFor(ctx.sql, listId, "meal_plan", [...existing].filter((id) => !allIds.has(id)));
  const toAdd = all.filter((i) => i.day >= today && !existing.has(i.id));
  if (!toAdd.length) return;
  const recipes = await loadRecipes(ctx.sql, { ids: [...new Set(toAdd.map((i) => i.recipeId))] });
  const pantry = await loadPantry(ctx);
  for (const item of toAdd) {
    const r = recipes.find((x) => x.id === item.recipeId);
    if (r) await addRecipeContributions(ctx, r.id, { type: "meal_plan", sourceId: item.id, label: r.title }, { pantry });
  }
}

export async function removeRecipeFromList(ctx: Ctx, recipeId: string): Promise<void> {
  const listId = await repo.activeListId(ctx.sql, ctx.householdId);
  await repo.removeSourcesFor(ctx.sql, listId, "recipe", [recipeId]);
}

export async function setChecked(ctx: Ctx, itemId: string, checked: boolean): Promise<void> {
  const listId = await repo.activeListId(ctx.sql, ctx.householdId);
  const item = (await repo.listItems(ctx.sql, listId)).find((i) => i.id === itemId);
  if (!item || item.checked === checked) return;
  await repo.updateItem(ctx.sql, itemId, { checked });
  if (checked) {
    const q = item.quantityOverride ?? item.sources.find((s) => s.type === "manual")?.quantity ?? null;
    const preferred = item.preferredRetailProductId
      ? await ctx.sql.one<{ brand: string | null }>("select brand from retail_products where id = $1", [item.preferredRetailProductId])
      : undefined;
    await recordPurchase(ctx.sql, ctx.householdId, {
      normalizedName: item.normalizedName,
      rawName: item.displayName,
      quantity: q,
      brand: preferred?.brand ?? null,
      retailProductId: item.preferredRetailProductId,
      ingredientId: item.ingredientId,
      shoppingProductId: item.shoppingProductId,
    });
  } else {
    await undoTodaysPurchase(ctx.sql, item.normalizedName);
  }
}

/** Moving an item between sections is a pantry correction the estimator learns from. */
export async function setStatus(ctx: Ctx, itemId: string, status: ItemStatus): Promise<void> {
  const row = await ctx.sql.one<{ normalized_name: string }>("select normalized_name from shopping_list_items where id = $1", [itemId]);
  if (!row) return;
  await repo.updateItem(ctx.sql, itemId, { status, statusOverridden: true });
  if (status === "probably_have") await addPantryCorrection(ctx.sql, ctx.householdId, row.normalized_name, true);
  if (status === "need_to_buy") await addPantryCorrection(ctx.sql, ctx.householdId, row.normalized_name, false);
}

export async function dismissSuggestion(ctx: Ctx, name: string): Promise<void> {
  await addPantryCorrection(ctx.sql, ctx.householdId, name, true);
}

export type QuickAddResult = {
  added: AddResult[];
  recipe?: { id: string; title: string; count: number } | null;
  findRecipesUsing?: string[];
  showList?: boolean;
  message: string;
};

export async function applyShoppingActions(ctx: Ctx, actions: ShoppingAction[]): Promise<QuickAddResult> {
  const result: QuickAddResult = { added: [], message: "" };
  for (const action of actions) {
    if (action.type === "add_items") result.added.push(...(await addManualItems(ctx, action.items)));
    if (action.type === "show_list") result.showList = true;
    if (action.type === "find_recipes") result.findRecipesUsing = action.using;
    if (action.type === "add_recipe") {
      const recipes = await loadRecipes(ctx.sql);
      const q = action.recipeQuery.toLowerCase().replace(/\b(the|my|that)\b/g, "").trim();
      const words = q.split(/\s+/).filter((w) => w.length > 2);
      const match =
        recipes.find((r) => r.title.toLowerCase().includes(q)) ??
        recipes
          .map((r) => ({ r, hits: words.filter((w) => r.title.toLowerCase().includes(w)).length }))
          .filter((x) => x.hits > 0)
          .sort((a, b) => b.hits - a.hits || b.r.timesCooked - a.r.timesCooked)[0]?.r;
      if (match) {
        const count = await addRecipeContributions(ctx, match.id, { type: "recipe", sourceId: match.id, label: match.title });
        result.recipe = { id: match.id, title: match.title, count };
      } else result.recipe = null;
    }
  }
  const names = result.added.map((a) => a.display);
  if (result.recipe) result.message = `Added what you need for ${result.recipe.title}.`;
  else if (result.recipe === null) result.message = "Couldn't find that recipe in your library.";
  else if (names.length === 1) result.message = result.added[0]!.merged ? `${names[0]} was already on your list — updated it.` : `Added ${names[0]}.`;
  else if (names.length > 1) result.message = `Added ${names.length} items.`;
  else if (result.showList) result.message = "Here's your list.";
  return result;
}
