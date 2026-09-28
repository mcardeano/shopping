import type { Ctx } from "../context";
import type { Recipe } from "@/core/domain/types";
import type { RecommendBody } from "@/core/domain/schemas";
import { averageVectors, embedText } from "@/core/services/embedding";
import { parseCookRequest, recommend, type Candidate, type Preference, type RecommendationContext } from "@/core/services/recommendation";
import { interactionCounts, loadRecipes, recordInteraction, type RecipeWithEmbedding } from "../repos/recipes";
import { listPreferences } from "../repos/taste";
import { listMembers, planItemsBetween } from "../repos/misc";
import { loadPantry } from "./pantry";
import { addDays, localDate } from "../time";

export type RecommendationResult = { recipe: Recipe; reason: string; pantryHits: string[] };

export async function buildRecommendationContext(ctx: Ctx, recipes: RecipeWithEmbedding[], queryText: string): Promise<RecommendationContext> {
  const [prefs, members, pantry, counts] = await Promise.all([listPreferences(ctx.sql), listMembers(ctx.sql), loadPantry(ctx), interactionCounts(ctx.sql, 21)]);
  const today = localDate(new Date());
  const planned = await planItemsBetween(ctx.sql, addDays(today, -2), addDays(today, 6));
  const roleOf = new Map(members.map((m) => [m.id, m.role]));
  const preferences: Preference[] = prefs
    .filter((p) => p.status !== "dismissed")
    .map((p) => ({ entityType: p.entityType, value: p.value, label: p.label, score: p.score, confidence: p.confidence, memberRole: p.memberId ? roleOf.get(p.memberId) ?? "other" : "self" }));

  const liked = recipes.filter((r) => r.embedding && (r.rating === "loved" || r.isFavorite || r.timesCooked >= 2));
  const tasteEmbedding = averageVectors(liked.map((r) => ({ v: r.embedding!, w: (r.rating === "loved" ? 1.5 : 1) + Math.min(3, r.timesCooked) * 0.3 })));
  const recent = new Set(planned.map((p) => p.recipeId));
  for (const r of recipes) if (r.lastCookedAt && Date.now() - new Date(r.lastCookedAt).getTime() < 2 * 86_400_000) recent.add(r.id);

  return {
    now: new Date(),
    preferences,
    pantry: pantry.probability,
    recentRecipeIds: recent,
    rejectedRecipeIds: new Set(counts.filter((c) => c.type === "not_interested").map((c) => String(c.recipe_id))),
    queryEmbedding: queryText.trim() ? embedText(queryText) : undefined,
    tasteEmbedding,
    library: recipes as Candidate[],
  };
}

export async function recommendForViewer(ctx: Ctx, body: RecommendBody, opts: { record?: boolean } = {}): Promise<{ results: RecommendationResult[]; understood: string[] }> {
  const recipes = await loadRecipes(ctx.sql, { withEmbedding: true });
  const constraints = parseCookRequest({ text: body.query, mood: body.mood, maxMinutes: body.maxMinutes, useUp: body.useUp });
  const rc = await buildRecommendationContext(ctx, recipes, [body.query, body.mood && body.mood !== "Anything" ? body.mood : ""].join(" "));
  for (const id of body.exclude) rc.rejectedRecipeIds.add(id);
  if (body.query.trim() && opts.record !== false) await recordInteraction(ctx.sql, ctx, "searched", null, { query: body.query.slice(0, 300) });

  let picks = recommend(recipes as Candidate[], constraints, rc, body.limit);
  // Never leave someone with nothing: relax hard constraints progressively.
  if (!picks.length && (constraints.maxMinutes || constraints.cuisines.length || constraints.maxCalories)) {
    picks = recommend(recipes as Candidate[], { ...constraints, maxMinutes: constraints.maxMinutes ? constraints.maxMinutes + 20 : undefined, cuisines: [], maxCalories: undefined }, rc, body.limit);
  }
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const understood: string[] = [];
  if (constraints.maxMinutes) understood.push(`≤ ${constraints.maxMinutes} min`);
  for (const c of constraints.cuisines) understood.push(c.replace(/\b\w/g, (x) => x.toUpperCase()));
  for (const i of constraints.include) understood.push(i.charAt(0).toUpperCase() + i.slice(1));
  for (const m of constraints.moods) understood.push(m.charAt(0).toUpperCase() + m.slice(1));
  if (constraints.highProtein) understood.push("High protein");
  if (constraints.maxCalories) understood.push(`< ${constraints.maxCalories} kcal`);
  if (constraints.audience === "kids") understood.push("Kids will eat it");
  if (constraints.audience === "everyone") understood.push("Everyone");
  if (constraints.novelty) understood.push("Something new");
  if (constraints.useWhatIHave) understood.push("Use what I have");
  for (const e of constraints.exclude) understood.push(`No ${e}`);

  return {
    results: picks.map((p) => {
      const { embedding: _e, ...recipe } = byId.get(p.scored.recipe.id)!;
      return { recipe, reason: p.reason, pantryHits: p.scored.pantryHits };
    }),
    understood,
  };
}
