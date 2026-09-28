/**
 * PantryEstimationService
 * Estimates the probability that something is at home — without asking anyone to
 * maintain an inventory. Signals, strongest first:
 *   1. explicit corrections ("I have it" / "I'm out"), decaying over the item's interval
 *   2. purchase history: time since last purchase vs. typical repurchase interval
 *   3. catalogue priors (olive oil and salt are usually around; fresh salmon isn't)
 */
import type { PantryEstimate, PantryStatus } from "../domain/types";
import { ALWAYS_HAVE } from "../catalog/ingredients";
import { findIngredient, resolveItem } from "./normalization";

export type PantryHistory = {
  purchases: string[]; // ISO timestamps, any order
  corrections: { hasItem: boolean; at: string }[];
  /** Times the item was used in cooked recipes since the last purchase. */
  usesSinceLastPurchase?: number;
};

const DAY = 86_400_000;

export const PANTRY_THRESHOLDS = { probablyHave: 0.7, checkAtHome: 0.35 };

export function classify(probability: number): PantryStatus {
  if (probability >= PANTRY_THRESHOLDS.probablyHave) return "probably_have";
  if (probability >= PANTRY_THRESHOLDS.checkAtHome) return "check_at_home";
  return "need_to_buy";
}

function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Typical days between purchases, from history when there's enough, else the catalogue. */
export function typicalInterval(name: string, purchases: string[]): number | undefined {
  const times = purchases.map((p) => new Date(p).getTime()).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const g = (times[i]! - times[i - 1]!) / DAY;
    if (g >= 1) gaps.push(g);
  }
  const learned = gaps.length >= 2 ? median(gaps) : undefined;
  const resolved = resolveItem(name);
  const catalogue =
    resolved.kind === "ingredient" ? resolved.ingredient.repurchaseDays : resolved.kind === "product" ? resolved.product.repurchaseDays : undefined;
  if (learned && catalogue) return Math.round(learned * 0.7 + catalogue * 0.3);
  return learned ? Math.round(learned) : catalogue;
}

/** Logistic decay: ~0.98 just after purchase, 0.5 at one interval, ~0.02 at two. */
function decay(daysSince: number, interval: number): number {
  const k = 5;
  return 1 / (1 + Math.exp(k * (daysSince / interval - 1)));
}

export function estimatePantry(name: string, history: PantryHistory, now = new Date()): PantryEstimate {
  const nowMs = now.getTime();
  if (ALWAYS_HAVE.has(name)) {
    return { name, probability: 0.97, status: "probably_have", lastPurchasedAt: null, typicalIntervalDays: null, basis: "Kitchen basic" };
  }
  const ing = findIngredient(name);
  const prior = ing?.stapleness ?? 0.08;
  const interval = typicalInterval(name, history.purchases) ?? (ing ? 21 : 30);
  const lastPurchase = history.purchases.map((p) => new Date(p).getTime()).sort((a, b) => b - a)[0];
  const lastCorrection = [...history.corrections].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];

  let probability = prior;
  let basis = prior >= 0.5 ? "Usually kept at home" : "Not usually kept at home";

  if (lastPurchase != null) {
    const days = (nowMs - lastPurchase) / DAY;
    const fromPurchase = decay(days, interval);
    // Staples rarely run out entirely; blend toward the prior as the signal ages.
    const weight = Math.max(0.25, 1 - days / (interval * 3));
    probability = fromPurchase * weight + prior * (1 - weight);
    const uses = history.usesSinceLastPurchase ?? 0;
    if (uses > 0 && (ing?.role === "protein" || ing?.role === "veg" || ing?.role === "herb" || ing?.role === "fruit")) {
      probability *= Math.pow(0.45, uses); // perishables used in cooking are likely gone
    }
    basis = `Bought ${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"} ago · usually lasts ~${interval} days`;
  }

  if (lastCorrection) {
    const days = (nowMs - new Date(lastCorrection.at).getTime()) / DAY;
    const lastPurchaseAfter = lastPurchase != null && lastPurchase > new Date(lastCorrection.at).getTime();
    if (!lastPurchaseAfter) {
      if (lastCorrection.hasItem) {
        const p = 0.95 * decay(days, Math.max(interval, 5)) + 0.05;
        probability = Math.max(probability, p);
        basis = "You said you have it";
      } else {
        probability = Math.min(probability, 0.05 + 0.2 * (1 - decay(days, 3)) * prior);
        basis = "You said you're out";
      }
    }
  }

  probability = Math.min(0.99, Math.max(0.01, probability));
  return {
    name,
    probability,
    status: classify(probability),
    lastPurchasedAt: lastPurchase != null ? new Date(lastPurchase).toISOString() : null,
    typicalIntervalDays: interval,
    basis,
  };
}

/**
 * Items the household buys regularly and is probably due to buy again.
 * Suggestions only — never auto-added.
 */
export function replenishmentCandidates(
  histories: { name: string; purchases: string[] }[],
  now = new Date(),
): { name: string; intervalDays: number; daysSinceLast: number }[] {
  const out: { name: string; intervalDays: number; daysSinceLast: number }[] = [];
  for (const h of histories) {
    if (h.purchases.length < 3) continue;
    const interval = typicalInterval(h.name, h.purchases);
    if (!interval) continue;
    const last = Math.max(...h.purchases.map((p) => new Date(p).getTime()));
    const days = (now.getTime() - last) / DAY;
    if (days >= interval * 0.85 && days <= interval * 4) out.push({ name: h.name, intervalDays: interval, daysSinceLast: Math.round(days) });
  }
  return out.sort((a, b) => b.daysSinceLast / b.intervalDays - a.daysSinceLast / a.intervalDays);
}

export function describeInterval(days: number): string {
  if (days <= 8) return "weekly";
  if (days <= 16) return "every couple of weeks";
  if (days <= 24) return "every three weeks";
  if (days <= 40) return "about monthly";
  return `every ${Math.round(days / 7)} weeks`;
}
