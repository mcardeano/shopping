/**
 * TasteInferenceService (pure parts)
 * - recipeFeatures: what a recipe "is made of" in taste terms
 * - inferTasteProfile: evolving preferences from saves, cooks, ratings, feedback, rejections
 * - interpretFeedback / parsePreferenceStatement: free text → structured signals (local rules;
 *   the Anthropic provider can do this with an LLM behind the same interface)
 */
import type { PreferenceStatement, Reaction, TasteEntityType, TasteSignal, TasteSignals } from "../domain/schemas";
import { cuisineFamily, CUISINE_FAMILY_LABEL } from "../domain/categories";
import { capitalize, cleanPhrase, findIngredient, findIngredientsInText } from "./normalization";
import { mainProtein } from "./enrichment";

export type Feature = { entityType: TasteEntityType; value: string; label: string };

const FLAVOR_LABELS: Record<string, string> = {
  soy: "Soy",
  sesame: "Sesame",
  miso: "Miso",
  ginger: "Ginger",
  garlic: "Garlic",
  tahini: "Tahini",
  harissa: "Harissa",
  gochujang: "Gochujang",
  peanut: "Peanut",
  lemon: "Lemon",
  lime: "Lime",
  herbs: "Fresh herbs",
  spicy: "Spicy food",
  cheese: "Cheese",
  "warm spices": "Warm spices",
  umami: "Umami",
  sweet: "Sweetness",
  tangy: "Tangy flavours",
  smoky: "Smoky flavours",
  "za'atar": "Za'atar",
  chickpeas: "Chickpeas",
  pesto: "Pesto",
  "spring onion": "Spring onion",
};

const TAG_FEATURES: Record<string, Feature> = {
  bowl: { entityType: "meal_type", value: "bowls", label: "Bowls" },
  salad: { entityType: "meal_type", value: "salads", label: "Salads" },
  "high protein": { entityType: "attribute", value: "high protein", label: "High-protein meals" },
  saucy: { entityType: "attribute", value: "saucy", label: "Saucy dishes" },
  crispy: { entityType: "texture", value: "crispy", label: "Crispy textures" },
  quick: { entityType: "habit", value: "quick", label: "Quick dinners" },
  indulgent: { entityType: "attribute", value: "indulgent", label: "Indulgent meals" },
  comforting: { entityType: "attribute", value: "comforting", label: "Comfort food" },
  light: { entityType: "attribute", value: "light", label: "Lighter meals" },
  "one-pan": { entityType: "technique", value: "one-pan", label: "One-pan cooking" },
};

const FLAVOR_TAG_FEATURES: Record<string, Feature> = {
  cheesy: { entityType: "attribute", value: "very cheesy", label: "Very cheesy dishes" },
  spicy: { entityType: "flavor", value: "spicy", label: "Spicy food" },
  fresh: { entityType: "attribute", value: "fresh", label: "Fresh, bright food" },
  creamy: { entityType: "texture", value: "creamy", label: "Creamy dishes" },
  "sweet-savory": { entityType: "flavor", value: "sweet-savory", label: "Sweet-savoury glazes" },
};

export type RecipeLike = {
  id: string;
  title: string;
  cuisine: string | null;
  tags: string[];
  flavors: string[];
  techniques: string[];
  totalTimeMinutes: number | null;
  caloriesPerServing: number | null;
  difficulty: string | null;
  ingredients: { normalizedName: string; optional?: boolean }[];
};

export function recipeFeatures(r: RecipeLike): Feature[] {
  const features = new Map<string, Feature>();
  const add = (f: Feature) => features.set(`${f.entityType}:${f.value}`, f);
  const names = r.ingredients.map((i) => i.normalizedName);

  const protein = mainProtein(names);
  if (protein) add({ entityType: "ingredient", value: protein, label: capitalize(protein) });
  for (const n of names) {
    const ing = findIngredient(n);
    if (!ing) continue;
    if (ing.role === "protein" && !protein) add({ entityType: "ingredient", value: ing.name, label: capitalize(ing.name) });
    for (const k of ing.flavorKeys ?? []) {
      if (k === "sweet" || k === "herbs") continue;
      if (k === "cheese") continue; // captured by the "very cheesy" attribute
      add({ entityType: k === "spicy" ? "flavor" : "ingredient", value: k, label: FLAVOR_LABELS[k] ?? capitalize(k) });
    }
  }

  const family = cuisineFamily(r.cuisine);
  if (family && CUISINE_FAMILY_LABEL[family]) add({ entityType: "cuisine", value: family, label: CUISINE_FAMILY_LABEL[family]! });
  else if (r.cuisine) add({ entityType: "cuisine", value: r.cuisine.toLowerCase(), label: r.cuisine });

  for (const t of r.tags) {
    const f = TAG_FEATURES[t.toLowerCase()];
    if (f) add(f);
  }
  for (const fl of r.flavors) {
    const f = FLAVOR_TAG_FEATURES[fl.toLowerCase()];
    if (f) add(f);
  }
  if (r.difficulty === "hard" || (r.totalTimeMinutes ?? 0) > 60) add({ entityType: "attribute", value: "complicated", label: "Complicated recipes" });
  return [...features.values()];
}

export type RecipeEvidence = {
  recipe: RecipeLike;
  saved: boolean;
  opens: number;
  timesCooked: number;
  isFavorite: boolean;
  reaction: Reaction | null;
  rejections: number;
  feedbackSignals: TasteSignal[];
};

export type InferredPreference = Feature & {
  score: number;
  confidence: number;
  evidenceCount: number;
  source: "saved_recipe" | "cooked_recipe" | "feedback" | "recommendation_rejection";
};

const REACTION_WEIGHT: Record<Reaction, number> = { loved: 0.9, good: 0.35, not_for_me: -1.1 };

export function recipeWeight(e: RecipeEvidence): number {
  let w = e.saved ? 0.15 : 0;
  w += Math.min(e.opens, 5) * 0.03;
  w += Math.min(e.timesCooked, 4) * 0.3;
  if (e.isFavorite) w += 0.5;
  if (e.reaction) w += REACTION_WEIGHT[e.reaction];
  w -= e.rejections * 0.25;
  return w;
}

export function inferTasteProfile(evidence: RecipeEvidence[]): InferredPreference[] {
  type Acc = Feature & { sum: number; pos: number; neg: number; count: number; cooked: boolean; feedback: boolean; rejected: boolean };
  const acc = new Map<string, Acc>();
  const bump = (f: Feature, delta: number, flags: Partial<Pick<Acc, "cooked" | "feedback" | "rejected">> = {}) => {
    const key = `${f.entityType}:${f.value}`;
    const a = acc.get(key) ?? { ...f, sum: 0, pos: 0, neg: 0, count: 0, cooked: false, feedback: false, rejected: false };
    a.sum += delta;
    if (delta > 0) a.pos += delta;
    else a.neg -= delta;
    a.count += 1;
    a.cooked ||= !!flags.cooked;
    a.feedback ||= !!flags.feedback;
    a.rejected ||= !!flags.rejected;
    acc.set(key, a);
  };

  for (const e of evidence) {
    const w = recipeWeight(e);
    if (Math.abs(w) < 0.05) continue;
    for (const f of recipeFeatures(e.recipe)) {
      // Negative reactions shouldn't make you "dislike" salmon because one salmon dish failed —
      // only distinctive attributes (cheesy, complicated, spicy) carry negative weight at full strength.
      const damp = w < 0 && f.entityType !== "attribute" && f.entityType !== "flavor" ? 0.35 : 1;
      bump(f, w * damp, { cooked: e.timesCooked > 0, rejected: e.rejections > 0 });
    }
    for (const s of e.feedbackSignals) bump(s, s.score * 1.2, { feedback: true });
  }

  const out: InferredPreference[] = [];
  const total = Math.max(1, evidence.length);
  for (const a of acc.values()) {
    if (a.count < 2 && !a.feedback) continue;
    // Average weight per occurrence, with confidence growing in the number of occurrences.
    const mean = a.sum / a.count;
    let score = Math.tanh(1.6 * mean) * (a.count / (a.count + 1.5));
    // Near-universal features (garlic, lemon…) say little about taste.
    const share = a.count / total;
    if (share > 0.45 && !a.feedback) score *= Math.max(0.35, 1 - (share - 0.45) * 1.6);
    if (Math.abs(score) < 0.25) continue;
    out.push({
      entityType: a.entityType,
      value: a.value,
      label: a.label,
      score: Math.round(score * 100) / 100,
      confidence: Math.round(Math.min(0.95, 0.3 + 0.08 * a.count + (a.feedback ? 0.15 : 0)) * 100) / 100,
      evidenceCount: a.count,
      source: a.feedback ? "feedback" : a.cooked ? "cooked_recipe" : a.rejected && a.sum < 0 ? "recommendation_rejection" : "saved_recipe",
    });
  }
  const likes = out.filter((p) => p.score > 0).sort((a, b) => b.score * b.confidence - a.score * a.confidence).slice(0, 18);
  const avoids = out.filter((p) => p.score < 0).sort((a, b) => a.score * a.confidence - b.score * b.confidence).slice(0, 8);
  return [...likes, ...avoids];
}

/** Cooking habits from when things were cooked. */
export function inferHabits(cooks: { at: string; totalTimeMinutes: number | null; caloriesPerServing: number | null; tags: string[] }[]): InferredPreference[] {
  const weekday = cooks.filter((c) => {
    const d = new Date(c.at).getDay();
    return d >= 1 && d <= 4;
  });
  const weekend = cooks.filter((c) => {
    const d = new Date(c.at).getDay();
    return d === 5 || d === 6 || d === 0;
  });
  const out: InferredPreference[] = [];
  const quickShare = weekday.length ? weekday.filter((c) => (c.totalTimeMinutes ?? 99) <= 30).length / weekday.length : 0;
  if (weekday.length >= 3 && quickShare >= 0.6) {
    out.push({ entityType: "habit", value: "quick weekday", label: "Under 30 minutes on weekdays", score: Math.round(quickShare * 100) / 100, confidence: Math.min(0.9, 0.4 + weekday.length * 0.05), evidenceCount: weekday.length, source: "cooked_recipe" });
  }
  const avg = (xs: typeof cooks) => xs.reduce((s, c) => s + (c.caloriesPerServing ?? 550), 0) / Math.max(1, xs.length);
  if (weekend.length >= 2 && weekday.length >= 2 && avg(weekend) - avg(weekday) > 60) {
    out.push({ entityType: "habit", value: "weekend treat", label: "More indulgent at weekends", score: 0.6, confidence: 0.6, evidenceCount: weekend.length, source: "cooked_recipe" });
  }
  if (weekday.length >= 3 && avg(weekday) < 620) {
    out.push({ entityType: "habit", value: "lighter weekdays", label: "Lighter dinners during the week", score: 0.55, confidence: 0.55, evidenceCount: weekday.length, source: "cooked_recipe" });
  }
  return out;
}

// ── Free-text interpretation (local rules) ────────────────────────────────────

const ATTRIBUTE_PATTERNS: { re: RegExp; signal: TasteSignal }[] = [
  { re: /too (?:much )?chees(?:y|e)|overly cheesy|too rich with cheese/, signal: { entityType: "attribute", value: "very cheesy", label: "Very cheesy dishes", score: -0.8 } },
  { re: /too (?:much )?(?:effort|work|complicated|fiddly|long)|too many steps|took forever|so much washing up/, signal: { entityType: "attribute", value: "complicated", label: "Complicated recipes", score: -0.7 } },
  { re: /too sweet/, signal: { entityType: "flavor", value: "very sweet", label: "Very sweet dishes", score: -0.6 } },
  { re: /too spicy|too hot|burned my mouth/, signal: { entityType: "flavor", value: "very spicy", label: "Very spicy food", score: -0.6 } },
  { re: /too salty/, signal: { entityType: "flavor", value: "very salty", label: "Very salty dishes", score: -0.5 } },
  { re: /too (?:heavy|rich|greasy|oily)/, signal: { entityType: "attribute", value: "heavy", label: "Heavy, rich dishes", score: -0.6 } },
  { re: /too bland|a bit bland|needed more flavou?r/, signal: { entityType: "attribute", value: "bold flavours", label: "Bold flavours", score: 0.5 } },
  { re: /perfect (?:weekday|weeknight|midweek)|great (?:weekday|weeknight)|so quick|super quick|really quick/, signal: { entityType: "habit", value: "quick weekday", label: "Quick weekday dinners", score: 0.7 } },
  { re: /(?:loved|love|great|amazing|best) (?:the )?sauce|sauce was (?:amazing|great|incredible|perfect)/, signal: { entityType: "attribute", value: "saucy", label: "Saucy dishes", score: 0.6 } },
  { re: /(?:crispy|crunch)/, signal: { entityType: "texture", value: "crispy", label: "Crispy textures", score: 0.4 } },
  { re: /(?:dry|overcooked)/, signal: { entityType: "attribute", value: "dry textures", label: "Dry textures", score: -0.4 } },
  { re: /filling|kept me full|satisfying/, signal: { entityType: "attribute", value: "high protein", label: "Filling, high-protein meals", score: 0.4 } },
  { re: /(?:fresh|light|zingy|bright)/, signal: { entityType: "attribute", value: "fresh", label: "Fresh, bright food", score: 0.4 } },
];

const POSITIVE = /\b(lov(?:ed|e)|delicious|amazing|great|perfect|fantastic|so good|really good|yum|excellent|winner|keeper|brilliant|incredible|tasty|devoured)\b/;
const NEGATIVE = /\b(didn'?t like|did not like|not for me|disliked|hated|won'?t make again|never again|meh|disappointing|bland|awful|not great|wasn'?t great|wasn'?t a fan|not a fan)\b/;

function sentence(text: string): string {
  return cleanPhrase(text.replace(/[’]/g, "'"));
}

export function interpretFeedback(comment: string, reaction?: Reaction | null): TasteSignals {
  const t = sentence(comment);
  const signals: TasteSignal[] = [];
  const adjustments: TasteSignals["adjustments"] = [];
  const household: TasteSignals["household"] = [];

  for (const { re, signal } of ATTRIBUTE_PATTERNS) if (re.test(t)) signals.push(signal);

  // "less tahini", "more garlic", "use less sauce"
  for (const m of t.matchAll(/\b(less|more|fewer|extra|double|half(?: the)?)\s+([a-z' ]{3,30}?)(?=\s+(?:next|than|and|but|or)\b|$|\s*[,.])/g)) {
    const dir = /less|fewer|half/.test(m[1]!) ? "decrease" : "increase";
    const thing = m[2]!.trim().replace(/^the\s+/, "");
    const ing = findIngredientsInText(thing)[0];
    adjustments.push({ attribute: ing ? `${ing.name}_quantity` : `${thing.replace(/\s+/g, "_")}_quantity`, direction: dir });
    if (ing && dir === "decrease") signals.push({ entityType: "ingredient", value: ing.name, label: capitalize(ing.name), score: -0.15 });
  }

  // "liked the sauce but not the chicken" / "not a fan of the chicken"
  const notThe = t.match(/\bbut not (?:the |so much the )?([a-z ]{3,30})$/) ?? t.match(/\bnot (?:a )?(?:big )?fan of (?:the )?([a-z ]{3,30})/);
  if (notThe) {
    const ing = findIngredientsInText(notThe[1]!)[0];
    if (ing) signals.push({ entityType: "ingredient", value: ing.name, label: capitalize(ing.name), score: -0.3 });
  }

  // Household mentions
  const memberRe: [RegExp, TasteSignals["household"][number]["member"]][] = [
    [/\b(kids?|children|little ones?|the boys|the girls|son|daughter)\b/, "kids"],
    [/\b(partner|husband|wife|boyfriend|girlfriend|hubby|fiance|fiancee|other half)\b/, "partner"],
    [/\b(everyone|the whole family|all of us)\b/, "everyone"],
  ];
  for (const [re, member] of memberRe) {
    const m = t.match(re);
    if (!m) continue;
    const after = t.slice(m.index ?? 0);
    const clause = after.split(/\bbut\b|;|\./)[0] ?? after;
    const r: Reaction = NEGATIVE.test(clause) || /\b(didn'?t|did not|wouldn'?t|refused|wasn'?t keen|not keen|hated|picked)\b/.test(clause) ? "not_for_me" : /\blov|devour|inhal|ask(?:ed)? for (?:more|seconds)|clean plates|obsessed/.test(clause) ? "loved" : "good";
    household.push({ member, reaction: r });
  }

  // Sentiment: remove household clauses so "my kids loved it" doesn't count as the user's own reaction
  let own = t;
  for (const [re] of memberRe) own = own.replace(new RegExp(`${re.source}[^,.;]*`, "g"), " ");
  const pos = POSITIVE.test(own);
  const neg = NEGATIVE.test(own) || signals.some((s) => s.score < -0.5);
  let sentiment: TasteSignals["sentiment"] = pos && neg ? "mixed" : pos ? "positive" : neg ? "negative" : "neutral";
  if (sentiment === "neutral" && reaction) sentiment = reaction === "loved" ? "positive" : reaction === "not_for_me" ? "negative" : "neutral";
  if (sentiment === "positive" && signals.some((s) => s.score < 0)) sentiment = "mixed";

  return { sentiment, signals: dedupeSignals(signals), adjustments, household };
}

function dedupeSignals(signals: TasteSignal[]): TasteSignal[] {
  const m = new Map<string, TasteSignal>();
  for (const s of signals) m.set(`${s.entityType}:${s.value}`, s);
  return [...m.values()];
}

const CUISINE_WORDS: Record<string, Feature> = {
  asian: { entityType: "cuisine", value: "asian", label: "Asian" },
  japanese: { entityType: "cuisine", value: "asian", label: "Asian" },
  korean: { entityType: "cuisine", value: "asian", label: "Asian" },
  thai: { entityType: "cuisine", value: "asian", label: "Asian" },
  chinese: { entityType: "cuisine", value: "asian", label: "Asian" },
  mediterranean: { entityType: "cuisine", value: "mediterranean", label: "Mediterranean" },
  greek: { entityType: "cuisine", value: "mediterranean", label: "Mediterranean" },
  italian: { entityType: "cuisine", value: "italian", label: "Italian" },
  "middle eastern": { entityType: "cuisine", value: "middle eastern", label: "Middle Eastern" },
  lebanese: { entityType: "cuisine", value: "middle eastern", label: "Middle Eastern" },
  mexican: { entityType: "cuisine", value: "mexican", label: "Mexican" },
  indian: { entityType: "cuisine", value: "indian", label: "Indian" },
};

const ATTRIBUTE_WORDS: [RegExp, Feature][] = [
  [/\bspic(?:y|e)\b|\bheat\b|\bchill?i/, { entityType: "flavor", value: "spicy", label: "Spicy food" }],
  [/\bchees(?:y|e)\b/, { entityType: "attribute", value: "very cheesy", label: "Very cheesy dishes" }],
  [/\bcreamy\b/, { entityType: "texture", value: "creamy", label: "Creamy dishes" }],
  [/\bcrispy|crunchy\b/, { entityType: "texture", value: "crispy", label: "Crispy textures" }],
  [/\bhigh[- ]protein|protein\b/, { entityType: "attribute", value: "high protein", label: "High-protein meals" }],
  [/\bsauc(?:e|es|y)\b/, { entityType: "attribute", value: "saucy", label: "Saucy dishes" }],
  [/\bbowls?\b/, { entityType: "meal_type", value: "bowls", label: "Bowls" }],
  [/\bsalads?\b/, { entityType: "meal_type", value: "salads", label: "Salads" }],
  [/\bcomplicated|fiddly|long recipes|lots of steps\b/, { entityType: "attribute", value: "complicated", label: "Complicated recipes" }],
  [/\bquick|fast|under 30|30[- ]minute/, { entityType: "habit", value: "quick", label: "Quick dinners" }],
  [/\bsweet\b/, { entityType: "flavor", value: "very sweet", label: "Very sweet dishes" }],
  [/\bheavy|rich food\b/, { entityType: "attribute", value: "heavy", label: "Heavy, rich dishes" }],
  [/\bvegetarian|meat[- ]free|meatless|plant[- ]based\b/, { entityType: "attribute", value: "vegetarian", label: "Vegetarian meals" }],
  [/\bfish|seafood\b/, { entityType: "ingredient", value: "seafood", label: "Fish & seafood" }],
];

/** "I don't really like blue cheese" → blue cheese, −0.7, explicit. */
export function parsePreferenceStatement(text: string): PreferenceStatement {
  const t = sentence(text);
  const member: PreferenceStatement["member"] = /\b(kids?|children|son|daughter)\b/.test(t) ? "kids" : /\b(partner|husband|wife|boyfriend|girlfriend)\b/.test(t) ? "partner" : "self";

  const strongNeg = /\b(hate|can'?t stand|allergic|never eat|don'?t eat|doesn'?t eat|won'?t eat|no more|avoid|can'?t have|intolerant)\b/.test(t) || /^no\s/.test(t);
  const neg = strongNeg || /\b(don'?t (?:really )?like|doesn'?t (?:really )?like|not (?:a|big) fan|dislike|not into|less|fewer|too much|not keen|isn'?t keen|aren'?t keen)\b/.test(t);
  const strongPos = /\b(love|adore|obsessed|favou?rite|can'?t get enough)\b/.test(t);
  const pos = strongPos || /\b(like|enjoy|into|more|want|prefer|keen on|fan of)\b/.test(t);
  const score = neg ? (strongNeg ? -0.9 : -0.6) : strongPos ? 0.85 : pos ? 0.6 : 0.5;

  const prefs: TasteSignal[] = [];
  const seen = new Set<string>();
  const push = (f: Feature) => {
    const k = `${f.entityType}:${f.value}`;
    if (seen.has(k)) return;
    seen.add(k);
    // "less cheesy" style statements describe an attribute to avoid regardless of verb
    const s = f.value === "very cheesy" || f.value === "complicated" || f.value === "very sweet" || f.value === "heavy" ? -Math.abs(score) : score;
    prefs.push({ ...f, score: s });
  };

  for (const [word, f] of Object.entries(CUISINE_WORDS)) if (new RegExp(`\\b${word}\\b`).test(t)) push(f);
  for (const ing of findIngredientsInText(t)) push({ entityType: "ingredient", value: ing.name, label: capitalize(ing.name) });
  for (const [re, f] of ATTRIBUTE_WORDS) if (re.test(t)) {
    // Skip "cheese" attribute when a specific cheese was already captured ("blue cheese").
    if (f.value === "very cheesy" && prefs.some((p) => findIngredient(p.value)?.flavorKeys?.includes("cheese"))) continue;
    push(f);
  }
  if (/\bweekday|weeknight|during the week\b/.test(t) && /\bquick|fast|30|simple|easy\b/.test(t)) {
    push({ entityType: "habit", value: "quick weekday", label: "Quick weekday dinners" });
  }
  if (/\bweekend/.test(t) && /\bindulg|treat|fun|bigger|project\b/.test(t)) {
    push({ entityType: "habit", value: "weekend treat", label: "More indulgent at weekends" });
  }

  // Fallback: keep the object of the sentence as a free attribute so nothing the user says is lost.
  if (!prefs.length) {
    const obj = t
      .replace(/^(i|we|my \w+|the kids?)\s+(really\s+)?(don'?t|do not|doesn'?t)?\s*(really\s+)?(like|love|hate|enjoy|eat|want|prefer|dislike|avoid)\s+/, "")
      .replace(/^(no|more|less)\s+/, "")
      .trim();
    if (obj && obj.split(" ").length <= 5) push({ entityType: "attribute", value: obj, label: capitalize(obj) });
  }
  return { member, preferences: prefs.map((p) => ({ ...p, score: Math.max(-1, Math.min(1, p.score)) })) };
}
