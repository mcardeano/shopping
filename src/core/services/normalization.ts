/**
 * IngredientNormalizationService
 * Maps free text ("Spring onions", "scallions", "Fage yogurt", "loo roll") onto a canonical
 * Ingredient or ShoppingProduct. Deterministic and synchronous so shopping capture feels instant.
 */
import { INGREDIENTS, type CatalogIngredient } from "../catalog/ingredients";
import { PRODUCTS, type CatalogProduct } from "../catalog/products";
import type { ShoppingCategory } from "../domain/categories";

export type ResolvedItem =
  | { kind: "ingredient"; name: string; display: string; category: ShoppingCategory; ingredient: CatalogIngredient; brand?: string; generic: boolean }
  | { kind: "product"; name: string; display: string; category: ShoppingCategory; product: CatalogProduct; brand?: string; generic: boolean }
  | { kind: "unknown"; name: string; display: string; category: ShoppingCategory; brand?: string; generic: boolean };

const KNOWN_BRANDS = ["fage", "oikos", "alpro", "lurpak", "finish", "fairy", "persil", "ariel", "kleenex", "nespresso", "heinz", "colgate", "dove", "pampers", "huggies", "kikkoman", "lee kum kee", "yeo's", "maille", "barilla", "de cecco", "rummo", "president", "yeo valley", "arla", "continente", "tesco", "mercadona", "hacendado", "auchan", "lidl", "aldi", "m&s", "waitrose"];

/** Generic words that may merge into a more specific item already on the list. */
export const GENERIC_TERMS = new Set(["yogurt", "cheese", "rice", "noodle", "pasta", "tomato", "oil", "lettuce", "juice", "wine", "bread", "milk", "pepper", "onion", "stock", "vinegar", "bean", "nut", "herb", "fish", "steak", "mince", "sauce"]);

const DESCRIPTORS = /\b(fresh|large|big|small|medium|organic|ripe|free[- ]range|good|good quality|good-quality|some|extra|more|another|few|nice|decent|little|bit of|a bit of|lots of|plenty of|bottle of|pack of|packet of|bag of|box of|tub of|jar of|can of|tin of|of)\b/g;

export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function singularizeWord(w: string): string {
  if (w.length <= 3) return w;
  if (/(ss|us|is|ous)$/.test(w)) return w;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("oes")) return w.slice(0, -2);
  if (w.endsWith("ves") && !w.endsWith("olives")) return w.slice(0, -3) + "f";
  if (/(ches|shes|xes|sses|zes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

/** Lowercase, strip accents/punctuation, collapse whitespace. */
export function cleanPhrase(s: string): string {
  return stripDiacritics(s.toLowerCase())
    .replace(/[’']/g, "'")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9&' -]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function singularKey(s: string): string {
  return cleanPhrase(s)
    .split(" ")
    .filter(Boolean)
    .map(singularizeWord)
    .join(" ");
}

type Entry = { kind: "ingredient"; ingredient: CatalogIngredient } | { kind: "product"; product: CatalogProduct };

const exactIndex = new Map<string, Entry>();
const singularIndex = new Map<string, Entry>();

function register(term: string, entry: Entry) {
  const exact = cleanPhrase(term);
  if (!exactIndex.has(exact)) exactIndex.set(exact, entry);
  const sing = singularKey(term);
  if (!singularIndex.has(sing)) singularIndex.set(sing, entry);
}

// Canonical names first so they win over aliases on collisions.
for (const ingredient of INGREDIENTS) register(ingredient.name, { kind: "ingredient", ingredient });
for (const product of PRODUCTS) register(product.name, { kind: "product", product });
for (const ingredient of INGREDIENTS) for (const a of ingredient.aliases ?? []) register(a, { kind: "ingredient", ingredient });
for (const product of PRODUCTS) for (const a of product.aliases ?? []) register(a, { kind: "product", product });

const MAX_NGRAM = 4;

function lookup(phrase: string): Entry | undefined {
  return exactIndex.get(cleanPhrase(phrase)) ?? singularIndex.get(singularKey(phrase));
}

/** Finds the longest known sub-phrase ("greek yogurt for breakfast" → greek yogurt). */
function lookupWithin(phrase: string): { entry: Entry; matched: string } | undefined {
  const words = cleanPhrase(phrase).split(" ").filter(Boolean);
  for (let n = Math.min(MAX_NGRAM, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const sub = words.slice(i, i + n).join(" ");
      if (n === 1 && sub.length < 3) continue;
      const entry = lookup(sub);
      if (entry) return { entry, matched: sub };
    }
  }
  return undefined;
}

export function detectBrand(phrase: string): string | undefined {
  const c = cleanPhrase(phrase);
  const brand = KNOWN_BRANDS.find((b) => new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(c));
  return brand ? brand.replace(/\b\w/g, (ch) => ch.toUpperCase()) : undefined;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const CATEGORY_HINTS: [RegExp, ShoppingCategory][] = [
  [/\b(frozen|ice)\b/, "Frozen"],
  [/\b(bread|bun|buns|bagel|croissant|brioche|roll|rolls|muffin|cake|pastr)/, "Bakery"],
  [/\b(cheese|yogh?urt|milk|butter|cream|egg|kefir)/, "Dairy & Eggs"],
  [/\b(chicken|beef|pork|lamb|fish|salmon|tuna|ham|sausage|turkey|duck|mince|steak|prawn|shrimp|mussel|squid|chorizo)/, "Meat & Fish"],
  [/\b(apple|pear|berr|grape|melon|peach|plum|cherr|kiwi|fig|lettuce|salad|leaf|leaves|herb|cabbage|leek|celery|asparagus|pea|bean sprout|corn|squash|pumpkin|beetroot|fennel|artichoke|fruit|veg)/, "Produce"],
  [/\b(juice|water|soda|cola|coke|lemonade|beer|wine|gin|vodka|whisky|drink|squash|coffee|tea)\b/, "Drinks"],
  [/\b(nappy|nappies|diaper|baby|formula|wipes)\b/, "Baby"],
  [/\b(dog|cat|pet|litter)\b/, "Pets"],
  [/\b(shampoo|soap|tooth|floss|mouthwash|deodorant|razor|lotion|moisturi|cream for|makeup|tampon|pads|condom|vitamin|medicine|plaster)/, "Personal Care"],
  [/\b(clean|detergent|bleach|spray|towel|tissue|foil|bag|bags|bulb|batter|candle|polish|brush|sponge|cloth|dishwasher|laundry|toilet)/, "Household"],
  [/\b(sauce|oil|vinegar|spice|salt|sugar|flour|rice|pasta|noodle|tin|can|jar|stock|seed|nut|cereal|oat|snack|crisps|biscuit|chocolate|jam|honey|syrup)/, "Pantry"],
];

export function guessCategory(phrase: string): ShoppingCategory {
  const c = cleanPhrase(phrase);
  for (const [re, cat] of CATEGORY_HINTS) if (re.test(c)) return cat;
  return "Other";
}

/**
 * Resolves a single item phrase (quantity/notes already removed) to a canonical item.
 */
export function resolveItem(phrase: string): ResolvedItem {
  const brand = detectBrand(phrase);
  const cleaned = cleanPhrase(phrase);
  const withoutDescriptors = cleaned.replace(DESCRIPTORS, " ").replace(/\s+/g, " ").trim() || cleaned;
  const generic = GENERIC_TERMS.has(singularKey(withoutDescriptors));

  const direct = lookup(cleaned) ?? lookup(withoutDescriptors);
  const hit = direct ? { entry: direct } : lookupWithin(withoutDescriptors);

  if (hit) {
    const { entry } = hit;
    if (entry.kind === "ingredient") {
      return { kind: "ingredient", name: entry.ingredient.name, display: capitalize(entry.ingredient.name), category: entry.ingredient.category, ingredient: entry.ingredient, brand, generic };
    }
    return { kind: "product", name: entry.product.name, display: capitalize(entry.product.name), category: entry.product.category, product: entry.product, brand, generic };
  }

  const name = singularKey(withoutDescriptors) || cleaned;
  return { kind: "unknown", name, display: capitalize(withoutDescriptors || cleaned), category: guessCategory(withoutDescriptors), brand, generic };
}

export function findIngredient(name: string): CatalogIngredient | undefined {
  const entry = lookup(name);
  return entry?.kind === "ingredient" ? entry.ingredient : undefined;
}

/** All catalogue ingredient names mentioned in a free-text query ("salmon, courgettes and half an avocado"). */
export function findIngredientsInText(text: string): CatalogIngredient[] {
  const words = cleanPhrase(text).split(" ").filter(Boolean);
  const found = new Map<string, CatalogIngredient>();
  const used = new Array<boolean>(words.length).fill(false);
  for (let n = Math.min(MAX_NGRAM, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      if (used.slice(i, i + n).some(Boolean)) continue;
      const sub = words.slice(i, i + n).join(" ");
      if (sub.length < 3) continue;
      const entry = lookup(sub);
      if (entry?.kind === "ingredient") {
        found.set(entry.ingredient.name, entry.ingredient);
        for (let k = i; k < i + n; k++) used[k] = true;
      }
    }
  }
  return [...found.values()];
}

/** Terms that look like ingredients but in queries are usually something else. */
export const QUERY_STOPWORDS = new Set(["pepper", "stock", "oil", "salt", "sugar", "flour", "sauce", "water"]);
