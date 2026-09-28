/**
 * ShoppingIntentService
 * Turns natural language ("we're out of milk and bananas", "two packs of Greek yogurt",
 * "add everything for the salmon recipe") into structured shopping actions.
 *
 * Pure and synchronous: it runs on the client for optimistic rendering and again on the
 * server as the source of truth.
 */
import type { ParsedShoppingItem, ShoppingAction } from "../domain/schemas";
import { parseQuantity, parseTrailingQuantity } from "../text/quantity";

const LEAD_PHRASES: RegExp[] = [
  /^(?:ok(?:ay)?|hey|so|also|and|oh|please|pls|plus)\b[,\s]*/i,
  /^(?:can|could|would) you\s+(?:please\s+)?/i,
  /^remind me to\s+(?:buy|get|pick up)\s+/i,
  /^remember\s+(?:that\s+)?(?:i|we)\s+(?:need|want)(?:\s+to\s+(?:buy|get))?\s+/i,
  /^remember\s+(?:to\s+(?:buy|get|pick up)\s+)?/i,
  /^(?:i|we)(?:'re|’re| are)\s+(?:all\s+|completely\s+|nearly\s+|almost\s+)?out\s+of\s+/i,
  /^(?:i|we)(?:'ve|’ve| have)\s+(?:just\s+)?run\s+out\s+of\s+/i,
  /^(?:we(?:'re|’re| are)\s+|i(?:'m|’m| am)\s+)?running\s+(?:low|out)\s+(?:on|of)\s+/i,
  /^(?:we(?:'re|’re| are)\s+|i(?:'m|’m| am)\s+)?(?:low|out)\s+(?:on|of)\s+/i,
  /^(?:i|we)\s+(?:also\s+)?(?:need|want|should get|should buy|have to (?:buy|get))(?:\s+to\s+(?:buy|get|grab|pick up))?\s+(?:some\s+|more\s+)?/i,
  /^(?:don'?t|dont|do not|dont)\s+forget(?:\s+to\s+(?:buy|get|pick up|grab))?(?:\s+the)?\s+/i,
  /^(?:please\s+)?(?:add|buy|get|grab|pick up|order|put)\s+(?:me\s+)?(?:some\s+)?/i,
  /^need\s+(?:some\s+|more\s+)?/i,
  /^(?:out of|no more)\s+/i,
];

const TRAILING_PHRASES: RegExp[] = [
  /\s+(?:to|on|onto|in)\s+(?:the|my|our)?\s*(?:shopping\s+)?(?:list|basket|shopping)\s*$/i,
  /\s+(?:please|pls|thanks|thank you)\s*$/i,
  /\s+(?:again|as well|too|also)\s*$/i,
  /[.!?]+$/,
];

const COMPOUNDS = ["salt and pepper", "mac and cheese", "fish and chips", "sweet and sour", "salt & pepper", "oil and vinegar", "cheese and onion", "fruit and nut"];

const SHOW_LIST_RE = /^(?:what(?:'s| is| am i| are we| do (?:i|we))|show(?: me)?|open|view|see)\b.*\b(?:buy|buying|get|getting|list|shopping|need)\b/i;
const ADD_RECIPE_RE = /^(?:please\s+)?(?:add|get|buy|put)\s+(?:everything|all(?: the ingredients)?|the ingredients|ingredients|what i need|what we need|stuff)\s+(?:i need\s+|we need\s+)?(?:for|to make|from)\s+(?:the\s+|my\s+|that\s+)?(.+?)(?:\s+recipe)?[.!]?$/i;
const FIND_RECIPE_RE = /\s*(?:,|;|\band\b|\bthen\b)?\s*(?:find|suggest|give|show|recommend|what can i (?:make|cook))\s+(?:me\s+|us\s+)?(?:a\s+|an\s+|some\s+)?(?:dinner|recipe|recipes|something|meal|idea|ideas)?.*$/i;

const INCREMENT_RE = /^(?:another|one more|an extra|extra|more|a second|a couple more)\s+/i;
const NOTE_RE = /\s+(for (?:the |my |our )?(?:kids?|children|baby|breakfast|lunch(?:es)?|dinner|school|party|weekend|guests|the week|smoothies?|baking|[a-z]+(?:'s)?(?: [a-z]+)?))\s*$/i;

function stripLead(s: string): string {
  let out = s.trim();
  for (let i = 0; i < 6; i++) {
    const before = out;
    for (const re of LEAD_PHRASES) out = out.replace(re, "").trim();
    if (out === before) break;
  }
  for (const re of TRAILING_PHRASES) out = out.replace(re, "").trim();
  return out;
}

function splitItems(s: string): string[] {
  let text = s;
  const placeholders: string[] = [];
  for (const c of COMPOUNDS) {
    const re = new RegExp(c.replace(/&/g, "\\&"), "gi");
    text = text.replace(re, (m) => {
      placeholders.push(m);
      return `__c${placeholders.length - 1}__`;
    });
  }
  return text
    .split(/\s*(?:,|;|\n|\s&\s|\s\+\s|\band\b|\bplus\b|\balso\b|\bas well as\b)\s*/i)
    .map((part) => part.replace(/__c(\d+)__/g, (_, i: string) => placeholders[Number(i)] ?? ""))
    .map((p) => p.trim())
    .filter(Boolean);
}

const NOISE = new Set(["", "some", "stuff", "things", "a few things", "it", "them", "that", "this", "more", "the", "a", "an"]);

export function parseItemPhrase(segment: string): ParsedShoppingItem | null {
  let s = stripLead(segment);
  if (!s) return null;
  let note: string | undefined;
  const paren = s.match(/\(([^)]+)\)/);
  if (paren) {
    note = paren[1]!.trim();
    s = s.replace(paren[0], " ").trim();
  }
  const dash = s.match(/\s+[-–—]\s+(.+)$/);
  if (dash) {
    note = [note, dash[1]!.trim()].filter(Boolean).join("; ");
    s = s.slice(0, dash.index).trim();
  }
  const noteMatch = s.match(NOTE_RE);
  if (noteMatch) {
    note = [note, noteMatch[1]!.trim()].filter(Boolean).join("; ");
    s = s.slice(0, noteMatch.index).trim();
  }

  let increment = false;
  if (INCREMENT_RE.test(s)) {
    increment = true;
    s = s.replace(INCREMENT_RE, "").trim();
  }

  const trailing = parseTrailingQuantity(s);
  s = trailing.rest;
  const q = parseQuantity(s);
  let name = q.rest.replace(/^(?:of|the|some)\s+/i, "").trim();
  if (NOISE.has(name.toLowerCase())) return null;
  // "half an avocado" etc. keep the amount; "a milk" is just milk.
  let quantity = trailing.amount ?? q.amount;
  if (quantity === 1 && !q.unit && !increment && /^(a|an)\s/i.test(s)) quantity = undefined;
  if (increment && quantity == null) quantity = 1;
  name = name.replace(/\s+/g, " ");
  if (name.length > 120) name = name.slice(0, 120);
  return {
    rawText: segment.trim().slice(0, 200),
    name,
    quantity,
    unit: q.unit,
    note,
    increment,
  };
}

export function parseShoppingText(input: string): ShoppingAction[] {
  const text = input.trim().replace(/\s+/g, " ");
  if (!text) return [];

  if (SHOW_LIST_RE.test(text) && !/\b(add|buy|remember|out of|need to buy)\b/i.test(text.split(/\?/)[0]!.replace(SHOW_LIST_RE, ""))) {
    if (!/\b(add|remember|we're out|we are out)\b/i.test(text)) return [{ type: "show_list" }];
  }

  const recipe = text.match(ADD_RECIPE_RE);
  if (recipe && recipe[1]) return [{ type: "add_recipe", recipeQuery: recipe[1].trim() }];

  const actions: ShoppingAction[] = [];
  let itemsText = text;
  let wantsRecipes = false;
  const find = itemsText.match(FIND_RECIPE_RE);
  if (find && find.index != null && find.index > 0) {
    wantsRecipes = true;
    itemsText = itemsText.slice(0, find.index);
  }

  const items = splitItems(stripLead(itemsText))
    .map(parseItemPhrase)
    .filter((i): i is ParsedShoppingItem => !!i);

  if (items.length) actions.push({ type: "add_items", items });
  if (wantsRecipes) actions.push({ type: "find_recipes", using: items.map((i) => i.name) });
  return actions;
}

/** Heuristic: does this free text look like a shopping command rather than a dinner question? */
export function looksLikeShoppingCommand(input: string): boolean {
  const t = input.trim().toLowerCase().replace(/[’]/g, "'");
  if (!t) return false;
  if (SHOW_LIST_RE.test(t)) return true;
  if (ADD_RECIPE_RE.test(t)) return true;
  const strong = /^(?:please\s+)?(?:add|buy|grab|pick up|remember|remind me|don'?t forget|we(?:'re| are) (?:all )?out of|i(?:'m| am) out of|we(?:'ve| have) run out|running low|out of|we need to buy|i need to buy)\b/.test(t);
  const weak = /^(?:get|we need|i need|need)\b/.test(t);
  const aboutDinner = /\b(dinner|tonight|recipe|recipes|cook|meal|lunch|something|ideas?|what should|what can)\b/.test(t);
  if (strong) return true;
  return weak && !aboutDinner;
}
