/**
 * Library search: natural-language queries → structured filters + semantic residue.
 * "things I saved from Instagram last month but haven't cooked" →
 *   { source: instagram, savedAfter/Before: last month, notCooked } + no residual text.
 */
import { cleanPhrase, findIngredientsInText, QUERY_STOPWORDS } from "./normalization";
import { parseCookRequest } from "./recommendation";

export type LibraryFilters = {
  favorites?: boolean;
  cooked?: boolean;
  notCooked?: boolean;
  source?: "instagram" | "tiktok" | "website" | "manual" | "image" | "text";
  savedAfter?: string;
  savedBefore?: string;
  kidsLiked?: boolean;
  partnerLiked?: boolean;
  loved?: boolean;
  maxMinutes?: number;
  maxCalories?: number;
  highProtein?: boolean;
  cuisines: string[];
  ingredients: string[];
  exclude: string[];
  tags: string[];
  similarTo?: string;
};

export type ParsedLibraryQuery = { filters: LibraryFilters; residual: string; understood: string[] };

const TAG_WORDS: Record<string, string> = {
  bowl: "bowl", bowls: "bowl", salad: "salad", salads: "salad", vegetarian: "vegetarian", veggie: "vegetarian", vegan: "vegan",
  "one-pan": "one-pan", "one pan": "one-pan", "tray bake": "one-pan", traybake: "one-pan", spicy: "spicy", crispy: "crispy", light: "light",
  "meal prep": "meal prep", "kid-friendly": "kid-friendly", comforting: "comforting", indulgent: "indulgent", "dairy-free": "dairy-free", "gluten-free": "gluten-free",
};

export function parseLibraryQuery(input: string, now = new Date()): ParsedLibraryQuery {
  const t = cleanPhrase(input.replace(/[’]/g, "'"));
  const understood: string[] = [];
  const cook = parseCookRequest({ text: input }, now);
  const f: LibraryFilters = { cuisines: cook.cuisines, ingredients: [], exclude: cook.exclude, tags: [] };
  let residual = t;
  const eat = (re: RegExp) => {
    residual = residual.replace(re, " ");
  };

  if (/\b(favou?rites?|starred|faves?)\b/.test(t)) {
    f.favorites = true;
    understood.push("Favourites");
    eat(/\b(my )?(favou?rites?|starred|faves?)\b/g);
  }
  if (/\b(haven'?t|have not|not yet|never|didn'?t|did not)\s+(cooked|made|tried)|\bnot cooked|\buncooked|\bto try\b/.test(t)) {
    f.notCooked = true;
    understood.push("Not cooked yet");
    eat(/\b(but |that )?(i |we )?(haven'?t|have not|not yet|never|didn'?t|did not)\s+(cooked|made|tried)( yet)?|\bnot cooked( yet)?|\buncooked|\bto try\b/g);
  } else if (/\b(i'?ve|we'?ve|i have|we have)\s+(cooked|made)|\bcooked before|\balready (cooked|made)|\bcook again\b/.test(t)) {
    f.cooked = true;
    understood.push("Cooked");
    eat(/\b(i'?ve|we'?ve|i have|we have)\s+(cooked|made)( before)?|\bcooked before|\balready (cooked|made)|\bcook again\b/g);
  }
  if (/\b(loved|love the most|best rated|top rated)\b/.test(t) && !/\bkids?\b|\bpartner\b/.test(t)) {
    f.loved = true;
    understood.push("Loved");
    eat(/\b(i |we )?(loved|love the most|best rated|top rated)\b/g);
  }
  const src = t.match(/\b(instagram|insta|ig|tiktok|tik tok|websites?|blogs?|screenshots?|photos?)\b/);
  if (src) {
    const s = src[1]!;
    f.source = /insta|ig/.test(s) ? "instagram" : /tik/.test(s) ? "tiktok" : /screenshot|photo/.test(s) ? "image" : "website";
    understood.push(`From ${f.source === "image" ? "screenshots" : f.source.charAt(0).toUpperCase() + f.source.slice(1)}`);
    eat(/\b(i )?(saved |found )?(from|on|off)?\s*(instagram|insta|ig|tiktok|tik tok|websites?|blogs?|screenshots?|photos?)\b/g);
  }
  if (/\blast month\b/.test(t)) {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    f.savedAfter = start.toISOString();
    f.savedBefore = end.toISOString();
    understood.push("Saved last month");
    eat(/\blast month\b/g);
  } else if (/\b(this|past|last) week\b|\brecently\b|\blately\b/.test(t)) {
    const days = /\bweek\b/.test(t) ? 7 : 21;
    f.savedAfter = new Date(now.getTime() - days * 86_400_000).toISOString();
    understood.push(days === 7 ? "Saved this week" : "Saved recently");
    eat(/\b(this|past|last) week\b|\brecently\b|\blately\b/g);
  } else if (/\bthis month\b/.test(t)) {
    f.savedAfter = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    understood.push("Saved this month");
    eat(/\bthis month\b/g);
  }
  if (/\b(kids?|children)\b.*\b(liked|loved|like|love|ate|eat|enjoyed)\b|\bkid[- ]approved\b/.test(t)) {
    f.kidsLiked = true;
    understood.push("Kids liked");
    eat(/\b(my |the |our )?(kids?|children)\b( liked| loved| like| love| ate| eat| enjoyed| will eat)?|\bkid[- ]approved\b/g);
  }
  if (/\b(partner|husband|wife|boyfriend|girlfriend)\b.*\b(liked|loved|likes)\b/.test(t)) {
    f.partnerLiked = true;
    understood.push("Partner liked");
    eat(/\b(my )?(partner|husband|wife|boyfriend|girlfriend)\b( liked| loved| likes)?/g);
  }
  if (cook.maxMinutes) {
    f.maxMinutes = cook.maxMinutes;
    understood.push(`Under ${cook.maxMinutes} min`);
    eat(/\b(under|in|less than|within|max)?\s*\d{1,3}\s*(min|mins|minute|minutes)\b|\b(quick|fast|speedy)\b/g);
  }
  if (cook.maxCalories) {
    f.maxCalories = cook.maxCalories;
    understood.push(`Under ${cook.maxCalories} kcal`);
    eat(/\b(under|less than|below|max)\s*\d{3,4}\s*(cal|cals|calories|kcal)\b/g);
  }
  if (cook.highProtein) {
    f.highProtein = true;
    understood.push("High protein");
    eat(/\bhigh[ -]?protein\b/g);
  }
  if (!cook.similarTo) for (const c of cook.cuisines) understood.push(c.replace(/\b\w/g, (x) => x.toUpperCase()));
  if (cook.similarTo) {
    f.similarTo = cook.similarTo;
    // "similar to the Korean beef bowl" is about closeness, not a Korean-only filter.
    f.cuisines = [];
    understood.splice(0, understood.length, ...understood.filter((u) => !cook.cuisines.some((c) => c.toLowerCase() === u.toLowerCase())));
    understood.push(`Similar to “${cook.similarTo}”`);
  }
  for (const [word, tag] of Object.entries(TAG_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(t) && !f.tags.includes(tag)) f.tags.push(tag);
  }
  if (!f.similarTo) {
    const ings = findIngredientsInText(t)
      .map((i) => i.name)
      .filter((n) => !QUERY_STOPWORDS.has(n) && !f.exclude.includes(n));
    f.ingredients = ings;
    for (const i of ings) understood.push(i.charAt(0).toUpperCase() + i.slice(1));
  }
  for (const e of f.exclude) understood.push(`No ${e}`);

  residual = residual
    .replace(/\b(recipes?|things?|stuff|dishes|meals?|ideas?|show me|find|give me|i saved|we saved|saved|i found|with|and|or|that|which|some|any|my|the|a|an|for|from|to|me|i|we|what|all|something|but|dinners?|lunch(es)?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { filters: f, residual, understood: [...new Set(understood)] };
}
