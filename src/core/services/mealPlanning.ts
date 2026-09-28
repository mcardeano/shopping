/**
 * MealPlanningService (pure)
 * Plans a week as a whole rather than picking each night independently:
 * base recommendation score + ingredient overlap (less waste) − repetition,
 * with day-specific requests ("make Friday more indulgent") and coverage requests
 * ("use salmon, chicken and beef").
 */
import { PACK_SIZES, ALWAYS_HAVE } from "../catalog/ingredients";
import { findIngredient, findIngredientsInText } from "./normalization";
import { mainProtein } from "./enrichment";
import { cuisineFamily } from "../domain/categories";
import { parseCookRequest, scoreCandidate, type Candidate, type CookConstraints, type RecommendationContext } from "./recommendation";

export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export type PlanBrief = {
  constraints: CookConstraints;
  /** Only these day indexes (0 = Monday). */
  days?: number[];
  dayMoods: Record<number, string[]>;
  reuseIngredients: boolean;
  coverProteins: string[];
};

export function parsePlanBrief(text: string, now = new Date()): PlanBrief {
  const t = text.toLowerCase();
  const constraints = parseCookRequest({ text }, now);
  // Weekly briefs shouldn't treat "salmon, chicken and beef" as all-in-one-recipe includes.
  const proteins = findIngredientsInText(t)
    .map((i) => i.name)
    .filter((n) => findIngredient(n)?.role === "protein")
    .map((n) => (n.startsWith("chicken") ? "chicken" : n.startsWith("beef") ? "beef" : n.includes("salmon") ? "salmon" : n));
  const brief: PlanBrief = {
    constraints: { ...constraints, include: constraints.useUp, novelty: constraints.novelty && /\bnew\b/.test(t) },
    dayMoods: {},
    reuseIngredients: /\b(reuse|re-use|overlap|waste less|less waste|food waste|share ingredients|same ingredients)\b/.test(t),
    coverProteins: /\b(using|with|use)\b/.test(t) ? [...new Set(proteins)] : [],
  };

  const range = t.match(/\b(?:only\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:to|through|-|–|until|till)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (range) {
    const a = WEEKDAYS.indexOf(range[1] as (typeof WEEKDAYS)[number]);
    const b = WEEKDAYS.indexOf(range[2] as (typeof WEEKDAYS)[number]);
    if (a >= 0 && b >= a) brief.days = Array.from({ length: b - a + 1 }, (_, i) => a + i);
  } else if (/\bweekdays? only|only weekdays|on weekdays\b/.test(t)) brief.days = [0, 1, 2, 3, 4];
  else if (/\bweekend only|only the weekend\b/.test(t)) brief.days = [5, 6];

  WEEKDAYS.forEach((day, idx) => {
    const m = t.match(new RegExp(`\\b(?:make|keep|have)?\\s*${day}\\s+(?:a\\s+bit\\s+|a\\s+little\\s+|more\\s+|extra\\s+)?(indulgent|treat|special|fun|lighter|light|healthy|quick|fresh|comforting)`)) ?? t.match(new RegExp(`\\b(indulgent|treat|special|fun|lighter|light|healthy|quick|fresh|comforting)\\s+(?:on\\s+)?${day}`));
    if (m) {
      const mood = m[1]!;
      brief.dayMoods[idx] = [mood === "treat" || mood === "special" || mood === "fun" ? "indulgent" : mood === "lighter" || mood === "light" ? "healthy" : mood];
    }
  });
  if (/\bweekend\b.*\b(indulgent|treat|fun|special)\b|\b(indulgent|treat)\b.*\bweekend\b/.test(t)) {
    brief.dayMoods[5] ??= ["indulgent"];
    brief.dayMoods[6] ??= ["indulgent"];
  }
  // Global "indulgent"/"healthy" words that were day-specific shouldn't apply to the whole week.
  if (Object.keys(brief.dayMoods).length) {
    const dayMoodSet = new Set(Object.values(brief.dayMoods).flat());
    brief.constraints.moods = brief.constraints.moods.filter((m) => !dayMoodSet.has(m) || /\bmostly|all|every\b/.test(t));
  }
  return brief;
}

export type PlanSlot = { dayIndex: number; date: string; lockedRecipeId?: string };

export type PlannedMeal = { dayIndex: number; date: string; recipeId: string; reason: string };

function perishableIngredients(r: Candidate): string[] {
  return r.ingredients
    .map((i) => i.normalizedName)
    .filter((n) => {
      const ing = findIngredient(n);
      return !!ing && !ALWAYS_HAVE.has(n) && (ing.role === "herb" || ing.role === "veg" || ing.role === "fruit" || ing.category === "Dairy & Eggs") && (ing.stapleness ?? 0) < 0.5;
    });
}

type Choice = { slot: PlanSlot; recipe: Candidate; base: number };

function weekObjective(choices: Choice[], brief: PlanBrief): { total: number; shared: Map<string, string[]> } {
  let total = choices.reduce((s, c) => s + c.base, 0);
  const byIngredient = new Map<string, string[]>();
  for (const c of choices) for (const p of new Set(perishableIngredients(c.recipe))) byIngredient.set(p, [...(byIngredient.get(p) ?? []), c.recipe.id]);
  const overlapWeight = brief.reuseIngredients ? 0.09 : 0.035;
  for (const [name, ids] of byIngredient) {
    if (ids.length >= 2) total += overlapWeight * (ids.length - 1) * (PACK_SIZES[name] ? 1.4 : 1);
  }
  // Repetition: same protein on consecutive days, too much of one cuisine, duplicates.
  const sorted = [...choices].sort((a, b) => a.slot.dayIndex - b.slot.dayIndex);
  for (let i = 1; i < sorted.length; i++) {
    const a = mainProtein(sorted[i - 1]!.recipe.ingredients.map((x) => x.normalizedName));
    const b = mainProtein(sorted[i]!.recipe.ingredients.map((x) => x.normalizedName));
    if (a && a === b) total -= 0.12;
  }
  const cuisineCounts = new Map<string, number>();
  const proteinCounts = new Map<string, number>();
  for (const c of choices) {
    const f = cuisineFamily(c.recipe.cuisine) ?? "other";
    cuisineCounts.set(f, (cuisineCounts.get(f) ?? 0) + 1);
    const p = mainProtein(c.recipe.ingredients.map((x) => x.normalizedName)) ?? "veg";
    proteinCounts.set(p, (proteinCounts.get(p) ?? 0) + 1);
  }
  for (const n of cuisineCounts.values()) if (n > Math.ceil(choices.length / 2)) total -= 0.08 * (n - Math.ceil(choices.length / 2));
  for (const n of proteinCounts.values()) if (n > 2) total -= 0.1 * (n - 2);
  const ids = choices.map((c) => c.recipe.id);
  if (new Set(ids).size !== ids.length) total -= 10;
  for (const protein of brief.coverProteins) {
    if (!choices.some((c) => mainProtein(c.recipe.ingredients.map((x) => x.normalizedName)) === protein)) total -= 0.5;
  }
  return { total, shared: byIngredient };
}

/**
 * Chooses recipes for the given empty slots. Locked slots are kept and still count
 * toward overlap/variety. Greedy initialisation, then pairwise-swap local search.
 */
export function planWeek(
  slots: PlanSlot[],
  candidates: Candidate[],
  brief: PlanBrief,
  ctx: RecommendationContext,
  lockedRecipes: Map<number, Candidate>,
): PlannedMeal[] {
  const baseFor = (r: Candidate, dayIndex: number): number | null => {
    const moods = brief.dayMoods[dayIndex];
    const isWeekday = dayIndex <= 3;
    const c: CookConstraints = {
      ...brief.constraints,
      moods: moods ? [...brief.constraints.moods, ...moods] : brief.constraints.moods,
      isWeekday,
      // A treat night shouldn't be capped by a global time/calorie limit meant for weeknights.
      maxMinutes: moods?.includes("indulgent") ? undefined : brief.constraints.maxMinutes,
      maxCalories: moods?.includes("indulgent") ? undefined : brief.constraints.maxCalories,
    };
    const s = scoreCandidate(r, c, ctx);
    if (!s) return null;
    let base = s.score;
    if (moods?.includes("indulgent")) base += (r.caloriesPerServing ?? 0) >= 620 || r.tags.includes("indulgent") ? 0.2 : -0.05;
    if (moods?.includes("healthy")) base += (r.caloriesPerServing ?? 999) <= 520 ? 0.15 : -0.1;
    if (moods?.includes("quick")) base += (r.totalTimeMinutes ?? 99) <= 25 ? 0.15 : -0.1;
    if (brief.coverProteins.length) {
      const p = mainProtein(r.ingredients.map((x) => x.normalizedName));
      base += p && brief.coverProteins.includes(p) ? 0.12 : -0.08;
    }
    return base;
  };

  const locked: Choice[] = [...lockedRecipes.entries()].map(([dayIndex, recipe]) => ({
    slot: { dayIndex, date: "", lockedRecipeId: recipe.id },
    recipe,
    base: baseFor(recipe, dayIndex) ?? 0,
  }));
  const lockedIds = new Set(locked.map((l) => l.recipe.id));
  const pool = candidates.filter((c) => !lockedIds.has(c.id));

  // Precompute base scores per slot.
  const baseTable = new Map<string, number>();
  for (const slot of slots) for (const r of pool) {
    const b = baseFor(r, slot.dayIndex);
    if (b != null) baseTable.set(`${slot.dayIndex}:${r.id}`, b);
  }

  // Greedy: fill slots in order of fewest viable options.
  const chosen: Choice[] = [];
  const used = new Set<string>();
  const order = [...slots].sort((a, b) => a.dayIndex - b.dayIndex);
  for (const slot of order) {
    let best: Choice | undefined;
    let bestTotal = -Infinity;
    for (const r of pool) {
      if (used.has(r.id)) continue;
      const base = baseTable.get(`${slot.dayIndex}:${r.id}`);
      if (base == null) continue;
      const trial = [...locked, ...chosen, { slot, recipe: r, base }];
      const { total } = weekObjective(trial, brief);
      if (total > bestTotal) {
        bestTotal = total;
        best = { slot, recipe: r, base };
      }
    }
    if (best) {
      chosen.push(best);
      used.add(best.recipe.id);
    }
  }

  // Local search: try replacing each choice with an unused candidate.
  for (let iter = 0; iter < 3; iter++) {
    let improved = false;
    for (let i = 0; i < chosen.length; i++) {
      const current = weekObjective([...locked, ...chosen], brief).total;
      for (const r of pool) {
        if (used.has(r.id)) continue;
        const base = baseTable.get(`${chosen[i]!.slot.dayIndex}:${r.id}`);
        if (base == null) continue;
        const trial = [...chosen];
        trial[i] = { slot: chosen[i]!.slot, recipe: r, base };
        if (weekObjective([...locked, ...trial], brief).total > current + 0.001) {
          used.delete(chosen[i]!.recipe.id);
          chosen[i] = trial[i]!;
          used.add(r.id);
          improved = true;
          break;
        }
      }
    }
    if (!improved) break;
  }

  const { shared } = weekObjective([...locked, ...chosen], brief);
  const dayName = (i: number) => WEEKDAYS[i]!.charAt(0).toUpperCase() + WEEKDAYS[i]!.slice(1);
  return chosen
    .sort((a, b) => a.slot.dayIndex - b.slot.dayIndex)
    .map((c) => {
      const others = [...locked, ...chosen].filter((o) => o.recipe.id !== c.recipe.id);
      const sharedWith = perishableIngredients(c.recipe)
        .filter((p) => (shared.get(p)?.length ?? 0) >= 2)
        .map((p) => ({ p, other: others.find((o) => o.recipe.ingredients.some((x) => x.normalizedName === p)) }))
        .filter((x) => !!x.other);
      const moods = brief.dayMoods[c.slot.dayIndex];
      let reason: string;
      if (moods?.includes("indulgent")) reason = `Your ${dayName(c.slot.dayIndex)} treat.`;
      else if (sharedWith.length) {
        const first = sharedWith[0]!;
        reason = `Shares ${sharedWith.slice(0, 2).map((x) => x.p).join(" and ")} with ${dayName(first.other!.slot.dayIndex)}'s ${first.other!.recipe.title.split(" ").slice(0, 3).join(" ")} — less waste.`;
      } else if (c.recipe.rating === "loved") reason = "A favourite you haven't had in a while.";
      else if (c.recipe.timesCooked === 0) reason = "Something new from your saves.";
      else if ((c.recipe.totalTimeMinutes ?? 99) <= 30) reason = `Quick — ${c.recipe.totalTimeMinutes} minutes.`;
      else reason = "Fits your taste and adds variety.";
      return { dayIndex: c.slot.dayIndex, date: c.slot.date, recipeId: c.recipe.id, reason };
    });
}
