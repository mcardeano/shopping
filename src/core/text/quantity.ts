/**
 * Quantity & unit parsing and arithmetic.
 * Pure functions — shared by recipe parsing, shopping capture and list consolidation.
 */

export type Dimension = "mass" | "volume" | "count";

export type UnitDef = {
  canonical: string;
  dimension: Dimension;
  /** Factor to the dimension's base unit (g, ml, piece). */
  toBase: number;
  /** Singular / plural display. */
  label: [string, string];
};

const UNIT_DEFS: UnitDef[] = [
  { canonical: "g", dimension: "mass", toBase: 1, label: ["g", "g"] },
  { canonical: "kg", dimension: "mass", toBase: 1000, label: ["kg", "kg"] },
  { canonical: "ml", dimension: "volume", toBase: 1, label: ["ml", "ml"] },
  { canonical: "l", dimension: "volume", toBase: 1000, label: ["l", "l"] },
  { canonical: "tsp", dimension: "volume", toBase: 5, label: ["tsp", "tsp"] },
  { canonical: "tbsp", dimension: "volume", toBase: 15, label: ["tbsp", "tbsp"] },
  { canonical: "cup", dimension: "volume", toBase: 240, label: ["cup", "cups"] },
  { canonical: "pinch", dimension: "volume", toBase: 0.3, label: ["pinch", "pinches"] },
  { canonical: "clove", dimension: "count", toBase: 1, label: ["clove", "cloves"] },
  { canonical: "piece", dimension: "count", toBase: 1, label: ["", ""] },
  { canonical: "can", dimension: "count", toBase: 1, label: ["can", "cans"] },
  { canonical: "pack", dimension: "count", toBase: 1, label: ["pack", "packs"] },
  { canonical: "bunch", dimension: "count", toBase: 1, label: ["bunch", "bunches"] },
  { canonical: "handful", dimension: "count", toBase: 1, label: ["handful", "handfuls"] },
  { canonical: "bottle", dimension: "count", toBase: 1, label: ["bottle", "bottles"] },
  { canonical: "jar", dimension: "count", toBase: 1, label: ["jar", "jars"] },
  { canonical: "bag", dimension: "count", toBase: 1, label: ["bag", "bags"] },
  { canonical: "box", dimension: "count", toBase: 1, label: ["box", "boxes"] },
  { canonical: "roll", dimension: "count", toBase: 1, label: ["roll", "rolls"] },
  { canonical: "tub", dimension: "count", toBase: 1, label: ["tub", "tubs"] },
  { canonical: "loaf", dimension: "count", toBase: 1, label: ["loaf", "loaves"] },
  { canonical: "head", dimension: "count", toBase: 1, label: ["head", "heads"] },
  { canonical: "fillet", dimension: "count", toBase: 1, label: ["fillet", "fillets"] },
  { canonical: "slice", dimension: "count", toBase: 1, label: ["slice", "slices"] },
  { canonical: "sprig", dimension: "count", toBase: 1, label: ["sprig", "sprigs"] },
  { canonical: "stalk", dimension: "count", toBase: 1, label: ["stalk", "stalks"] },
];

const UNIT_ALIASES: Record<string, string> = {
  g: "g", gr: "g", gram: "g", grams: "g", gramme: "g", grammes: "g",
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  ml: "ml", millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml",
  l: "l", litre: "l", litres: "l", liter: "l", liters: "l",
  tsp: "tsp", tsps: "tsp", teaspoon: "tsp", teaspoons: "tsp", t: "tsp",
  tbsp: "tbsp", tbsps: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", tbs: "tbsp", tbl: "tbsp",
  cup: "cup", cups: "cup",
  pinch: "pinch", pinches: "pinch",
  clove: "clove", cloves: "clove",
  piece: "piece", pieces: "piece", pc: "piece", pcs: "piece",
  can: "can", cans: "can", tin: "can", tins: "can",
  pack: "pack", packs: "pack", packet: "pack", packets: "pack", pkt: "pack", package: "pack", packages: "pack",
  bunch: "bunch", bunches: "bunch",
  handful: "handful", handfuls: "handful",
  bottle: "bottle", bottles: "bottle",
  jar: "jar", jars: "jar",
  bag: "bag", bags: "bag",
  box: "box", boxes: "box",
  roll: "roll", rolls: "roll",
  tub: "tub", tubs: "tub",
  loaf: "loaf", loaves: "loaf",
  head: "head", heads: "head",
  fillet: "fillet", fillets: "fillet",
  slice: "slice", slices: "slice",
  sprig: "sprig", sprigs: "sprig",
  stalk: "stalk", stalks: "stalk",
};

const UNIT_BY_CANONICAL = new Map(UNIT_DEFS.map((u) => [u.canonical, u]));

export function unitDef(unit: string | null | undefined): UnitDef | undefined {
  if (!unit) return undefined;
  const canonical = UNIT_ALIASES[unit.toLowerCase()] ?? unit.toLowerCase();
  return UNIT_BY_CANONICAL.get(canonical);
}

export function canonicalUnit(word: string): string | undefined {
  return UNIT_ALIASES[word.toLowerCase().replace(/\.$/, "")];
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12, half: 0.5, couple: 2, few: 3,
  "a couple of": 2, "a few": 3, "a dozen": 12, "half a": 0.5, "half an": 0.5,
};

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅕": 0.2, "⅛": 0.125,
};

/** Parses "1", "1.5", "1,5", "1/2", "1 1/2", "1½", "½". Returns the number and consumed length. */
export function parseLeadingNumber(input: string): { value: number; rest: string } | null {
  const s = input.trimStart();
  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)(?![\d/])/);
  if (m) return { value: Number(m[1]) + Number(m[2]) / Number(m[3]), rest: s.slice(m[0].length) };
  m = s.match(/^(\d+)\/(\d+)(?![\d/])/);
  if (m) return { value: Number(m[1]) / Number(m[2]), rest: s.slice(m[0].length) };
  m = s.match(/^(\d+)?\s*([½⅓⅔¼¾⅕⅛])/);
  if (m) return { value: (m[1] ? Number(m[1]) : 0) + (UNICODE_FRACTIONS[m[2]!] ?? 0), rest: s.slice(m[0].length) };
  m = s.match(/^(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?/);
  if (m) return { value: Number(m[1]!.replace(",", ".")), rest: s.slice(m[0].length) };
  const lower = s.toLowerCase();
  for (const phrase of ["a couple of", "a few", "a dozen", "half a", "half an"]) {
    if (lower.startsWith(phrase + " ")) return { value: NUMBER_WORDS[phrase]!, rest: s.slice(phrase.length) };
  }
  m = lower.match(/^([a-z]+)\b/);
  if (m && m[1] && m[1] in NUMBER_WORDS && !["a", "an"].includes(m[1])) {
    return { value: NUMBER_WORDS[m[1]]!, rest: s.slice(m[1].length) };
  }
  return null;
}

export type ParsedQuantity = {
  amount?: number;
  unit?: string;
  rest: string;
};

/**
 * Parses a leading quantity + unit: "2 tbsp soy sauce" → {2, tbsp, "soy sauce"},
 * "two packs of greek yogurt" → {2, pack, "greek yogurt"}, "400g salmon" → {400, g, "salmon"}.
 */
export function parseQuantity(input: string): ParsedQuantity {
  const text = input.trim();
  const num = parseLeadingNumber(text);
  if (!num) {
    // "a pinch of salt", "a bag of rice"
    const m = text.match(/^(?:a|an)\s+([a-z]+)\s+of\s+(.*)$/i);
    if (m && canonicalUnit(m[1]!)) return { amount: 1, unit: canonicalUnit(m[1]!), rest: m[2]!.trim() };
    return { rest: text };
  }
  let rest = num.rest.trimStart();
  // Multiplier forms: "2 x 125 g"
  const mult = rest.match(/^[x×]\s*(\d+(?:[.,]\d+)?)\s*/i);
  let amount = num.value;
  if (mult) {
    amount *= Number(mult[1]!.replace(",", "."));
    rest = rest.slice(mult[0].length);
  }
  const unitMatch = rest.match(/^([a-zA-Z]+)\.?(?=\s|$|\b)/);
  let unit: string | undefined;
  if (unitMatch) {
    const u = canonicalUnit(unitMatch[1]!);
    if (u) {
      unit = u;
      rest = rest.slice(unitMatch[0].length);
    }
  }
  rest = rest.replace(/^\s*of\s+/i, "").trim();
  return { amount, unit, rest };
}

/** Parses a trailing quantity: "bananas x6", "greek yogurt ×2". */
export function parseTrailingQuantity(input: string): { amount?: number; rest: string } {
  const m = input.match(/^(.*?)\s*[x×]\s*(\d+)\s*$/i);
  if (m && m[1]) return { amount: Number(m[2]), rest: m[1].trim() };
  return { rest: input };
}

export type Quantity = { amount: number; unit?: string };

/** Adds quantities that share a dimension; returns null when they can't be combined. */
export function addQuantities(a: Quantity, b: Quantity): Quantity | null {
  const ua = unitDef(a.unit ?? "piece");
  const ub = unitDef(b.unit ?? "piece");
  if (!ua || !ub) return a.unit === b.unit ? { amount: a.amount + b.amount, unit: a.unit } : null;
  if (ua.canonical === ub.canonical) return { amount: a.amount + b.amount, unit: a.unit };
  if (ua.dimension !== ub.dimension) return null;
  if (ua.dimension === "count") return null; // "2 cans" + "1 bunch" don't combine
  const base = a.amount * ua.toBase + b.amount * ub.toBase;
  // Keep the larger / more readable unit.
  const target = ua.toBase >= ub.toBase ? ua : ub;
  return { amount: base / target.toBase, unit: target.canonical };
}

/** Sums a list of quantities into the smallest set of mutually incompatible quantities. */
export function sumQuantities(quantities: Quantity[]): Quantity[] {
  const out: Quantity[] = [];
  for (const q of quantities) {
    let merged = false;
    for (let i = 0; i < out.length; i++) {
      const sum = addQuantities(out[i]!, q);
      if (sum) {
        out[i] = sum;
        merged = true;
        break;
      }
    }
    if (!merged) out.push({ ...q });
  }
  return out.map(tidyQuantity);
}

/** 1500 g → 1.5 kg, 3 tsp → 1 tbsp, rounding to sensible precision. */
export function tidyQuantity(q: Quantity): Quantity {
  const def = unitDef(q.unit);
  let { amount, unit } = q;
  if (def?.canonical === "g" && amount >= 1000) {
    amount /= 1000;
    unit = "kg";
  } else if (def?.canonical === "ml" && amount >= 1000) {
    amount /= 1000;
    unit = "l";
  } else if (def?.canonical === "tsp" && amount >= 3 && Math.abs(amount / 3 - Math.round(amount / 3)) < 0.01) {
    amount /= 3;
    unit = "tbsp";
  }
  return { amount: roundNice(amount), unit };
}

function roundNice(n: number): number {
  if (n >= 100) return Math.round(n / 5) * 5;
  if (n >= 10) return Math.round(n);
  return Math.round(n * 4) / 4 === Math.round(n * 100) / 100 ? Math.round(n * 4) / 4 : Math.round(n * 10) / 10;
}

const FRACTION_DISPLAY: Record<string, string> = { "0.25": "¼", "0.5": "½", "0.75": "¾" };

export function formatAmount(n: number): string {
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 100) / 100;
  const f = FRACTION_DISPLAY[String(frac)];
  if (f) return whole > 0 ? `${whole}${f}` : f;
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 10) / 10);
}

export function formatQuantity(q: Quantity, nounForCount?: string): string {
  const def = unitDef(q.unit);
  const amount = formatAmount(q.amount);
  if (!def || def.canonical === "piece") {
    return nounForCount ? `${amount} ${nounForCount}` : `${amount}`;
  }
  const label = q.amount > 1 ? def.label[1] : def.label[0];
  const joiner = ["g", "kg", "ml", "l"].includes(def.canonical) ? "" : " ";
  return `${amount}${joiner}${label}`;
}

export function formatQuantities(qs: Quantity[]): string {
  return qs.map((q) => formatQuantity(q)).join(" + ");
}

/** Scales an amount for a different number of servings. */
export function scaleAmount(amount: number | undefined, from: number | undefined, to: number | undefined): number | undefined {
  if (amount == null || !from || !to || from === to) return amount;
  return (amount * to) / from;
}
