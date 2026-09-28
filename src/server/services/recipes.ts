import type { Ctx } from "../context";
import type { Recipe } from "@/core/domain/types";
import type { Reaction, RecipeDraft, TasteSignals } from "@/core/domain/schemas";
import { enrichDraft, buildSemanticText } from "@/core/services/enrichment";
import { embedText, cosine } from "@/core/services/embedding";
import { parseLibraryQuery, type LibraryFilters } from "@/core/services/search";
import { cuisineFamily } from "@/core/domain/categories";
import * as repo from "../repos/recipes";
import { listMembers } from "../repos/misc";
import { recomputeTaste } from "./taste";
import { removeRecipeFromList, syncMealPlanSources } from "./shopping";

/** Enrichment + semantic representation for a draft, ready to write. */
export async function prepareWrite(ctx: Ctx, draft: RecipeDraft, embed: (text: string) => Promise<number[]> = async (t) => embedText(t)): Promise<repo.RecipeWrite> {
  const enriched = enrichDraft(draft);
  const semanticText = buildSemanticText({
    title: enriched.title,
    description: enriched.description,
    cuisine: enriched.cuisine,
    tags: enriched.tags,
    flavors: enriched.flavors,
    techniques: enriched.techniques,
    totalTimeMinutes: enriched.totalTimeMinutes,
    caloriesPerServing: enriched.caloriesPerServing,
    proteinGrams: enriched.proteinGrams,
    ingredientNames: enriched.ingredients.map((i) => i.name),
  });
  const ingredientIds = await repo.ingredientIdMap(ctx.sql, enriched.ingredients.map((i) => i.name));
  return { ...enriched, semanticText, embedding: await embed(semanticText), ingredientIds };
}

export async function saveRecipe(ctx: Ctx, draft: RecipeDraft): Promise<string> {
  const write = await prepareWrite(ctx, draft);
  const id = await repo.insertRecipe(ctx.sql, { householdId: ctx.householdId, userId: ctx.userId }, write);
  await repo.recordInteraction(ctx.sql, ctx, "saved", id);
  return id;
}

export async function editRecipe(ctx: Ctx, id: string, draft: RecipeDraft): Promise<void> {
  const write = await prepareWrite(ctx, draft);
  await repo.updateRecipe(ctx.sql, id, write);
}

export async function removeRecipe(ctx: Ctx, id: string): Promise<void> {
  await repo.deleteRecipe(ctx.sql, id);
  await removeRecipeFromList(ctx, id);
  await syncMealPlanSources(ctx);
}

export async function toggleFavorite(ctx: Ctx, id: string, favorite: boolean): Promise<void> {
  await repo.setFavorite(ctx.sql, id, favorite);
  await repo.recordInteraction(ctx.sql, ctx, favorite ? "favorited" : "unfavorited", id);
  await recomputeTaste(ctx);
}

export async function cookRecipe(ctx: Ctx, id: string): Promise<void> {
  await repo.markCooked(ctx.sql, id);
  await repo.recordInteraction(ctx.sql, ctx, "cooked", id);
  await recomputeTaste(ctx);
}

export async function openRecipe(ctx: Ctx, id: string): Promise<void> {
  await repo.incrementOpen(ctx.sql, id);
  await repo.recordInteraction(ctx.sql, ctx, "opened", id);
}

/**
 * Stores feedback exactly as written plus its structured interpretation, applies
 * household reactions mentioned in the text, and refreshes taste memory.
 */
export async function submitFeedback(
  ctx: Ctx,
  recipeId: string,
  input: { reaction?: Reaction; comment?: string; memberId?: string },
  signals: TasteSignals | null,
): Promise<void> {
  const members = await listMembers(ctx.sql);
  const memberId = input.memberId && members.some((m) => m.id === input.memberId) ? input.memberId : ctx.selfMemberId;
  const owner = { householdId: ctx.householdId, userId: ctx.userId };
  await repo.insertFeedback(ctx.sql, owner, { recipeId, memberId, reaction: input.reaction ?? null, comment: input.comment?.trim() || null, signals });
  if (memberId === ctx.selfMemberId && input.reaction) await repo.setRating(ctx.sql, recipeId, input.reaction);

  // "My kids loved this one" → a reaction for each child, without asking.
  for (const h of signals?.household ?? []) {
    const targets = members.filter((m) => (h.member === "partner" ? m.role === "partner" : h.member === "everyone" ? m.role !== "self" : m.role === "child"));
    for (const t of targets) await repo.insertFeedback(ctx.sql, owner, { recipeId, memberId: t.id, reaction: h.reaction, comment: null, signals: null });
  }
  await recomputeTaste(ctx);
}

export async function rejectRecommendation(ctx: Ctx, recipeId: string): Promise<void> {
  await repo.recordInteraction(ctx.sql, ctx, "not_interested", recipeId);
  await recomputeTaste(ctx);
}

// ── Library & search ──────────────────────────────────────────────────────────

export type LibraryResult = { recipes: Recipe[]; understood: string[]; semantic: boolean };

const CHIP_FILTERS: Record<string, (r: Recipe) => boolean> = {
  favorites: (r) => r.isFavorite,
  cooked: (r) => r.timesCooked > 0,
  "not-cooked": (r) => r.timesCooked === 0,
  quick: (r) => (r.totalTimeMinutes ?? 99) <= 30,
  asian: (r) => cuisineFamily(r.cuisine) === "asian",
  mediterranean: (r) => cuisineFamily(r.cuisine) === "mediterranean",
  "middle-eastern": (r) => cuisineFamily(r.cuisine) === "middle eastern",
  "high-protein": (r) => (r.proteinGrams ?? 0) >= 30,
  "kids-liked": (r) => r.household.some((h) => h.role === "child" && h.reaction !== "not_for_me"),
  instagram: (r) => r.sourcePlatform === "instagram",
};

function applyFilters(r: Recipe, f: LibraryFilters): boolean {
  if (f.favorites && !r.isFavorite) return false;
  if (f.cooked && r.timesCooked === 0) return false;
  if (f.notCooked && r.timesCooked > 0) return false;
  if (f.loved && r.rating !== "loved" && !r.isFavorite) return false;
  if (f.source && r.sourcePlatform !== f.source) return false;
  if (f.savedAfter && r.createdAt < f.savedAfter) return false;
  if (f.savedBefore && r.createdAt >= f.savedBefore) return false;
  if (f.kidsLiked && !r.household.some((h) => h.role === "child" && h.reaction !== "not_for_me")) return false;
  if (f.partnerLiked && !r.household.some((h) => h.role === "partner" && h.reaction !== "not_for_me")) return false;
  if (f.maxMinutes && (r.totalTimeMinutes ?? 999) > f.maxMinutes) return false;
  if (f.maxCalories && (r.caloriesPerServing ?? 9999) > f.maxCalories) return false;
  if (f.highProtein && (r.proteinGrams ?? 0) < 30) return false;
  if (f.cuisines.length && !f.cuisines.some((c) => c === r.cuisine?.toLowerCase() || c === cuisineFamily(r.cuisine))) return false;
  const names = r.ingredients.map((i) => i.normalizedName);
  if (f.ingredients.length && !f.ingredients.every((i) => names.some((n) => n === i || n.includes(i) || i.includes(n)) || r.title.toLowerCase().includes(i))) return false;
  if (f.exclude.some((e) => names.some((n) => n.includes(e)) || r.title.toLowerCase().includes(e))) return false;
  if (f.tags.length && !f.tags.every((t) => r.tags.includes(t) || (t === "bowl" && /bowl/i.test(r.title)) || (t === "salad" && /salad/i.test(r.title)))) return false;
  return true;
}

export async function searchLibrary(ctx: Ctx, query: string, chip?: string): Promise<LibraryResult> {
  const all = await repo.loadRecipes(ctx.sql, { withEmbedding: !!query.trim() });
  let recipes: (Recipe & { embedding?: number[] })[] = all;
  if (chip && CHIP_FILTERS[chip]) recipes = recipes.filter(CHIP_FILTERS[chip]!);
  const q = query.trim();
  if (!q) return { recipes: strip(recipes), understood: [], semantic: false };

  await repo.recordInteraction(ctx.sql, ctx, "searched", null, { query: q.slice(0, 300) });
  const parsed = parseLibraryQuery(q);
  let filtered = recipes.filter((r) => applyFilters(r, parsed.filters));

  // "Similar to the Korean beef bowl": rank everything by closeness to that recipe.
  if (parsed.filters.similarTo) {
    const needle = parsed.filters.similarTo.toLowerCase().replace(/\b(the|my|that)\b/g, "").trim();
    const target = all.find((r) => r.title.toLowerCase().includes(needle)) ?? all.find((r) => needle.split(" ").filter((w) => w.length > 3).every((w) => r.title.toLowerCase().includes(w)));
    if (target?.embedding) {
      const ranked = filtered
        .filter((r) => r.id !== target.id && r.embedding)
        .map((r) => ({ r, s: cosine(target.embedding!, r.embedding!) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 8)
        .map((x) => x.r);
      return { recipes: strip(ranked), understood: [`Similar to ${target.title}`], semantic: true };
    }
  }

  const residual = parsed.residual;
  if (residual.length >= 3) {
    const qv = embedText(residual);
    const keyword = (r: Recipe) => {
      const hay = `${r.title} ${r.description ?? ""} ${r.tags.join(" ")} ${r.cuisine ?? ""} ${r.ingredients.map((i) => i.normalizedName).join(" ")}`.toLowerCase();
      return residual.split(" ").filter((w) => w.length > 2 && hay.includes(w)).length / Math.max(1, residual.split(" ").length);
    };
    const scored = filtered.map((r) => ({ r, s: (r.embedding ? cosine(qv, r.embedding) : 0) + keyword(r) * 0.6 }));
    const best = Math.max(...scored.map((x) => x.s), 0);
    // Keep results that are meaningfully related; structured filters already did the hard narrowing.
    filtered = scored
      .filter((x) => x.s >= Math.max(0.12, best * 0.45))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.r);
    return { recipes: strip(filtered), understood: parsed.understood, semantic: true };
  }
  return { recipes: strip(filtered), understood: parsed.understood, semantic: false };
}

function strip(rs: (Recipe & { embedding?: number[] })[]): Recipe[] {
  return rs.map(({ embedding: _e, ...r }) => r);
}
