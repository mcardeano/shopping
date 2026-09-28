/**
 * RecommendationService (pure scoring)
 *
 * Interpretable, weighted scoring — no opaque ML:
 *   0.30 taste · 0.20 pantry · 0.15 history · 0.15 request · 0.10 time · 0.05 nutrition · 0.05 novelty
 * plus household and recency adjustments. Every recommendation carries a one-sentence reason
 * built from the factors that actually drove its score. Scores are never shown to users.
 */
import type { HouseholdReaction } from "../domain/types";
import type { Reaction, TasteEntityType } from "../domain/schemas";
import { cuisineFamily } from "../domain/categories";
import { ALWAYS_HAVE } from "../catalog/ingredients";
import { capitalize, cleanPhrase, findIngredient, findIngredientsInText, QUERY_STOPWORDS } from "./normalization";
import { cosine } from "./embedding";
import { mainProtein } from "./enrichment";
import { recipeFeatures, type RecipeLike } from "./taste";

export const WEIGHTS = { taste: 0.3, pantry: 0.2, history: 0.15, request: 0.15, time: 0.1, nutrition: 0.05, novelty: 0.05 };

export type Candidate = RecipeLike & {
  timesCooked: number;
  lastCookedAt: string | null;
  isFavorite: boolean;
  rating: Reaction | null;
  createdAt: string;
  proteinGrams: number | null;
  sourcePlatform: string | null;
  household: HouseholdReaction[];
  embedding?: number[];
  ingredients: { normalizedName: string; optional?: boolean }[];
};

export type Preference = { entityType: TasteEntityType; value: string; label: string; score: number; confidence: number; memberRole?: string | null };

export type CookConstraints = {
  text: string;
  maxMinutes?: number;
  maxCalories?: number;
  highProtein: boolean;
  cuisines: string[]; // families or specific cuisines, lowercase
  include: string[]; // canonical ingredient names to use
  useUp: string[]; // explicit "use up" ingredients (stronger)
  exclude: string[]; // free terms: ingredient names, "pasta", "spicy"
  moods: string[];
  audience: "kids" | "everyone" | "me" | "partner" | null;
  novelty: boolean;
  useWhatIHave: boolean;
  similarTo?: string;
  isWeekday: boolean;
};

export type RecommendationContext = {
  now: Date;
  preferences: Preference[];
  pantry: (name: string) => number;
  /** Planned this week or cooked very recently. */
  recentRecipeIds: Set<string>;
  rejectedRecipeIds: Set<string>;
  queryEmbedding?: number[];
  tasteEmbedding?: number[];
  /** Library, used to explain "similar to the X you cooked". */
  library: Candidate[];
};

const MOOD_WORDS: Record<string, string[]> = {
  fresh: ["fresh", "light", "zingy", "summery", "crisp", "bright"],
  comforting: ["comforting", "comfort", "cozy", "cosy", "hearty", "warming", "warm", "something warm"],
  healthy: ["healthy", "healthier", "clean", "lighter", "light", "nutritious", "balanced"],
  indulgent: ["indulgent", "treat", "decadent", "naughty", "fun", "cheat"],
  spicy: ["spicy", "hot", "fiery", "kick"],
};

const CUISINE_QUERY: Record<string, string> = {
  asian: "asian", japanese: "japanese", korean: "korean", thai: "thai", chinese: "chinese", vietnamese: "vietnamese", indonesian: "indonesian",
  mediterranean: "mediterranean", greek: "greek", italian: "italian", "middle eastern": "middle eastern", lebanese: "middle eastern", levantine: "middle eastern", "north african": "north african", moroccan: "north african",
};

export function parseCookRequest(input: { text?: string; mood?: string; maxMinutes?: number; useUp?: string }, now = new Date()): CookConstraints {
  const raw = [input.text ?? "", input.mood && input.mood !== "Anything" ? input.mood : ""].join(" ").trim();
  const t = cleanPhrase(raw.replace(/[’]/g, "'"));
  const c: CookConstraints = {
    text: raw,
    highProtein: /\b(high[ -]?protein|protein[ -]?packed|lots of protein|gym)\b/.test(t),
    cuisines: [],
    include: [],
    useUp: [],
    exclude: [],
    moods: [],
    audience: null,
    novelty: /\b(something new|new|different|haven'?t (?:cooked|made|tried)|never (?:cooked|made)|not cooked|untried|surprise me)\b/.test(t),
    useWhatIHave: /\b(what i (?:already )?have|what we (?:already )?have|in the (?:fridge|cupboard|pantry)|already have|use what)\b/.test(t),
    isWeekday: [1, 2, 3, 4].includes(now.getDay()),
  };

  const minutes = t.match(/\b(?:under|in|less than|within|max|no more than|<)\s*(\d{1,3})\s*(?:min|mins|minute|minutes|m)\b/) ?? t.match(/\b(\d{1,3})\s*(?:min|mins|minute|minutes)\b/);
  if (minutes) c.maxMinutes = Number(minutes[1]);
  if (!c.maxMinutes && /\b(quick|fast|speedy|in a hurry|no time|busy)\b/.test(t)) c.maxMinutes = 30;
  if (input.maxMinutes) c.maxMinutes = input.maxMinutes;
  const cal = t.match(/\b(?:under|less than|below|max|<)\s*(\d{3,4})\s*(?:cal|cals|calories|kcal)\b/);
  if (cal) c.maxCalories = Number(cal[1]);

  for (const [word, cuisine] of Object.entries(CUISINE_QUERY)) if (new RegExp(`\\b${word}\\b`).test(t)) c.cuisines.push(cuisine);
  for (const [mood, words] of Object.entries(MOOD_WORDS)) if (words.some((w) => new RegExp(`\\b${w}\\b`).test(t))) c.moods.push(mood);
  if (input.mood) {
    const m = input.mood.toLowerCase();
    if (CUISINE_QUERY[m]) c.cuisines.push(CUISINE_QUERY[m]!);
    else if (MOOD_WORDS[m]) c.moods.push(m);
  }

  // Exclusions: "no pasta", "not chicken again", "without mushrooms", "nothing spicy"
  let rest = t;
  for (const m of t.matchAll(/\b(?:no|not|without|avoid|nothing|anything but|except|minus|skip|never)\s+(?:with\s+|too\s+|more\s+)?([a-z' ]+?)(?=\s+again\b|\s+(?:and|or|but|please|tonight|today|under|in|for)\b|$)/g)) {
    const term = m[1]!.trim();
    if (!term || term.length < 3) continue;
    const ings = findIngredientsInText(term);
    if (ings.length) c.exclude.push(...ings.map((i) => i.name));
    else c.exclude.push(term);
    rest = rest.replace(m[0], " ");
  }

  // "similar to the crispy salmon bowl", "like the korean beef bowl"
  const sim = t.match(/\b(?:similar to|something like|like the|like my|same as|a lighter version of|version of)\s+(?:the\s+|my\s+|that\s+)?(.+?)(?:\s+(?:i|we)\s+(?:loved|liked|made|cooked|saved|had).*)?(?:\s+but\b.*)?$/);
  if (sim && sim[1] && sim[1].split(" ").length <= 7) c.similarTo = sim[1].trim();

  // Audience
  if (/\b(kids?|children|family|picky)\b/.test(t)) c.audience = /\beveryone|whole family|all of us\b/.test(t) ? "everyone" : "kids";
  else if (/\beveryone|whole family|all of us\b/.test(t)) c.audience = "everyone";
  else if (/\b(just me|only me|for one|myself)\b/.test(t)) c.audience = "me";
  else if (/\b(partner|husband|wife|boyfriend|girlfriend)\b/.test(t)) c.audience = "partner";

  const useUpText = input.useUp ?? "";
  if (useUpText.trim()) c.useUp = findIngredientsInText(useUpText).map((i) => i.name);
  const mentioned = findIngredientsInText(rest)
    .map((i) => i.name)
    .filter((n) => !QUERY_STOPWORDS.has(n) && !c.exclude.includes(n));
  if (/\buse (?:up )?(?:my |the |some )?/.test(t)) c.useUp.push(...mentioned);
  c.include = [...new Set([...mentioned, ...c.useUp])];
  c.useUp = [...new Set(c.useUp)];
  c.cuisines = [...new Set(c.cuisines)];
  c.moods = [...new Set(c.moods)];
  return c;
}

function matchesTerm(r: Candidate, term: string): boolean {
  const t = term.toLowerCase();
  if (r.ingredients.some((i) => !i.optional && (i.normalizedName === t || i.normalizedName.includes(t) || (findIngredient(t)?.name ?? "") === i.normalizedName))) return true;
  if (r.title.toLowerCase().includes(t)) return true;
  if (r.flavors.some((f) => f === t) || r.tags.some((x) => x === t)) return true;
  if (t === "spicy" && (r.flavors.includes("spicy") || r.tags.includes("spicy"))) return true;
  if (t === "meat" && r.ingredients.some((i) => ["chicken", "beef", "pork", "lamb", "bacon", "chorizo"].some((m) => i.normalizedName.includes(m)))) return true;
  if (t === "fish" && r.ingredients.some((i) => ["salmon", "tuna", "white fish", "prawns"].some((m) => i.normalizedName.includes(m)))) return true;
  return false;
}

function hasIngredient(r: Candidate, name: string): boolean {
  return r.ingredients.some((i) => i.normalizedName === name || (name === "chicken" && i.normalizedName.startsWith("chicken")) || (name === "beef" && i.normalizedName.startsWith("beef")) || (name === "salmon" && i.normalizedName.includes("salmon")));
}

function daysSince(iso: string | null, now: Date): number | undefined {
  if (!iso) return undefined;
  return (now.getTime() - new Date(iso).getTime()) / 86_400_000;
}

export type ScoredCandidate = {
  recipe: Candidate;
  score: number;
  parts: Record<keyof typeof WEIGHTS, number>;
  adjustments: number;
  matchedPrefs: Preference[];
  pantryHits: string[];
  useUpHits: string[];
  similarity?: number;
};

const INTERESTING_PANTRY_ROLES = new Set(["carb", "flavor", "protein", "fat", "dairy"]);

export function scoreCandidate(r: Candidate, c: CookConstraints, ctx: RecommendationContext): ScoredCandidate | null {
  // ── Hard filters ────────────────────────────────────────────────────────
  if (ctx.rejectedRecipeIds.has(r.id)) return null;
  if (c.exclude.some((term) => matchesTerm(r, term))) return null;
  if (c.maxMinutes && (r.totalTimeMinutes ?? 999) > c.maxMinutes + 5) return null;
  if (c.maxCalories && (r.caloriesPerServing ?? 0) > c.maxCalories) return null;
  if (c.cuisines.length) {
    const fam = cuisineFamily(r.cuisine);
    const ok = c.cuisines.some((q) => q === r.cuisine?.toLowerCase() || q === fam || cuisineFamily(q) === fam && q === fam);
    if (!ok) return null;
  }
  const self = ctx.preferences.filter((p) => !p.memberRole || p.memberRole === "self");
  const strongAvoids = self.filter((p) => p.score <= -0.75 && p.entityType === "ingredient");
  if (strongAvoids.some((p) => hasIngredient(r, p.value))) return null;

  // ── Taste ───────────────────────────────────────────────────────────────
  const features = recipeFeatures(r);
  const matchedPrefs: Preference[] = [];
  let tasteSum = 0;
  for (const f of features) {
    const p = self.find((x) => x.entityType === f.entityType && x.value === f.value) ?? self.find((x) => x.value === f.value);
    if (p) {
      tasteSum += p.score * Math.max(0.3, p.confidence);
      matchedPrefs.push(p);
    }
  }
  // explicit ingredient prefs not captured as features (e.g. "blue cheese")
  for (const p of self) {
    if (p.entityType === "ingredient" && !matchedPrefs.includes(p) && r.ingredients.some((i) => i.normalizedName === p.value)) {
      tasteSum += p.score * Math.max(0.3, p.confidence);
      matchedPrefs.push(p);
    }
  }
  let taste = 0.5 + 0.5 * Math.tanh(tasteSum / 1.5);
  if (ctx.tasteEmbedding && r.embedding) taste = taste * 0.7 + ((cosine(ctx.tasteEmbedding, r.embedding) + 1) / 2) * 0.3;

  // ── Pantry ──────────────────────────────────────────────────────────────
  const needed = r.ingredients.filter((i) => !i.optional && !ALWAYS_HAVE.has(i.normalizedName));
  let pantrySum = 0;
  const pantryHits: string[] = [];
  for (const i of needed) {
    const p = ctx.pantry(i.normalizedName);
    pantrySum += p;
    if (p >= 0.7) pantryHits.push(i.normalizedName);
  }
  let pantry = needed.length ? pantrySum / needed.length : 0.5;
  const useUpHits = c.useUp.filter((u) => hasIngredient(r, u));
  if (c.useUp.length) pantry = Math.min(1, pantry * 0.5 + (useUpHits.length / c.useUp.length) * 0.8);

  // ── History ─────────────────────────────────────────────────────────────
  let history = r.rating === "loved" ? 0.9 : r.rating === "good" ? 0.7 : r.rating === "not_for_me" ? 0.05 : 0.5;
  if (r.isFavorite) history += 0.1;
  history += Math.min(0.15, Math.log1p(r.timesCooked) * 0.07);
  history = Math.min(1, history);

  // ── Explicit request ────────────────────────────────────────────────────
  let request = 0.5;
  let similarity: number | undefined;
  const hasQuery = !!(c.text.trim() || c.useUp.length);
  if (hasQuery) {
    let s = 0;
    let n = 0;
    if (ctx.queryEmbedding && r.embedding) {
      similarity = cosine(ctx.queryEmbedding, r.embedding);
      s += Math.max(0, similarity) * 1.6;
      n += 1;
    }
    if (c.include.length) {
      const hits = c.include.filter((x) => hasIngredient(r, x)).length;
      s += hits / c.include.length;
      n += 1;
    }
    if (c.moods.length) {
      const moodHits = c.moods.filter((m) => moodMatches(r, m)).length;
      s += moodHits / c.moods.length;
      n += 1;
    }
    if (c.highProtein) {
      s += (r.proteinGrams ?? 0) >= 30 ? 1 : 0.1;
      n += 1;
    }
    request = n ? Math.min(1, s / n) : 0.5;
  }

  // ── Time ────────────────────────────────────────────────────────────────
  const minutes = r.totalTimeMinutes ?? 40;
  let time = 0.7;
  const quickHabit = self.some((p) => p.entityType === "habit" && (p.value === "quick weekday" || p.value === "quick") && p.score > 0);
  if (c.maxMinutes) time = minutes <= c.maxMinutes ? 1 : 0.4;
  else if (c.isWeekday && quickHabit) time = minutes <= 30 ? 1 : minutes <= 40 ? 0.6 : 0.2;
  else time = minutes <= 45 ? 0.8 : 0.5;

  // ── Nutrition ───────────────────────────────────────────────────────────
  let nutrition = 0.6;
  const kcal = r.caloriesPerServing ?? 600;
  if (c.highProtein) nutrition = (r.proteinGrams ?? 0) >= 30 ? 1 : 0.2;
  if (c.moods.includes("healthy") || c.moods.includes("fresh")) nutrition = kcal <= 560 ? 1 : 0.3;
  if (c.moods.includes("indulgent")) nutrition = kcal >= 600 ? 1 : 0.5;

  // ── Novelty ─────────────────────────────────────────────────────────────
  const since = daysSince(r.lastCookedAt, ctx.now);
  let novelty = r.timesCooked === 0 ? 0.85 : since == null ? 0.6 : since < 3 ? 0 : since < 10 ? 0.3 : since < 30 ? 0.6 : 0.8;
  if (c.novelty) novelty = r.timesCooked === 0 ? 1 : 0.1;

  const parts = { taste, pantry, history, request, time, nutrition, novelty };
  const weights = { ...WEIGHTS };
  if (c.useWhatIHave || c.useUp.length) {
    weights.pantry += 0.15;
    weights.taste -= 0.05;
  }
  if (hasQuery) weights.request += 0.1;
  if (c.novelty) weights.novelty += 0.15;

  let score = 0;
  for (const k of Object.keys(parts) as (keyof typeof parts)[]) score += parts[k] * weights[k];

  // ── Adjustments ─────────────────────────────────────────────────────────
  let adjustments = 0;
  const kids = r.household.filter((h) => h.role === "child");
  const partner = r.household.filter((h) => h.role === "partner");
  if (c.audience === "kids" || c.audience === "everyone") {
    if (kids.some((k) => k.reaction === "loved")) adjustments += 0.18;
    else if (kids.some((k) => k.reaction === "good")) adjustments += 0.08;
    if (kids.some((k) => k.reaction === "not_for_me")) adjustments -= 0.3;
    if (r.tags.includes("kid-friendly")) adjustments += 0.08;
    if (r.flavors.includes("spicy") || r.tags.includes("spicy")) adjustments -= 0.15;
  }
  if (c.audience === "everyone" || c.audience === "partner") {
    if (partner.some((p) => p.reaction === "not_for_me")) adjustments -= 0.3;
    if (partner.some((p) => p.reaction === "loved")) adjustments += 0.08;
  } else if (partner.some((p) => p.reaction === "not_for_me")) adjustments -= 0.04;
  if (ctx.recentRecipeIds.has(r.id)) adjustments -= 0.25;
  if (c.include.length && !c.include.some((x) => hasIngredient(r, x))) adjustments -= 0.2;

  return { recipe: r, score: score + adjustments, parts, adjustments, matchedPrefs, pantryHits, useUpHits, similarity };
}

function moodMatches(r: Candidate, mood: string): boolean {
  const kcal = r.caloriesPerServing ?? 600;
  switch (mood) {
    case "fresh":
      return r.flavors.includes("fresh") || r.tags.includes("salad") || r.tags.includes("light");
    case "comforting":
      return r.tags.includes("comforting") || r.techniques.some((t) => ["roasting", "baking", "simmering"].includes(t)) || /pasta|orzo|noodle|curry/.test(r.title.toLowerCase());
    case "healthy":
      return kcal <= 560 && !r.tags.includes("indulgent");
    case "indulgent":
      return r.tags.includes("indulgent") || kcal >= 650 || r.flavors.includes("cheesy");
    case "spicy":
      return r.flavors.includes("spicy") || r.tags.includes("spicy");
    default:
      return false;
  }
}

// ── Explanations ──────────────────────────────────────────────────────────────

const PANTRY_NICE: Record<string, string> = { "jasmine rice": "rice", "sushi rice": "rice", "neutral oil": "oil", "egg noodles": "noodles" };

function listNatural(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

function flavorPhrase(prefs: Preference[]): string | undefined {
  const flav = prefs.filter((p) => p.score > 0.3 && (p.entityType === "ingredient" || p.entityType === "flavor") && !["salmon", "chicken", "beef", "prawns", "tofu", "eggs", "tuna"].includes(p.value));
  if (flav.length >= 2) return `${flav[0]!.label.toLowerCase()} and ${flav[1]!.label.toLowerCase()} flavours`;
  const cuisine = prefs.find((p) => p.entityType === "cuisine" && p.score > 0.3);
  if (cuisine) return `${cuisine.label} food`;
  if (flav[0]) return `${flav[0].label.toLowerCase()}`;
  return undefined;
}

export function explain(s: ScoredCandidate, c: CookConstraints, ctx: RecommendationContext): string {
  const r = s.recipe;
  const clauses: { text: string; strength: number }[] = [];
  const protein = mainProtein(r.ingredients.map((i) => i.normalizedName));
  const family = cuisineFamily(r.cuisine);

  if (c.similarTo && s.similarity != null) clauses.push({ text: `It's the closest match to "${c.similarTo}" in your recipes`, strength: 1.2 });
  if (s.useUpHits.length) clauses.push({ text: `it uses up your ${listNatural(s.useUpHits.slice(0, 3))}`, strength: 1.1 });

  if (r.rating === "loved" && r.timesCooked > 0) {
    clauses.push({ text: `you loved this one${r.timesCooked > 1 ? ` and have cooked it ${r.timesCooked} times` : ""}`, strength: 0.95 });
  } else {
    const similarLoved = ctx.library.filter(
      (x) => x.id !== r.id && (x.rating === "loved" || x.isFavorite || x.timesCooked >= 2) && mainProtein(x.ingredients.map((i) => i.normalizedName)) === protein && cuisineFamily(x.cuisine) === family,
    );
    if (similarLoved.length >= 2 && protein) clauses.push({ text: `you've loved ${numberWord(similarLoved.length)} similar ${protein} recipes`, strength: 0.9 });
    else if (similarLoved.length === 1) {
      const x = similarLoved[0]!;
      clauses.push({ text: `it's similar to the ${x.title} you ${x.timesCooked > 1 ? `cooked ${x.timesCooked} times` : "loved"}`, strength: 0.85 });
    }
  }

  if (c.audience === "kids" || c.audience === "everyone") {
    const kidsLoved = r.household.some((h) => h.role === "child" && h.reaction === "loved");
    if (kidsLoved) clauses.push({ text: "the kids loved it last time", strength: 1.05 });
    else {
      const similarKid = ctx.library.filter((x) => x.id !== r.id && x.household.some((h) => h.role === "child" && h.reaction === "loved") && (mainProtein(x.ingredients.map((i) => i.normalizedName)) === protein || cuisineFamily(x.cuisine) === family)).length;
      if (similarKid >= 2) clauses.push({ text: `the kids liked ${numberWord(similarKid)} similar recipes`, strength: 0.9 });
      else if (r.tags.includes("kid-friendly")) clauses.push({ text: "it's mild and kid-friendly", strength: 0.6 });
    }
  }

  const fp = flavorPhrase(s.matchedPrefs);
  if (fp) clauses.push({ text: `you usually like ${fp}`, strength: 0.7 + s.parts.taste * 0.2 });

  const interesting = s.pantryHits
    .filter((n) => {
      const ing = findIngredient(n);
      return ing && INTERESTING_PANTRY_ROLES.has(ing.role) && !/oil$/.test(n);
    })
    .map((n) => PANTRY_NICE[n] ?? n);
  const uniq = [...new Set(interesting)].slice(0, 2);
  if (uniq.length >= 2 || (uniq.length === 1 && (c.useWhatIHave || s.parts.pantry > 0.6))) {
    clauses.push({ text: `you probably already have ${listNatural(uniq)}`, strength: c.useWhatIHave ? 1.0 : 0.55 + s.parts.pantry * 0.3 });
  }

  const minutes = r.totalTimeMinutes;
  if (minutes != null && c.maxMinutes && minutes <= c.maxMinutes) clauses.push({ text: `it's on the table in ${minutes} minutes`, strength: 0.5 });
  else if (minutes != null && minutes <= 30 && c.isWeekday) clauses.push({ text: "it fits your usual 30-minute weekday dinners", strength: 0.45 });

  if (c.novelty && r.timesCooked === 0) {
    const weeks = Math.round((daysSince(r.createdAt, ctx.now) ?? 0) / 7);
    clauses.push({ text: weeks >= 2 ? `you saved it ${weeks} weeks ago and haven't tried it yet` : "you saved it recently and haven't tried it yet", strength: 1.0 });
  } else if (r.timesCooked === 0 && s.parts.taste > 0.65) {
    clauses.push({ text: "it's one you saved but haven't cooked yet", strength: 0.4 });
  }

  if (c.highProtein && (r.proteinGrams ?? 0) >= 30) clauses.push({ text: `it packs ${r.proteinGrams}g of protein`, strength: 0.75 });

  clauses.sort((a, b) => b.strength - a.strength);
  const picked = clauses.slice(0, 2).map((x) => x.text);
  if (!picked.length) return "A good match for what you usually cook.";
  const [first, second] = picked;
  const sentence = second ? `${capitalize(first!)}, and ${second}.` : `${capitalize(first!)}.`;
  return sentence.replace(/^It's the closest/, "The closest").replace(/^You /, "You ");
}

function numberWord(n: number): string {
  return ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ?? String(n);
}

/** Top-N with light diversity: avoid three salmon bowls in a row. */
export function pickDiverse(scored: ScoredCandidate[], n: number): ScoredCandidate[] {
  const pool = [...scored].sort((a, b) => b.score - a.score);
  const out: ScoredCandidate[] = [];
  while (out.length < n && pool.length) {
    let bestIdx = 0;
    let best = -Infinity;
    for (let i = 0; i < Math.min(pool.length, 12); i++) {
      const cand = pool[i]!;
      const protein = mainProtein(cand.recipe.ingredients.map((x) => x.normalizedName));
      const fam = cuisineFamily(cand.recipe.cuisine);
      let penalty = 0;
      for (const o of out) {
        if (protein && mainProtein(o.recipe.ingredients.map((x) => x.normalizedName)) === protein) penalty += 0.06;
        if (fam && cuisineFamily(o.recipe.cuisine) === fam) penalty += 0.03;
      }
      if (cand.score - penalty > best) {
        best = cand.score - penalty;
        bestIdx = i;
      }
    }
    out.push(pool.splice(bestIdx, 1)[0]!);
  }
  return out;
}

export function recommend(candidates: Candidate[], c: CookConstraints, ctx: RecommendationContext, limit = 3) {
  let scored = candidates.map((r) => scoreCandidate(r, c, ctx)).filter((x): x is ScoredCandidate => !!x);
  // If the request names ingredients and enough recipes contain them, only show those.
  if (c.include.length) {
    const withInclude = scored.filter((s) => c.include.some((x) => hasIngredient(s.recipe, x)));
    if (withInclude.length >= Math.min(limit, 2)) scored = withInclude;
  }
  if (c.similarTo) {
    const target = candidates.find((r) => r.title.toLowerCase().includes(c.similarTo!.toLowerCase().replace(/\b(the|my)\b/g, "").trim()));
    if (target?.embedding) {
      for (const s of scored) {
        s.similarity = s.recipe.embedding ? cosine(target.embedding, s.recipe.embedding) : 0;
        s.score += (s.similarity ?? 0) * 0.35;
      }
      scored = scored.filter((s) => s.recipe.id !== target.id);
    }
  }
  const picks = pickDiverse(scored, limit);
  return picks.map((s) => ({ scored: s, reason: explain(s, c, ctx) }));
}
