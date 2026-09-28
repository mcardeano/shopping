/**
 * Local semantic embedding.
 *
 * A dependency-free embedding used when no embedding API is configured: tokens are
 * expanded through a small culinary concept lexicon ("comforting" → warm, hearty,
 * baked, creamy…) and feature-hashed into a fixed-size, L2-normalised vector.
 * Negated phrases ("not heavy", "no pasta") contribute negatively.
 *
 * Same dimensionality as the `vector(256)` column, so pgvector cosine search works
 * unchanged. A hosted embedding model can replace this behind AIProvider.generateEmbedding
 * (with a migration to the model's dimension).
 */
import { cleanPhrase, singularizeWord } from "./normalization";

export const EMBEDDING_DIM = 256;

const CONCEPTS: Record<string, string[]> = {
  asian: ["asian", "japanese", "korean", "thai", "chinese", "vietnamese", "indonesian", "soy", "sesame", "miso", "ginger", "teriyaki", "gochujang", "noodle", "sushi", "rice vinegar", "fish sauce", "satay", "pak choi", "tofu", "edamame", "sriracha", "katsu", "ramen", "udon", "stir fry", "stir-frying", "wok"],
  mediterranean: ["mediterranean", "greek", "italian", "feta", "olive", "olives", "oregano", "lemon", "tomato", "orzo", "pasta", "pesto", "basil", "burrata", "couscous", "chickpea", "halloumi", "tzatziki"],
  middle_eastern: ["middle eastern", "levantine", "shawarma", "tahini", "sumac", "za'atar", "harissa", "north african", "moroccan", "pomegranate", "pitta", "flatbread", "hummus", "falafel", "cumin", "chickpea", "labneh"],
  fresh: ["fresh", "crisp", "crunchy", "salad", "cucumber", "herb", "herby", "citrus", "citrusy", "lime", "lemon", "mint", "coriander", "raw", "no-cook", "zingy", "bright", "summery", "light"],
  light: ["light", "lighter", "healthy", "lean", "low calorie", "under 500", "salad", "fresh", "clean", "not heavy", "virtuous"],
  comfort: ["comforting", "comfort", "cozy", "cosy", "warm", "warming", "hearty", "baked", "roasted", "creamy", "pasta", "orzo", "stew", "simmering", "braised", "cheesy", "rich", "indulgent", "soothing", "rainy"],
  rich: ["rich", "heavy", "indulgent", "cheesy", "creamy", "buttery", "decadent", "fried", "burrata", "cream", "filling"],
  spicy: ["spicy", "hot", "chilli", "chili", "harissa", "gochujang", "sriracha", "fiery", "heat", "kick"],
  umami: ["umami", "savory", "savoury", "soy", "miso", "parmesan", "mushroom", "fish sauce", "oyster sauce", "glazed", "caramelised"],
  sweet_savory: ["sweet-savory", "sticky", "glazed", "honey", "teriyaki", "caramelised", "mirin", "maple"],
  quick: ["quick", "fast", "easy", "weeknight", "weekday", "15 min", "20 min", "simple", "speedy", "minutes", "effortless", "busy", "very quick"],
  weekend: ["weekend", "slow", "project", "slower", "sunday", "roast", "hosting", "friends"],
  protein: ["high protein", "protein", "chicken", "beef", "salmon", "tuna", "prawn", "egg", "tofu", "steak", "lean", "gym", "filling"],
  seafood: ["seafood", "fish", "salmon", "tuna", "prawn", "shrimp", "cod", "white fish", "sushi"],
  meat: ["meat", "chicken", "beef", "steak", "pork", "lamb", "mince", "thigh"],
  veg: ["vegetarian", "vegan", "veggie", "plant", "plant-based", "vegetable", "cauliflower", "chickpea", "tofu", "courgette", "aubergine", "lentil"],
  bowl: ["bowl", "rice bowl", "grain bowl", "poke", "buddha", "rice"],
  saucy: ["saucy", "sauce", "dressing", "glaze", "drizzle", "creamy", "satay", "peanut", "tahini"],
  crispy: ["crispy", "crisp", "crunchy", "fried", "air-frying", "golden", "charred", "roasted"],
  kid: ["kid", "kids", "child", "children", "family", "picky", "mild", "kid-friendly", "everyone"],
  tangy: ["tangy", "sour", "pickled", "vinegar", "lime", "lemon", "sumac", "citrusy", "zesty"],
  nutty: ["nutty", "peanut", "sesame", "tahini", "cashew", "almond", "satay"],
};

const conceptOf = new Map<string, string[]>();
for (const [concept, words] of Object.entries(CONCEPTS)) {
  for (const w of words) {
    const key = normalizeToken(w);
    const list = conceptOf.get(key) ?? [];
    list.push(concept);
    conceptOf.set(key, list);
  }
}

function normalizeToken(w: string): string {
  return cleanPhrase(w).split(" ").map(singularizeWord).join(" ");
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const STOP = new Set(["a", "an", "the", "and", "or", "with", "for", "of", "to", "in", "on", "my", "i", "me", "something", "some", "recipe", "recipes", "dinner", "meal", "meals", "make", "want", "like", "that", "this", "it", "is", "are", "be", "but", "tonight", "today", "please", "give", "show", "find", "ve", "have", "had", "saved", "similar", "using", "use"]);
const NEGATORS = new Set(["not", "no", "without", "avoid", "less", "never", "nothing", "don't", "dont", "isn't", "too"]);

function addFeature(vec: Float32Array, feature: string, weight: number) {
  const h = hash(feature);
  const idx = h % EMBEDDING_DIM;
  const sign = (h >>> 16) & 1 ? 1 : -1;
  vec[idx]! += sign * weight;
}

export function embedText(text: string): number[] {
  const vec = new Float32Array(EMBEDDING_DIM);
  const words = cleanPhrase(text).split(" ").filter(Boolean).map(singularizeWord);
  let negateWindow = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (NEGATORS.has(w)) {
      negateWindow = 2;
      continue;
    }
    const polarity = negateWindow > 0 ? -0.8 : 1;
    if (negateWindow > 0) negateWindow--;
    if (STOP.has(w)) continue;

    addFeature(vec, `w:${w}`, 1 * polarity);
    for (const c of conceptOf.get(w) ?? []) addFeature(vec, `c:${c}`, 1.6 * polarity);

    const next = words[i + 1];
    if (next) {
      const bigram = `${w} ${next}`;
      addFeature(vec, `b:${bigram}`, 0.7 * polarity);
      for (const c of conceptOf.get(bigram) ?? []) addFeature(vec, `c:${c}`, 1.6 * polarity);
    }
  }
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += vec[i]! * vec[i]!;
  norm = Math.sqrt(norm) || 1;
  return Array.from(vec, (v) => Math.round((v / norm) * 1e5) / 1e5);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function averageVectors(vectors: { v: number[]; w: number }[]): number[] | undefined {
  if (!vectors.length) return undefined;
  const out = new Array<number>(EMBEDDING_DIM).fill(0);
  for (const { v, w } of vectors) for (let i = 0; i < EMBEDDING_DIM; i++) out[i]! += (v[i] ?? 0) * w;
  const norm = Math.sqrt(out.reduce((s, x) => s + x * x, 0)) || 1;
  return out.map((x) => x / norm);
}

export function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}

export function fromPgVector(v: unknown): number[] | undefined {
  if (Array.isArray(v)) return v as number[];
  if (typeof v === "string" && v.startsWith("[")) return JSON.parse(v) as number[];
  return undefined;
}
