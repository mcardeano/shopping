import { describe, expect, it } from "vitest";
import { parseQuantity, sumQuantities, formatQuantity } from "@/core/text/quantity";
import { resolveItem, findIngredientsInText } from "@/core/services/normalization";
import { parseShoppingText, looksLikeShoppingCommand } from "@/core/services/shoppingIntent";
import { findDuplicate, mergedQuantity, sourceLabel } from "@/core/services/shoppingList";
import { estimatePantry, replenishmentCandidates } from "@/core/services/pantry";
import { interpretFeedback, parsePreferenceStatement } from "@/core/services/taste";
import { parseCookRequest } from "@/core/services/recommendation";
import { parsePlanBrief } from "@/core/services/mealPlanning";
import { parseIngredientLine, parseRecipeText, extractJsonLdRecipe } from "@/core/services/recipeParsing";
import { parseLibraryQuery } from "@/core/services/search";
import { embedText, cosine } from "@/core/services/embedding";
import { rankProducts } from "@/core/grocery/matching";
import { MOCK_PRODUCTS } from "@/core/grocery/mockCatalog";

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

describe("quantities", () => {
  it("parses amounts, fractions, words and units", () => {
    expect(parseQuantity("2 tbsp soy sauce")).toMatchObject({ amount: 2, unit: "tbsp", rest: "soy sauce" });
    expect(parseQuantity("1 1/2 tsp chilli flakes")).toMatchObject({ amount: 1.5, unit: "tsp" });
    expect(parseQuantity("two packs of Greek yogurt")).toMatchObject({ amount: 2, unit: "pack", rest: "Greek yogurt" });
    expect(parseQuantity("400g salmon")).toMatchObject({ amount: 400, unit: "g", rest: "salmon" });
    expect(parseQuantity("half an avocado")).toMatchObject({ amount: 0.5, rest: "avocado" });
  });
  it("merges compatible quantities", () => {
    const [q] = sumQuantities([{ amount: 2, unit: "tbsp" }, { amount: 1, unit: "tbsp" }, { amount: 3, unit: "tbsp" }]);
    expect(formatQuantity(q!)).toBe("6 tbsp");
    expect(sumQuantities([{ amount: 600, unit: "g" }, { amount: 0.5, unit: "kg" }]).map((x) => formatQuantity(x))).toEqual(["1.1kg"]);
    expect(sumQuantities([{ amount: 1, unit: "can" }, { amount: 200, unit: "g" }])).toHaveLength(2);
  });
});

describe("normalization", () => {
  it("maps synonyms, spellings and brands to one canonical item", () => {
    expect(resolveItem("scallions").name).toBe("spring onions");
    expect(resolveItem("Green onions").name).toBe("spring onions");
    expect(resolveItem("Greek yoghurt").name).toBe("greek yogurt");
    expect(resolveItem("Fage yogurt").name).toBe("greek yogurt");
    expect(resolveItem("Fage yogurt").brand).toBe("Fage");
    expect(resolveItem("courgettes").name).toBe("courgette");
  });
  it("keeps non-food products separate from ingredients", () => {
    const tp = resolveItem("loo roll");
    expect(tp.kind).toBe("product");
    expect(tp.name).toBe("toilet paper");
    expect(tp.category).toBe("Household");
    expect(resolveItem("dishwasher tabs").name).toBe("dishwasher tablets");
    expect(resolveItem("nappies").category).toBe("Baby");
  });
  it("categorises unknown items sensibly", () => {
    expect(resolveItem("oat biscuits").category).toBe("Pantry");
    expect(resolveItem("something weird").category).toBe("Other");
  });
  it("finds ingredients in free text", () => {
    expect(findIngredientsInText("salmon, courgettes and half an avocado").map((i) => i.name).sort()).toEqual(["avocado", "courgette", "salmon"]);
  });
});

describe("shopping intent", () => {
  const items = (t: string) => parseShoppingText(t).flatMap((a) => (a.type === "add_items" ? a.items : []));
  it("single and multiple items", () => {
    expect(items("milk").map((i) => i.name)).toEqual(["milk"]);
    expect(items("milk, bananas, dishwasher tablets and Greek yogurt").map((i) => i.name)).toEqual(["milk", "bananas", "dishwasher tablets", "Greek yogurt"]);
  });
  it("quantities", () => {
    const [a, b] = items("two packs of Greek yogurt and six bananas");
    expect(a).toMatchObject({ name: "Greek yogurt", quantity: 2, unit: "pack" });
    expect(b).toMatchObject({ name: "bananas", quantity: 6 });
  });
  it("natural phrasing", () => {
    expect(items("we're out of olive oil").map((i) => i.name)).toEqual(["olive oil"]);
    expect(items("Remember I need olive oil.").map((i) => i.name)).toEqual(["olive oil"]);
    expect(items("We're out of dishwasher tablets").map((i) => i.name)).toEqual(["dishwasher tablets"]);
    expect(items("buy salmon and avocados").map((i) => i.name)).toEqual(["salmon", "avocados"]);
    expect(items("Dishwasher tablets, bananas and toothpaste").map((i) => i.name)).toEqual(["Dishwasher tablets", "bananas", "toothpaste"]);
  });
  it("notes and increments", () => {
    expect(items("don't forget strawberries for the kids")[0]).toMatchObject({ name: "strawberries", note: "for the kids" });
    expect(items("Get another Greek yogurt")[0]).toMatchObject({ name: "Greek yogurt", increment: true, quantity: 1 });
    expect(items("salt and pepper crisps").map((i) => i.name)).toEqual(["salt and pepper crisps"]);
  });
  it("recipe and list commands", () => {
    expect(parseShoppingText("Add everything for the salmon recipe")).toEqual([{ type: "add_recipe", recipeQuery: "salmon" }]);
    expect(parseShoppingText("What am I buying this week?")).toEqual([{ type: "show_list" }]);
    const combo = parseShoppingText("Add avocados and find me a dinner using them");
    expect(combo.map((a) => a.type)).toEqual(["add_items", "find_recipes"]);
  });
  it("distinguishes shopping statements from dinner questions", () => {
    expect(looksLikeShoppingCommand("we're out of olive oil")).toBe(true);
    expect(looksLikeShoppingCommand("add bananas")).toBe(true);
    expect(looksLikeShoppingCommand("What should I make tonight?")).toBe(false);
    expect(looksLikeShoppingCommand("Something Asian with salmon under 30 minutes")).toBe(false);
    expect(looksLikeShoppingCommand("I need something quick for dinner")).toBe(false);
  });
});

describe("shopping list consolidation", () => {
  it("detects semantic duplicates", () => {
    const existing = [{ id: "1", normalizedName: "greek yogurt", displayName: "Greek yogurt", checked: false }];
    expect(findDuplicate(resolveItem("Greek yoghurt"), existing)?.id).toBe("1");
    expect(findDuplicate(resolveItem("Fage yogurt"), existing)?.id).toBe("1");
    expect(findDuplicate(resolveItem("yogurt for breakfast"), existing)?.id).toBe("1");
    expect(findDuplicate(resolveItem("milk"), existing)).toBeUndefined();
  });
  it("merges quantities across sources", () => {
    const q = mergedQuantity("soy sauce", [
      { quantity: 2, unit: "tbsp" },
      { quantity: 1, unit: "tbsp" },
      { quantity: 3, unit: "tbsp" },
    ]);
    expect(q).toBe("6 tbsp");
  });
  it("labels provenance", () => {
    expect(sourceLabel([{ id: "a", type: "manual", sourceId: null, label: null, quantity: null, unit: null }])).toBe("Added by you");
    expect(sourceLabel([{ id: "a", type: "meal_plan", sourceId: "x", label: "Miso Salmon Bowl", quantity: 1, unit: null }])).toBe("Meal plan");
    expect(sourceLabel([{ id: "a", type: "repeat_purchase", sourceId: null, label: null, quantity: null, unit: null }], { intervalDays: 7 })).toBe("Usually buy weekly");
  });
});

describe("pantry probability", () => {
  it("staples bought recently are probably at home; fresh fish isn't", () => {
    const oil = estimatePantry("olive oil", { purchases: [daysAgo(14), daysAgo(64), daysAgo(114)], corrections: [] });
    expect(oil.status).toBe("probably_have");
    const salmon = estimatePantry("salmon", { purchases: [daysAgo(8), daysAgo(15), daysAgo(22)], corrections: [] });
    expect(salmon.status).toBe("need_to_buy");
  });
  it("uses priors with no history, and corrections override", () => {
    expect(estimatePantry("soy sauce", { purchases: [], corrections: [] }).status).toBe("probably_have");
    expect(estimatePantry("salmon", { purchases: [], corrections: [] }).status).toBe("need_to_buy");
    expect(estimatePantry("soy sauce", { purchases: [], corrections: [{ hasItem: false, at: daysAgo(1) }] }).status).toBe("need_to_buy");
    expect(estimatePantry("salmon", { purchases: [], corrections: [{ hasItem: true, at: daysAgo(0) }] }).status).toBe("probably_have");
  });
  it("suggests regular repurchases that are due", () => {
    const due = replenishmentCandidates([{ name: "dishwasher tablets", purchases: [daysAgo(36), daysAgo(71), daysAgo(106)] }, { name: "olive oil", purchases: [daysAgo(5), daysAgo(55), daysAgo(105)] }]);
    expect(due.map((d) => d.name)).toEqual(["dishwasher tablets"]);
  });
});

describe("taste inference", () => {
  it("turns feedback into structured signals, keeping nuance", () => {
    const s = interpretFeedback("Delicious but too sweet and I would use less sauce.", "good");
    expect(s.sentiment).toBe("mixed");
    expect(s.signals.some((x) => x.value === "very sweet" && x.score < 0)).toBe(true);
    expect(s.adjustments.some((a) => a.direction === "decrease")).toBe(true);
    const c = interpretFeedback("This was too cheesy.");
    expect(c.signals[0]).toMatchObject({ value: "very cheesy" });
    const t = interpretFeedback("Great but I would use less tahini");
    expect(t.adjustments).toContainEqual({ attribute: "tahini_quantity", direction: "decrease" });
    expect(t.sentiment).not.toBe("negative");
  });
  it("captures household reactions without confusing them with your own", () => {
    const k = interpretFeedback("My kids loved this one");
    expect(k.household).toContainEqual({ member: "kids", reaction: "loved" });
    const p = interpretFeedback("My partner didn't like it");
    expect(p.household).toContainEqual({ member: "partner", reaction: "not_for_me" });
  });
  it("parses plain-English preferences", () => {
    const b = parsePreferenceStatement("I don't really like blue cheese.");
    expect(b.member).toBe("self");
    expect(b.preferences[0]).toMatchObject({ value: "blue cheese" });
    expect(b.preferences[0]!.score).toBeLessThan(0);
    const k = parsePreferenceStatement("The kids love anything with pasta");
    expect(k.member).toBe("kids");
    expect(k.preferences[0]!.score).toBeGreaterThan(0);
  });
});

describe("cook requests", () => {
  it("parses constraints", () => {
    const c = parseCookRequest({ text: "Something Asian with salmon under 30 minutes" });
    expect(c).toMatchObject({ maxMinutes: 30, cuisines: ["asian"], include: ["salmon"] });
    const d = parseCookRequest({ text: "under 500 calories, high protein, no pasta, not chicken again" });
    expect(d.maxCalories).toBe(500);
    expect(d.highProtein).toBe(true);
    expect(d.exclude).toEqual(expect.arrayContaining(["pasta", "chicken"]));
    expect(parseCookRequest({ text: "something the kids will eat" }).audience).toBe("kids");
    expect(parseCookRequest({ text: "use what I already have" }).useWhatIHave).toBe(true);
    expect(parseCookRequest({ text: "something similar to the crispy salmon bowl I loved" }).similarTo).toBe("crispy salmon bowl");
  });
  it("parses weekly planning briefs", () => {
    const b = parsePlanBrief("Give me 5 healthy dinners but make Friday more indulgent. Only Monday to Thursday. Reuse ingredients.");
    expect(b.dayMoods[4]).toEqual(["indulgent"]);
    expect(b.days).toEqual([0, 1, 2, 3]);
    expect(b.reuseIngredients).toBe(true);
    expect(parsePlanBrief("Give me 3 dinners using salmon, chicken and beef").coverProteins.sort()).toEqual(["beef", "chicken", "salmon"]);
  });
});

describe("recipe parsing", () => {
  it("parses ingredient lines", () => {
    expect(parseIngredientLine("2 salmon fillets, skin on")).toMatchObject({ name: "salmon", amount: 2, preparation: "skin on" });
    expect(parseIngredientLine("3 clove garlic, grated")).toMatchObject({ name: "garlic", amount: 3, unit: "clove" });
    expect(parseIngredientLine("flaky salt, to finish")).toMatchObject({ name: "salt" });
  });
  it("parses a messy caption", () => {
    const r = parseRecipeText(`Miso salmon bowl 🍣\nserves 2 · ready in 25 mins\n\nIngredients\n- 2 salmon fillets\n- 1 tbsp white miso\n- 1 tbsp soy sauce\n- 150g sushi rice\n- 1/2 cucumber\n\nMethod\n1. Mix the miso and soy sauce and brush over the salmon.\n2. Grill for 8 minutes until caramelised.\n#dinner #salmon`);
    expect(r.title).toBe("Miso salmon bowl");
    expect(r.ingredients?.map((i) => i.name)).toEqual(["salmon", "white miso", "soy sauce", "sushi rice", "cucumber"]);
    expect(r.steps).toHaveLength(2);
    expect(r.servings).toBe(2);
  });
  it("reads schema.org JSON-LD", () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"Lemon Chicken Orzo","recipeIngredient":["300 g orzo","2 chicken breasts","1 lemon"],"recipeInstructions":[{"@type":"HowToStep","text":"Cook the orzo."},{"@type":"HowToStep","text":"Add the chicken."}],"totalTime":"PT35M","recipeYield":"4 servings","image":["https://example.com/a.jpg"],"author":{"@type":"Person","name":"A Cook"}}]}</script>`;
    const r = extractJsonLdRecipe(html)!;
    expect(r.title).toBe("Lemon Chicken Orzo");
    expect(r.totalTimeMinutes).toBe(35);
    expect(r.servings).toBe(4);
    expect(r.steps).toEqual(["Cook the orzo.", "Add the chicken."]);
    expect(r.ingredients?.map((i) => i.name)).toEqual(["orzo", "chicken breast", "lemon"]);
  });
});

describe("library search", () => {
  it("turns questions into filters", () => {
    expect(parseLibraryQuery("things I saved but haven't cooked").filters.notCooked).toBe(true);
    expect(parseLibraryQuery("recipes my kids liked").filters.kidsLiked).toBe(true);
    const q = parseLibraryQuery("quick Asian dinners");
    expect(q.filters.maxMinutes).toBe(30);
    expect(q.filters.cuisines).toEqual(["asian"]);
    const ig = parseLibraryQuery("Show me things I saved from Instagram last month");
    expect(ig.filters.source).toBe("instagram");
    expect(ig.filters.savedAfter).toBeDefined();
    expect(parseLibraryQuery("recipes with tahini").filters.ingredients).toEqual(["tahini"]);
  });
  it("semantic embedding puts related ideas close together", () => {
    const bowl = embedText("Miso salmon rice bowl. Japanese (asian). umami, fresh. quick, bowl. salmon, rice, cucumber, soy sauce, sesame.");
    const pasta = embedText("Tomato burrata pasta. Italian. creamy, cheesy, comforting. pasta, burrata, tomato.");
    const q = embedText("something asian and fresh");
    expect(cosine(q, bowl)).toBeGreaterThan(cosine(q, pasta));
    const comfort = embedText("comforting but not heavy");
    expect(cosine(comfort, pasta)).toBeGreaterThan(-1);
  });
});

describe("product matching", () => {
  it("ranks the household's usual product first and sizes packs", () => {
    const yogurts = MOCK_PRODUCTS.filter((p) => p.itemName === "greek yogurt");
    const ranked = rankProducts(yogurts, {}, [{ brand: "Fage", retailProductId: "greek-yogurt-fage-500", count: 8 }]);
    expect(ranked[0]!.id).toBe("greek-yogurt-fage-500");
    expect(ranked[0]!.badge).toBe("You usually buy this");
    const salmon = rankProducts(MOCK_PRODUCTS.filter((p) => p.itemName === "salmon"), { quantity: 400, unit: "g" }, []);
    expect(salmon.find((p) => p.id === "salmon-2x125")!.packsNeeded).toBe(2);
  });
});
