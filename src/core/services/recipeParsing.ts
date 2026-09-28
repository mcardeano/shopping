/**
 * Heuristic recipe parsing: ingredient lines, pasted text / captions, schema.org JSON-LD.
 * Used directly by the local AI provider and as a pre/post-processor for LLM extraction.
 */
import type { IngredientLineDraft, RecipeDraft } from "../domain/schemas";
import { canonicalUnit, parseQuantity } from "../text/quantity";
import { capitalize, cleanPhrase, findIngredient, resolveItem } from "./normalization";

const OPTIONAL_RE = /\b(optional|to serve|for serving|to garnish|for garnish|if you like|if desired)\b/i;

export function parseIngredientLine(line: string): IngredientLineDraft | null {
  const rawText = line
    .replace(/^[\s•·*\-–—▪◦●○✓✔☐]+/, "")
    .replace(/^\d+[.)]\s+(?=[a-zA-Z])/, "")
    .trim();
  if (!rawText || rawText.length > 300) return null;

  // Split preparation note: "2 salmon fillets, skin on" / "garlic (minced)"
  let main = rawText;
  let preparation: string | undefined;
  const paren = main.match(/\(([^)]*)\)/);
  if (paren) {
    preparation = paren[1]!.trim();
    main = main.replace(paren[0], " ").trim();
  }
  const comma = main.indexOf(",");
  if (comma > 0) {
    const after = main.slice(comma + 1).trim();
    preparation = [after, preparation].filter(Boolean).join(", ") || undefined;
    main = main.slice(0, comma).trim();
  }

  const q = parseQuantity(main);
  let name = q.rest.replace(/^(of|the)\s+/i, "").trim();
  // "salt and pepper to taste" → drop the trailing phrase
  name = name.replace(/\b(to taste|as needed|or to taste)\b/gi, "").trim();
  if (!name) return null;

  const resolved = resolveItem(name);
  const canonical = resolved.kind === "unknown" ? cleanPhrase(name) : resolved.name;

  let unit = q.unit;
  // "2 salmon fillets" → keep as count; unit "fillet" only when it was explicit
  if (!unit && q.amount != null) {
    const noun = name.split(" ").pop() ?? "";
    const u = canonicalUnit(noun);
    if (u === "fillet" || u === "clove") unit = u;
  }

  return {
    rawText,
    name: canonical,
    amount: q.amount != null && q.amount > 0 ? q.amount : undefined,
    unit,
    preparation,
    optional: OPTIONAL_RE.test(rawText),
  };
}

const SECTION_INGREDIENTS = /^\s*(ingredients?|you(?:'| wi)ll need|what you need|shopping list)\s*:?\s*$/i;
const SECTION_STEPS = /^\s*(method|instructions?|directions?|steps?|preparation|how to make( it)?|to make)\s*:?\s*$/i;
const SECTION_OTHER = /^\s*(notes?|tips?|nutrition|serving suggestions?)\s*:?\s*$/i;
const HASHTAG_LINE = /^(\s*#\w+\s*)+$/;

export function parseMinutes(text: string): number | undefined {
  const h = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i);
  const m = text.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/i);
  if (!h && !m) return undefined;
  return Math.round((h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0));
}

/** Parses ISO-8601 durations used by schema.org ("PT1H20M"). */
export function parseIsoDuration(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const m = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return parseMinutes(value);
  const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return total > 0 ? total : undefined;
}

function looksLikeIngredient(line: string): boolean {
  const l = line.trim();
  if (l.length > 120) return false;
  if (/^[•·*\-–—▪◦●○]/.test(l)) return true;
  const q = parseQuantity(l.replace(/^[•·*\-–—\s]+/, ""));
  if (q.amount != null && q.rest.split(" ").length <= 8) return true;
  return !!findIngredient(l) && l.split(" ").length <= 5;
}

function looksLikeStep(line: string): boolean {
  const l = line.trim();
  return /^(\d+[.)]|step \d+)/i.test(l) || (l.split(" ").length >= 7 && /[.!]$/.test(l));
}

/**
 * Best-effort structure from pasted text or a social caption.
 * Handles explicit sections ("Ingredients", "Method") and unstructured captions.
 */
export function parseRecipeText(input: string): Partial<RecipeDraft> & { title?: string } {
  const text = input.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !HASHTAG_LINE.test(l));

  let title: string | undefined;
  const ingredients: IngredientLineDraft[] = [];
  const steps: string[] = [];
  const description: string[] = [];
  let mode: "intro" | "ingredients" | "steps" | "other" = "intro";
  let sawSections = false;

  for (const line of lines) {
    if (SECTION_INGREDIENTS.test(line)) {
      mode = "ingredients";
      sawSections = true;
      continue;
    }
    if (SECTION_STEPS.test(line)) {
      mode = "steps";
      sawSections = true;
      continue;
    }
    if (SECTION_OTHER.test(line)) {
      mode = "other";
      continue;
    }
    if (mode === "intro") {
      if (!title && line.length <= 90 && !looksLikeIngredient(line)) {
        title = line.replace(/[🔥✨🥗🍜🍣🍗🥩🐟🌱😍👇⬇️]+/gu, "").replace(/[!.:]+$/, "").trim();
        continue;
      }
      if (!sawSections && looksLikeIngredient(line)) {
        mode = "ingredients";
      } else {
        // "Serves 2 · 25 mins" is metadata, not a description.
        if (!/^(serves|servings?|makes|feeds|ready in|prep|cook|total|\d+\s*(min|mins|minutes))\b/i.test(line)) description.push(line);
        continue;
      }
    }
    if (mode === "ingredients") {
      if (looksLikeStep(line) && !looksLikeIngredient(line)) {
        mode = "steps";
      } else {
        const parsed = parseIngredientLine(line);
        if (parsed) ingredients.push(parsed);
        continue;
      }
    }
    if (mode === "steps") {
      const step = line.replace(/^(\d+[.)]|step \d+[:.]?)\s*/i, "").trim();
      if (step) steps.push(step);
    }
  }

  const all = lines.join(" ");
  const servings = all.match(/\b(?:serves|servings?|feeds|makes)\s*:?\s*(\d+)/i);
  const total = all.match(/\b(?:total(?: time)?|ready in|takes)\s*:?\s*([^.,;]+)/i);
  const prep = all.match(/\bprep(?: time)?\s*:?\s*([^.,;]+)/i);
  const cook = all.match(/\bcook(?:ing)?(?: time)?\s*:?\s*([^.,;]+)/i);
  const anyTime = all.match(/\b(\d+)\s*(?:min|mins|minutes)\b/i);

  return {
    title: title ? capitalize(title) : undefined,
    description: description.slice(0, 2).join(" ").slice(0, 400) || undefined,
    ingredients,
    steps,
    servings: servings ? Number(servings[1]) : undefined,
    prepTimeMinutes: prep ? parseMinutes(prep[1]!) : undefined,
    cookTimeMinutes: cook ? parseMinutes(cook[1]!) : undefined,
    totalTimeMinutes: total ? parseMinutes(total[1]!) : anyTime ? Number(anyTime[1]) : undefined,
  };
}

// ── schema.org JSON-LD ───────────────────────────────────────────────────────

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function str(v: Json | undefined): string | undefined {
  if (typeof v === "string") return decodeEntities(v).trim() || undefined;
  if (typeof v === "number") return String(v);
  return undefined;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function findRecipeNode(node: Json): { [k: string]: Json } | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipeNode(n);
      if (r) return r;
    }
    return undefined;
  }
  const type = node["@type"];
  if (asArray(type as Json).some((t) => typeof t === "string" && t.toLowerCase() === "recipe")) return node;
  if (node["@graph"]) return findRecipeNode(node["@graph"]);
  return undefined;
}

function instructionsToSteps(v: Json | undefined): string[] {
  const out: string[] = [];
  for (const item of asArray(v as Json)) {
    if (typeof item === "string") {
      out.push(...decodeEntities(item).split(/\n+|(?<=\.)\s+(?=\d+\.\s)/).map((s) => s.trim()).filter(Boolean));
    } else if (item && typeof item === "object" && !Array.isArray(item)) {
      if (item["itemListElement"]) out.push(...instructionsToSteps(item["itemListElement"]));
      else {
        const t = str(item["text"]) ?? str(item["name"]);
        if (t) out.push(t);
      }
    }
  }
  return out;
}

function firstImage(v: Json | undefined): string | undefined {
  for (const item of asArray(v as Json)) {
    if (typeof item === "string" && /^https?:/.test(item)) return item;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const url = str(item["url"]) ?? str(item["contentUrl"]);
      if (url) return url;
    }
  }
  return undefined;
}

function numberFrom(v: Json | undefined): number | undefined {
  const s = str(Array.isArray(v) ? v[0] : v);
  if (!s) return undefined;
  const m = s.match(/(\d+(?:[.,]\d+)?)/);
  return m ? Math.round(Number(m[1]!.replace(",", "."))) : undefined;
}

/** Extracts a schema.org Recipe from an HTML page, if present. */
export function extractJsonLdRecipe(html: string): Partial<RecipeDraft> | undefined {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    let data: Json;
    try {
      data = JSON.parse(block[1]!.trim()) as Json;
    } catch {
      continue;
    }
    const r = findRecipeNode(data);
    if (!r) continue;
    const nutrition = (r["nutrition"] && typeof r["nutrition"] === "object" && !Array.isArray(r["nutrition"]) ? r["nutrition"] : {}) as { [k: string]: Json };
    const author = asArray(r["author"] as Json)[0];
    const creator = typeof author === "string" ? author : author && typeof author === "object" && !Array.isArray(author) ? str(author["name"]) : undefined;
    const ingredients = asArray(r["recipeIngredient"] as Json)
      .map((l) => (typeof l === "string" ? parseIngredientLine(decodeEntities(l)) : null))
      .filter((x): x is IngredientLineDraft => !!x);
    const cuisine = str(asArray(r["recipeCuisine"] as Json)[0]);
    const category = str(asArray(r["recipeCategory"] as Json)[0]);
    const keywords = typeof r["keywords"] === "string" ? r["keywords"].split(",").map((k) => k.trim().toLowerCase()).filter(Boolean) : [];
    return {
      title: str(r["name"]),
      description: str(r["description"])?.slice(0, 600),
      imageUrl: firstImage(r["image"]),
      sourceCreator: creator,
      servings: numberFrom(r["recipeYield"]),
      prepTimeMinutes: parseIsoDuration(r["prepTime"]),
      cookTimeMinutes: parseIsoDuration(r["cookTime"]),
      totalTimeMinutes: parseIsoDuration(r["totalTime"]),
      caloriesPerServing: numberFrom(nutrition["calories"]),
      proteinGrams: numberFrom(nutrition["proteinContent"]),
      carbsGrams: numberFrom(nutrition["carbohydrateContent"]),
      fatGrams: numberFrom(nutrition["fatContent"]),
      nutritionIsEstimate: nutrition["calories"] == null,
      cuisine,
      mealType: category?.toLowerCase(),
      tags: keywords.slice(0, 8),
      ingredients,
      steps: instructionsToSteps(r["recipeInstructions"]),
    };
  }
  return undefined;
}

/** Reads OpenGraph / meta tags — the fallback for social posts and pages without JSON-LD. */
export function extractMeta(html: string): { title?: string; description?: string; image?: string; siteName?: string } {
  const meta = (prop: string) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
    const m = html.match(re);
    const v = m?.[1] ?? m?.[2];
    return v ? decodeEntities(v) : undefined;
  };
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return {
    title: meta("og:title") ?? (titleTag ? decodeEntities(titleTag) : undefined),
    description: meta("og:description") ?? meta("description"),
    image: meta("og:image") ?? meta("twitter:image"),
    siteName: meta("og:site_name"),
  };
}

/** Visible text of a page (scripts/styles removed), for LLM extraction. */
export function htmlToText(html: string, maxChars = 30000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|\/p|\/li|\/h\d|\/div)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, maxChars);
}

export function detectPlatform(url: string): "instagram" | "tiktok" | "website" {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.endsWith("instagram.com")) return "instagram";
    if (host.endsWith("tiktok.com")) return "tiktok";
  } catch {
    /* fallthrough */
  }
  return "website";
}
