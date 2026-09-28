/**
 * RecipeEnrichmentService
 * Fills what extraction didn't give us: cuisine, meal type, tags, flavours, difficulty,
 * nutrition estimate, and the rich semantic description used for embeddings.
 */
import { findIngredient } from "./normalization";
import { unitDef } from "../text/quantity";
import type { IngredientLineDraft, RecipeDraft } from "../domain/schemas";
import { cuisineFamily } from "../domain/categories";

const CUISINE_SIGNALS: [string, string[]][] = [
  ["Korean", ["gochujang", "kimchi", "korean"]],
  ["Japanese", ["white miso", "mirin", "nori", "sushi rice", "teriyaki sauce", "kewpie mayonnaise", "furikake", "japanese", "teriyaki", "miso"]],
  ["Thai", ["fish sauce", "thai curry paste", "lemongrass", "thai"]],
  ["Chinese", ["five spice", "oyster sauce", "chinese", "szechuan", "sichuan"]],
  ["Indonesian", ["satay", "sambal", "indonesian"]],
  ["Vietnamese", ["vietnamese", "banh mi", "pho"]],
  ["North African", ["harissa", "couscous", "ras el hanout", "moroccan"]],
  ["Middle Eastern", ["tahini", "sumac", "za'atar", "shawarma spice", "pomegranate molasses", "shawarma", "middle eastern", "labneh"]],
  ["Greek", ["feta", "dried oregano", "olives", "greek", "tzatziki", "halloumi"]],
  ["Italian", ["pasta", "parmesan", "basil", "pesto", "mozzarella", "burrata", "orzo", "italian", "risotto"]],
  ["Mediterranean", ["olive oil", "lemon", "cherry tomatoes", "mediterranean"]],
];

const ASIAN_HINTS = ["soy sauce", "sesame oil", "rice vinegar", "fresh ginger", "spring onions", "sesame seeds", "chilli oil", "sriracha", "pak choi", "tofu", "egg noodles", "rice noodles"];

export function inferCuisine(title: string, ingredientNames: string[]): string | undefined {
  const hay = new Set(ingredientNames);
  const t = title.toLowerCase();
  let best: { cuisine: string; score: number } | undefined;
  for (const [cuisine, signals] of CUISINE_SIGNALS) {
    let score = 0;
    for (const s of signals) {
      if (hay.has(s)) score += cuisine === "Mediterranean" ? 0.5 : 2;
      if (t.includes(s)) score += 3;
    }
    if (score > 0 && (!best || score > best.score)) best = { cuisine, score };
  }
  const asian = ASIAN_HINTS.filter((h) => hay.has(h)).length;
  if (asian >= 2 && (!best || best.cuisine === "Mediterranean" || best.score < asian)) {
    return best && ["Korean", "Japanese", "Thai", "Chinese", "Indonesian", "Vietnamese"].includes(best.cuisine) ? best.cuisine : "Asian";
  }
  return best?.cuisine;
}

const FLAVOR_RULES: [string, (names: Set<string>, title: string) => boolean][] = [
  ["umami", (n) => ["soy sauce", "white miso", "fish sauce", "oyster sauce", "parmesan", "mushrooms"].some((x) => n.has(x))],
  ["spicy", (n, t) => ["red chilli", "chilli flakes", "gochujang", "sriracha", "harissa", "chilli oil", "thai curry paste"].some((x) => n.has(x)) || /spicy|chilli|chili|hot /.test(t)],
  ["fresh", (n) => ["cucumber", "coriander", "mint", "parsley", "dill", "lime", "salad leaves", "rocket", "radish"].filter((x) => n.has(x)).length >= 2],
  ["citrusy", (n) => n.has("lemon") || n.has("lime")],
  ["herby", (n) => ["coriander", "mint", "parsley", "dill", "basil"].filter((x) => n.has(x)).length >= 2],
  ["nutty", (n) => ["tahini", "peanut butter", "peanuts", "sesame seeds", "cashews", "almonds"].some((x) => n.has(x))],
  ["creamy", (n) => ["greek yogurt", "double cream", "coconut milk", "burrata", "crème fraîche", "tahini", "avocado"].some((x) => n.has(x))],
  ["sweet-savory", (n) => ["honey", "sugar", "mirin", "teriyaki sauce"].some((x) => n.has(x)) && ["soy sauce", "white miso", "fish sauce"].some((x) => n.has(x))],
  ["smoky", (n) => n.has("smoked paprika")],
  ["cheesy", (n) => ["feta", "burrata", "mozzarella", "parmesan", "cheddar", "halloumi", "blue cheese"].filter((x) => n.has(x)).length >= 1],
];

export function inferFlavors(title: string, names: string[]): string[] {
  const set = new Set(names);
  const t = title.toLowerCase();
  return FLAVOR_RULES.filter(([, rule]) => rule(set, t)).map(([f]) => f);
}

const PROTEINS = ["salmon", "sushi-grade salmon", "tuna", "prawns", "white fish", "chicken breast", "chicken thighs", "chicken", "beef steak", "beef mince", "beef", "pork", "lamb", "tofu", "eggs", "chickpeas", "lentils", "halloumi"];

export function mainProtein(names: string[]): string | undefined {
  const p = PROTEINS.find((x) => names.includes(x));
  if (!p) return undefined;
  if (p.startsWith("chicken")) return "chicken";
  if (p.startsWith("beef")) return "beef";
  if (p.includes("salmon")) return "salmon";
  return p;
}

export function inferTags(d: {
  title: string;
  totalTimeMinutes?: number;
  proteinGrams?: number;
  caloriesPerServing?: number;
  names: string[];
  steps: string[];
  flavors: string[];
  existing?: string[];
}): string[] {
  const tags = new Set((d.existing ?? []).map((t) => t.toLowerCase()));
  const t = d.title.toLowerCase();
  if (d.totalTimeMinutes != null && d.totalTimeMinutes <= 30) tags.add("quick");
  if (d.totalTimeMinutes != null && d.totalTimeMinutes <= 35) tags.add("weeknight");
  if (d.proteinGrams != null && d.proteinGrams >= 30) tags.add("high protein");
  if (d.caloriesPerServing != null && d.caloriesPerServing <= 450) tags.add("light");
  if (/\bbowl\b/.test(t)) tags.add("bowl");
  if (/\bsalad\b/.test(t)) tags.add("salad");
  if (/\b(tray|sheet|one[- ]pan|one[- ]pot)\b/.test(t)) tags.add("one-pan");
  if (/\bcrisp(y)?\b/.test(t)) tags.add("crispy");
  if (d.flavors.includes("spicy")) tags.add("spicy");
  const meat = PROTEINS.slice(0, 13).some((p) => d.names.includes(p));
  const fishOrMeat = meat || d.names.some((n) => ["bacon", "chorizo", "fish sauce", "oyster sauce", "canned tuna"].includes(n));
  const dairy = d.names.some((n) => findIngredient(n)?.role === "dairy" || n === "butter");
  if (!fishOrMeat) tags.add("vegetarian");
  if (!fishOrMeat && !dairy && !d.names.includes("eggs") && !d.names.includes("honey")) tags.add("vegan");
  if (!dairy) tags.add("dairy-free");
  return [...tags];
}

export function inferDifficulty(steps: string[], totalMinutes?: number, ingredientCount = 0): "easy" | "medium" | "hard" {
  const load = steps.length + ingredientCount / 3 + (totalMinutes ?? 30) / 20;
  if (load <= 9) return "easy";
  if (load <= 14) return "medium";
  return "hard";
}

export function inferMealType(title: string, tags: string[]): string {
  const t = title.toLowerCase();
  if (/\b(pancake|porridge|granola|overnight oats|breakfast|shakshuka|omelette|french toast)\b/.test(t)) return "breakfast";
  if (/\b(cake|cookie|brownie|dessert|tart|ice cream|crumble)\b/.test(t)) return "dessert";
  if (tags.includes("salad") && !tags.includes("high protein")) return "lunch";
  return "dinner";
}

/** Grams represented by an ingredient line, for nutrition estimation. */
export function gramsFor(line: Pick<IngredientLineDraft, "amount" | "unit" | "name">): number | undefined {
  const ing = findIngredient(line.name);
  const amount = line.amount ?? (line.unit ? 1 : undefined);
  if (amount == null) return undefined;
  const def = unitDef(line.unit);
  if (!def || def.canonical === "piece" || def.canonical === "fillet") {
    if (line.unit === "fillet") return amount * (ing?.gramsPerPiece ?? 130);
    return amount * (ing?.gramsPerPiece ?? 100);
  }
  switch (def.canonical) {
    case "g":
    case "kg":
    case "ml":
    case "l":
    case "tsp":
    case "tbsp":
    case "cup":
    case "pinch":
      return amount * def.toBase * (def.canonical === "cup" && ing?.role === "carb" ? 0.8 : 1);
    case "clove":
      return amount * 5;
    case "can":
      return amount * (ing?.gramsPerPiece ?? 400);
    case "bunch":
      return amount * 30;
    case "handful":
      return amount * 30;
    case "pack":
      return amount * (ing?.gramsPerPiece ?? 250);
    default:
      return amount * (ing?.gramsPerPiece ?? 50);
  }
}

export function estimateNutrition(lines: IngredientLineDraft[], servings: number | undefined) {
  const s = servings && servings > 0 ? servings : 2;
  let kcal = 0, protein = 0, carbs = 0, fat = 0, covered = 0;
  for (const line of lines) {
    const ing = findIngredient(line.name);
    const grams = gramsFor(line);
    if (!ing?.macros || grams == null) continue;
    const [k, p, c, f] = ing.macros;
    // Frying oil is mostly left in the pan.
    const absorb = ing.role === "fat" && /oil/.test(ing.name) && grams > 30 ? 0.5 : 1;
    kcal += (k * grams * absorb) / 100;
    protein += (p * grams) / 100;
    carbs += (c * grams) / 100;
    fat += (f * grams * absorb) / 100;
    covered++;
  }
  if (covered < Math.max(2, lines.length * 0.4)) return undefined;
  return {
    caloriesPerServing: Math.round(kcal / s / 10) * 10,
    proteinGrams: Math.round(protein / s),
    carbsGrams: Math.round(carbs / s),
    fatGrams: Math.round(fat / s),
  };
}

export function enrichDraft(draft: RecipeDraft): RecipeDraft {
  const names = draft.ingredients.map((i) => i.name);
  const cuisine = draft.cuisine ?? inferCuisine(draft.title, names);
  const flavors = draft.flavors.length ? draft.flavors : inferFlavors(draft.title, names);
  const totalTimeMinutes =
    draft.totalTimeMinutes ??
    (draft.prepTimeMinutes != null || draft.cookTimeMinutes != null ? (draft.prepTimeMinutes ?? 0) + (draft.cookTimeMinutes ?? 0) : undefined);
  const needsNutrition = draft.caloriesPerServing == null;
  const nutrition = needsNutrition ? estimateNutrition(draft.ingredients, draft.servings) : undefined;
  const merged = {
    ...draft,
    cuisine,
    flavors,
    totalTimeMinutes,
    ...(nutrition ?? {}),
    nutritionIsEstimate: needsNutrition ? true : draft.nutritionIsEstimate,
  };
  const tags = inferTags({
    title: draft.title,
    totalTimeMinutes,
    proteinGrams: merged.proteinGrams,
    caloriesPerServing: merged.caloriesPerServing,
    names,
    steps: draft.steps,
    flavors,
    existing: draft.tags,
  });
  return {
    ...merged,
    tags,
    mealType: draft.mealType ?? inferMealType(draft.title, tags),
    difficulty: draft.difficulty ?? inferDifficulty(draft.steps, totalTimeMinutes, draft.ingredients.length),
  };
}

/**
 * The text that gets embedded. Written like a human description so that
 * natural-language queries ("comforting but not heavy") land near it.
 */
export function buildSemanticText(r: {
  title: string;
  description?: string | null;
  cuisine?: string | null;
  tags: string[];
  flavors: string[];
  techniques: string[];
  totalTimeMinutes?: number | null;
  caloriesPerServing?: number | null;
  proteinGrams?: number | null;
  ingredientNames: string[];
}): string {
  const family = cuisineFamily(r.cuisine);
  const parts = [
    `${r.title}.`,
    r.cuisine ? `${r.cuisine}${family && family !== r.cuisine.toLowerCase() ? ` (${family})` : ""}.` : "",
    r.flavors.length ? `${r.flavors.join(", ")}.` : "",
    r.tags.length ? `${r.tags.join(", ")}.` : "",
    r.techniques.length ? `${r.techniques.join(", ")}.` : "",
    r.totalTimeMinutes != null ? (r.totalTimeMinutes <= 20 ? "Very quick." : r.totalTimeMinutes <= 35 ? "Weekday dinner." : "Slower weekend cooking.") : "",
    r.caloriesPerServing != null ? (r.caloriesPerServing < 480 ? "Light." : r.caloriesPerServing > 700 ? "Rich and filling." : "Satisfying.") : "",
    r.proteinGrams != null && r.proteinGrams >= 30 ? "High protein." : "",
    `${r.ingredientNames.slice(0, 12).join(", ")}.`,
    r.description ?? "",
  ];
  return parts.filter(Boolean).join(" ");
}
