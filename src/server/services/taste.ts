import type { Ctx } from "../context";
import type { HouseholdMember, TastePreference } from "@/core/domain/types";
import type { PreferenceStatement, Reaction, TasteSignal } from "@/core/domain/schemas";
import { TasteSignals as TasteSignalsSchema } from "@/core/domain/schemas";
import { inferHabits, inferTasteProfile, recipeFeatures, type RecipeEvidence } from "@/core/services/taste";
import { cookEvents, interactionCounts, loadRecipes } from "../repos/recipes";
import { listPreferences, pruneInferred, upsertExplicit, upsertInferred } from "../repos/taste";
import { listMembers } from "../repos/misc";

/**
 * Recomputes inferred taste memory from everything the household has done.
 * Explicit and dismissed preferences are never overwritten.
 */
export async function recomputeTaste(ctx: Ctx): Promise<void> {
  const [recipes, counts, feedback, members, cooks] = await Promise.all([
    loadRecipes(ctx.sql),
    interactionCounts(ctx.sql),
    ctx.sql.query<{ recipe_id: string; household_member_id: string | null; reaction: Reaction | null; signals: unknown }>(
      "select recipe_id, household_member_id, reaction, signals from recipe_feedback order by created_at",
    ),
    listMembers(ctx.sql),
    cookEvents(ctx.sql),
  ]);
  const countOf = (recipeId: string, type: string) => counts.find((c) => String(c.recipe_id) === recipeId && c.type === type)?.n ?? 0;
  const selfIds = new Set(members.filter((m) => m.role === "self").map((m) => m.id));

  const signalsByRecipe = new Map<string, TasteSignal[]>();
  for (const f of feedback) {
    if (f.household_member_id && !selfIds.has(String(f.household_member_id))) continue;
    const parsed = f.signals ? TasteSignalsSchema.safeParse(typeof f.signals === "string" ? JSON.parse(f.signals) : f.signals) : null;
    if (parsed?.success) signalsByRecipe.set(String(f.recipe_id), [...(signalsByRecipe.get(String(f.recipe_id)) ?? []), ...parsed.data.signals]);
  }

  const evidence: RecipeEvidence[] = recipes.map((r) => ({
    recipe: r,
    saved: true,
    opens: r.openCount,
    timesCooked: r.timesCooked,
    isFavorite: r.isFavorite,
    reaction: r.rating,
    rejections: countOf(r.id, "not_interested") + countOf(r.id, "rejected") + countOf(r.id, "swapped_out") * 0.5,
    feedbackSignals: signalsByRecipe.get(r.id) ?? [],
  }));

  const keep = new Set<string>();
  const owner = { householdId: ctx.householdId, userId: ctx.userId };
  for (const p of inferTasteProfile(evidence)) {
    keep.add(`self:${p.entityType}:${p.value}`);
    await upsertInferred(ctx.sql, owner, { ...p, memberId: null });
  }

  const byId = new Map(recipes.map((r) => [r.id, r]));
  const habits = inferHabits(
    cooks
      .map((c) => ({ c, r: byId.get(String(c.recipe_id)) }))
      .filter((x) => !!x.r)
      .map(({ c, r }) => ({ at: new Date(c.created_at).toISOString(), totalTimeMinutes: r!.totalTimeMinutes, caloriesPerServing: r!.caloriesPerServing, tags: r!.tags })),
  );
  for (const h of habits) {
    keep.add(`self:${h.entityType}:${h.value}`);
    await upsertInferred(ctx.sql, owner, { ...h, memberId: null });
  }

  // Household members: what they loved / refused.
  for (const m of members.filter((x) => x.role !== "self")) {
    const theirs = feedback.filter((f) => String(f.household_member_id) === m.id && f.reaction);
    const memberEvidence: RecipeEvidence[] = theirs
      .map((f) => byId.get(String(f.recipe_id)))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => {
        const reaction = theirs.find((f) => String(f.recipe_id) === r.id)!.reaction;
        return { recipe: r, saved: false, opens: 0, timesCooked: 1, isFavorite: false, reaction, rejections: 0, feedbackSignals: [] };
      });
    const meaningful = (x: { entityType: string; value: string }) =>
      x.entityType === "cuisine" || x.entityType === "meal_type" || x.value === "spicy" || x.value === "very cheesy" || (x.entityType === "ingredient" && ["salmon", "chicken", "beef", "prawns", "tofu", "tuna", "eggs", "chickpeas", "peanut", "tahini", "harissa"].includes(x.value));
    for (const p of inferTasteProfile(memberEvidence).filter((x) => meaningful(x) && (x.evidenceCount >= 2 || Math.abs(x.score) > 0.5))) {
      keep.add(`${m.id}:${p.entityType}:${p.value}`);
      await upsertInferred(ctx.sql, owner, { ...p, memberId: m.id, source: "feedback" });
    }
  }
  await pruneInferred(ctx.sql, keep);
}

export type TasteView = {
  likes: TastePreference[];
  avoids: TastePreference[];
  habits: TastePreference[];
  members: (HouseholdMember & { likes: TastePreference[]; avoids: TastePreference[] })[];
  dismissed: TastePreference[];
  stats: { recipes: number; cooked: number; feedback: number };
};

export async function getTasteView(ctx: Ctx): Promise<TasteView> {
  const [prefs, members, stats] = await Promise.all([
    listPreferences(ctx.sql),
    listMembers(ctx.sql),
    ctx.sql.one<{ recipes: number; cooked: number; feedback: number }>(
      "select (select count(*)::int from recipes) as recipes, (select count(*)::int from recipes where times_cooked > 0) as cooked, (select count(*)::int from recipe_feedback) as feedback",
    ),
  ]);
  const active = prefs.filter((p) => p.status !== "dismissed");
  const self = active.filter((p) => p.memberId === null);
  const byStrength = (a: TastePreference, b: TastePreference) => Math.abs(b.score) * b.confidence + (b.source === "explicit" ? 1 : 0) - (Math.abs(a.score) * a.confidence + (a.source === "explicit" ? 1 : 0));
  return {
    likes: self.filter((p) => p.score > 0 && p.entityType !== "habit").sort(byStrength),
    avoids: self.filter((p) => p.score < 0 && p.entityType !== "habit").sort(byStrength),
    habits: self.filter((p) => p.entityType === "habit" && p.score > 0).sort(byStrength),
    members: members
      .filter((m) => m.role !== "self")
      .map((m) => ({
        ...m,
        likes: active.filter((p) => p.memberId === m.id && p.score > 0).sort(byStrength).slice(0, 6),
        avoids: active.filter((p) => p.memberId === m.id && p.score < 0).sort(byStrength).slice(0, 6),
      })),
    dismissed: prefs.filter((p) => p.status === "dismissed").slice(0, 20),
    stats: stats ?? { recipes: 0, cooked: 0, feedback: 0 },
  };
}

export async function applyPreferenceStatement(ctx: Ctx, text: string, parsed: PreferenceStatement): Promise<number> {
  const members = await listMembers(ctx.sql);
  const targets =
    parsed.member === "self"
      ? [null]
      : parsed.member === "partner"
        ? members.filter((m) => m.role === "partner").map((m) => m.id)
        : members.filter((m) => m.role === "child").map((m) => m.id);
  const owner = { householdId: ctx.householdId, userId: ctx.userId };
  let n = 0;
  for (const memberId of targets.length ? targets : [null]) {
    for (const p of parsed.preferences) {
      await upsertExplicit(ctx.sql, owner, { memberId, entityType: p.entityType, value: p.value, label: p.label, score: p.score, originalText: text });
      n++;
    }
  }
  return n;
}

export { recipeFeatures };
