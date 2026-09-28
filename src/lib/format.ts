import type { Recipe } from "@/core/domain/types";

export function minutesLabel(m: number | null | undefined): string | null {
  if (m == null) return null;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r}` : `${h} h`;
}

export function recipeMeta(r: Pick<Recipe, "totalTimeMinutes" | "caloriesPerServing" | "proteinGrams">, opts: { protein?: boolean; calories?: boolean } = {}): string {
  return [minutesLabel(r.totalTimeMinutes), opts.calories !== false && r.caloriesPerServing ? `${r.caloriesPerServing} kcal` : null, opts.protein && r.proteinGrams ? `${r.proteinGrams}g protein` : null]
    .filter(Boolean)
    .join(" · ");
}

export function relativeDays(iso: string | null | undefined, now = new Date()): string | null {
  if (!iso) return null;
  const days = Math.round((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Up to two contextual tags worth showing on a card. */
export function contextualTags(r: Recipe): string[] {
  const tags: string[] = [];
  if (r.household.some((h) => h.role === "child" && h.reaction === "loved")) tags.push("Kids loved");
  if (r.timesCooked >= 2) tags.push(`Cooked ${r.timesCooked}×`);
  if (r.timesCooked === 0 && Date.now() - new Date(r.createdAt).getTime() < 10 * 86_400_000) tags.push("New");
  if ((r.totalTimeMinutes ?? 99) <= 20) tags.push("Quick");
  if ((r.proteinGrams ?? 0) >= 35) tags.push("High protein");
  if (r.timesCooked === 0 && tags.length < 2 && !tags.includes("New")) tags.push("Not tried yet");
  return tags.slice(0, 2);
}

export const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  website: "Web",
  manual: "Your recipe",
  image: "Screenshot",
  text: "Pasted",
  generated: "Idea",
};

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
