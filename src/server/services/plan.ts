import type { Ctx } from "../context";
import type { MealPlan, Recipe } from "@/core/domain/types";
import { parsePlanBrief, planWeek, type PlanSlot } from "@/core/services/mealPlanning";
import { recommend, parseCookRequest, type Candidate } from "@/core/services/recommendation";
import { loadRecipes, recordInteraction } from "../repos/recipes";
import { deletePlanItem, ensurePlan, getPlan, setPlanBrief, setPlanItemLocked, upsertPlanItem } from "../repos/misc";
import { buildRecommendationContext } from "./recommend";
import { syncMealPlanSources } from "./shopping";
import { addDays, dayIndex, localDate } from "../time";

export type WeekView = { plan: MealPlan; recipes: Record<string, Recipe>; days: string[]; today: string };

export async function getWeek(ctx: Ctx, weekStart: string): Promise<WeekView> {
  const plan = await getPlan(ctx.sql, weekStart);
  const recipes = await loadRecipes(ctx.sql, { ids: [...new Set(plan.items.map((i) => i.recipeId))] });
  return {
    plan,
    recipes: Object.fromEntries(recipes.map((r) => [r.id, r])),
    days: Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    today: localDate(new Date()),
  };
}

export async function addToPlan(ctx: Ctx, day: string, recipeId: string): Promise<void> {
  const weekStart = addDays(day, -dayIndex(day));
  const planId = await ensurePlan(ctx.sql, ctx.householdId, weekStart);
  // Something you picked yourself is kept when the week is regenerated.
  await upsertPlanItem(ctx.sql, planId, day, recipeId, null, true);
  await recordInteraction(ctx.sql, ctx, "planned", recipeId);
  await syncMealPlanSources(ctx);
}

export async function removeFromPlan(ctx: Ctx, itemId: string): Promise<void> {
  await deletePlanItem(ctx.sql, itemId);
  await syncMealPlanSources(ctx);
}

export async function lockPlanItem(ctx: Ctx, itemId: string, locked: boolean): Promise<void> {
  await setPlanItemLocked(ctx.sql, itemId, locked);
}

/**
 * Plans N dinners for the week, optimising across the week. Locked meals are kept;
 * unlocked meals are replaced ("regenerate"), empty future days are filled first.
 */
export async function generateWeek(ctx: Ctx, weekStart: string, count: number, brief: string): Promise<{ planned: number }> {
  const planId = await ensurePlan(ctx.sql, ctx.householdId, weekStart);
  await setPlanBrief(ctx.sql, planId, brief || null);
  const plan = await getPlan(ctx.sql, weekStart);
  const today = localDate(new Date());
  const parsed = parsePlanBrief(brief);
  const allowed = (parsed.days ?? [0, 1, 2, 3, 4, 5, 6]).map((i) => addDays(weekStart, i)).filter((d) => d >= today || weekStart > today);

  const lockedItems = plan.items.filter((i) => i.locked || i.day < today);
  const unlocked = plan.items.filter((i) => !i.locked && i.day >= today);
  // Regenerate: clear unlocked meals, then fill.
  for (const u of unlocked) await deletePlanItem(ctx.sql, u.id);

  const takenDays = new Set(lockedItems.map((i) => i.day));
  const free = allowed.filter((d) => !takenDays.has(d));
  const target = Math.max(0, Math.min(count - lockedItems.filter((i) => allowed.includes(i.day)).length, free.length));
  const slots: PlanSlot[] = spreadDays(free, target).map((d) => ({ dayIndex: dayIndex(d), date: d }));

  const recipes = await loadRecipes(ctx.sql, { withEmbedding: true });
  const rc = await buildRecommendationContext(ctx, recipes, brief);
  for (const u of unlocked) rc.recentRecipeIds.delete(u.recipeId);
  const lockedMap = new Map<number, Candidate>();
  for (const l of lockedItems) {
    const r = recipes.find((x) => x.id === l.recipeId);
    if (r) lockedMap.set(dayIndex(l.day), r as Candidate);
  }
  const dinners = recipes.filter((r) => !r.mealType || r.mealType === "dinner" || r.mealType === "lunch") as Candidate[];
  const chosen = planWeek(slots, dinners, parsed, rc, lockedMap);
  for (const c of chosen) {
    await upsertPlanItem(ctx.sql, planId, c.date, c.recipeId, c.reason, false);
    await recordInteraction(ctx.sql, ctx, "planned", c.recipeId);
  }
  await syncMealPlanSources(ctx);
  return { planned: chosen.length };
}

/** Prefer spreading meals out (Mon/Wed/Fri) when fewer dinners than days. */
function spreadDays(days: string[], n: number): string[] {
  if (n >= days.length) return days;
  if (n <= 0) return [];
  // Weekdays first; people plan dinners for busy nights.
  const sorted = [...days].sort((a, b) => a.localeCompare(b));
  if (n <= 4 && sorted.length >= n) return sorted.slice(0, n);
  const step = sorted.length / n;
  return Array.from({ length: n }, (_, i) => sorted[Math.floor(i * step)]!);
}

export async function swapMeal(ctx: Ctx, weekStart: string, itemId: string): Promise<void> {
  const plan = await getPlan(ctx.sql, weekStart);
  const item = plan.items.find((i) => i.id === itemId);
  if (!item) return;
  const recipes = await loadRecipes(ctx.sql, { withEmbedding: true });
  const rc = await buildRecommendationContext(ctx, recipes, plan.brief ?? "");
  const weekIds = new Set(plan.items.map((i) => i.recipeId));
  for (const id of weekIds) rc.rejectedRecipeIds.add(id);
  const brief = parsePlanBrief(plan.brief ?? "");
  const constraints = { ...parseCookRequest({ text: plan.brief ?? "" }), include: [], moods: [...brief.constraints.moods, ...(brief.dayMoods[dayIndex(item.day)] ?? [])], isWeekday: dayIndex(item.day) <= 3 };
  const [pick] = recommend(recipes as Candidate[], constraints, rc, 1);
  if (!pick) return;
  await recordInteraction(ctx.sql, ctx, "swapped_out", item.recipeId);
  const planId = plan.id!;
  await upsertPlanItem(ctx.sql, planId, item.day, pick.scored.recipe.id, pick.reason, false);
  await syncMealPlanSources(ctx);
}
