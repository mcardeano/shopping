/**
 * Demo household: realistic recipes, history and purchases so personalization is
 * visible from the first screen. Everything here is ordinary, editable user data.
 */
import type { Database, Sql } from "../db/driver";
import type { Ctx } from "../context";
import type { RecipeDraft } from "@/core/domain/schemas";
import { parseIngredientLine } from "@/core/services/recipeParsing";
import { interpretFeedback } from "@/core/services/taste";
import { resolveItem } from "@/core/services/normalization";
import { seedRecipes, type SeedRecipe } from "@/seed/recipes";
import { seedImages } from "@/seed/images";
import { hashPassword } from "../auth/password";
import { insertRecipe, insertFeedback, recordInteraction, ingredientIdMap } from "../repos/recipes";
import { upsertExplicit } from "../repos/taste";
import { ensurePlan, upsertPlanItem } from "../repos/misc";
import { enrichDraft, buildSemanticText } from "@/core/services/enrichment";
import { embedText } from "@/core/services/embedding";
import { addDays, localDate, mondayOf } from "../time";

export const DEMO_EMAIL = "demo@larder.app";
export const DEMO_PASSWORD = "larder-demo";

const DAY = 86_400_000;

export function seedToDraft(s: SeedRecipe): RecipeDraft {
  return {
    title: s.title,
    description: s.description,
    sourcePlatform: s.sourcePlatform,
    sourceCreator: s.sourceCreator,
    imageUrl: seedImages[s.slug],
    servings: s.servings,
    prepTimeMinutes: s.prepTimeMinutes,
    cookTimeMinutes: s.cookTimeMinutes,
    totalTimeMinutes: s.prepTimeMinutes + s.cookTimeMinutes,
    caloriesPerServing: s.caloriesPerServing,
    proteinGrams: s.proteinGrams,
    carbsGrams: s.carbsGrams,
    fatGrams: s.fatGrams,
    nutritionIsEstimate: true,
    cuisine: s.cuisine,
    mealType: s.mealType,
    techniques: s.techniques,
    flavors: s.flavors,
    dietary: [],
    tags: s.tags,
    difficulty: s.difficulty,
    ingredients: s.ingredients.map(parseIngredientLine).filter((x) => x !== null),
    steps: s.steps,
    notes: s.history.note,
  };
}

async function writeSeedRecipe(sql: Sql, owner: { householdId: string; userId: string }, s: SeedRecipe, createdAt: string): Promise<string> {
  const draft = enrichDraft(seedToDraft(s));
  const semanticText = buildSemanticText({ ...draft, ingredientNames: draft.ingredients.map((i) => i.name) });
  const ingredientIds = await ingredientIdMap(sql, draft.ingredients.map((i) => i.name));
  return insertRecipe(sql, { ...owner, createdAt }, { ...draft, semanticText, embedding: embedText(semanticText), ingredientIds });
}

/** Sample recipes for a new account (no history — taste memory starts empty). */
export async function seedSampleRecipes(ctx: Ctx): Promise<void> {
  const now = Date.now();
  for (const [i, s] of seedRecipes.entries()) {
    const id = await writeSeedRecipe(ctx.sql, ctx, s, new Date(now - (seedRecipes.length - i) * 60_000).toISOString());
    await recordInteraction(ctx.sql, ctx, "saved", id);
  }
}

function cookDates(s: SeedRecipe, now: number): string[] {
  const out: string[] = [];
  const quick = s.prepTimeMinutes + s.cookTimeMinutes <= 30;
  let daysAgo = s.history.lastCookedDaysAgo ?? 7;
  for (let i = 0; i < s.history.timesCooked; i++) {
    const d = new Date(now - daysAgo * DAY);
    d.setHours(19, 30, 0, 0);
    // Quick dinners happen on weeknights; slower/indulgent ones at the weekend.
    const dow = d.getDay();
    if (quick && (dow === 0 || dow === 5 || dow === 6)) d.setDate(d.getDate() - (dow === 0 ? 3 : dow === 6 ? 2 : 1));
    if (!quick && dow >= 1 && dow <= 4) d.setDate(d.getDate() + (5 - dow));
    if (d.getTime() > now) d.setDate(d.getDate() - 7);
    out.push(d.toISOString());
    daysAgo += 10 + ((i * 7) % 9);
  }
  return out;
}

const PURCHASES: { name: string; every: number; last: number; brand?: string; product?: string }[] = [
  { name: "olive oil", every: 50, last: 14, brand: "Gallo", product: "olive-oil-750" },
  { name: "soy sauce", every: 60, last: 20, brand: "Kikkoman", product: "soy-sauce-kikkoman" },
  { name: "jasmine rice", every: 40, last: 25 },
  { name: "sushi rice", every: 55, last: 30 },
  { name: "sesame oil", every: 90, last: 30 },
  { name: "garlic", every: 14, last: 13 },
  { name: "greek yogurt", every: 7, last: 9, brand: "Fage", product: "greek-yogurt-fage-500" },
  { name: "banana", every: 6, last: 4 },
  { name: "milk", every: 5, last: 3 },
  { name: "salmon", every: 8, last: 9 },
  { name: "chicken thighs", every: 10, last: 11 },
  { name: "eggs", every: 10, last: 6 },
  { name: "lemon", every: 10, last: 12 },
  { name: "dishwasher tablets", every: 35, last: 36, brand: "Finish", product: "dishwasher-finish-40" },
  { name: "toilet paper", every: 21, last: 9 },
  { name: "coffee", every: 21, last: 12 },
  { name: "avocado", every: 7, last: 12 },
  { name: "cucumber", every: 7, last: 10 },
  { name: "spring onions", every: 10, last: 11 },
  { name: "fresh ginger", every: 25, last: 15 },
  { name: "honey", every: 60, last: 40 },
  { name: "tahini", every: 45, last: 18 },
  { name: "white miso", every: 60, last: 48 },
  { name: "sesame seeds", every: 90, last: 35 },
  { name: "chickpeas", every: 21, last: 16 },
];

export async function seedDemoAccount(db: Database): Promise<void> {
  const exists = await db.asService((sql) => sql.one("select id from auth.users where email = $1", [DEMO_EMAIL]));
  if (exists) return;
  const hash = await hashPassword(DEMO_PASSWORD);
  const userId = await db.asService(async (sql) => String((await sql.one<{ id: string }>("insert into auth.users (email, encrypted_password) values ($1,$2) returning id", [DEMO_EMAIL, hash]))!.id));

  await db.asUser(userId, async (sql) => {
    const householdId = String((await sql.one<{ bootstrap_user: string }>("select bootstrap_user($1)", ["Alex"]))!.bootstrap_user);
    const owner = { householdId, userId };
    const self = String((await sql.one<{ id: string }>("select id from household_members where user_id = $1", [userId]))!.id);
    const members: Record<string, string[]> = { partner: [], kids: [] };
    for (const [name, role] of [["Sam", "partner"], ["Leo", "child"], ["Maya", "child"]] as const) {
      const row = await sql.one<{ id: string }>("insert into household_members (household_id, name, role) values ($1,$2,$3) returning id", [householdId, name, role]);
      members[role === "partner" ? "partner" : "kids"]!.push(String(row!.id));
    }

    const now = Date.now();
    const ids = new Map<string, string>();
    for (const s of seedRecipes) {
      const createdAt = new Date(now - s.history.savedDaysAgo * DAY).toISOString();
      const id = await writeSeedRecipe(sql, owner, s, createdAt);
      ids.set(s.slug, id);
      await recordInteraction(sql, owner, "saved", id, { at: createdAt });
      const opens = Math.min(6, s.history.timesCooked * 2 + (s.history.favorite ? 2 : 0) + (s.history.savedDaysAgo % 3));
      for (let i = 0; i < opens; i++) await recordInteraction(sql, owner, "opened", id, { at: new Date(now - (s.history.savedDaysAgo * DAY * (i + 1)) / (opens + 1)).toISOString() });
      await sql.query("update recipes set open_count = $2 where id = $1", [id, opens]);

      const dates = cookDates(s, now);
      for (const at of dates) await recordInteraction(sql, owner, "cooked", id, { at });
      if (dates.length) {
        const last = dates.reduce((a, b) => (a > b ? a : b));
        await sql.query("update recipes set times_cooked = $2, last_cooked_at = $3 where id = $1", [id, dates.length, last]);
      }
      if (s.history.favorite) {
        await sql.query("update recipes set is_favorite = true where id = $1", [id]);
        await recordInteraction(sql, owner, "favorited", id, { at: createdAt });
      }
      if (s.history.reaction) {
        await sql.query("update recipes set rating = $2 where id = $1", [id, s.history.reaction]);
        const signals = s.history.comment ? interpretFeedback(s.history.comment, s.history.reaction) : null;
        await insertFeedback(sql, owner, { recipeId: id, memberId: self, reaction: s.history.reaction, comment: s.history.comment ?? null, signals, at: dates[0] });
      }
      for (const h of s.history.household ?? []) {
        for (const m of members[h.member] ?? []) await insertFeedback(sql, owner, { recipeId: id, memberId: m, reaction: h.reaction, comment: null, signals: null, at: dates[0] });
      }
    }

    // A few things said explicitly (shown as "You told us").
    for (const p of [
      { entityType: "attribute" as const, value: "restaurant-style", label: "Restaurant-style food", score: 0.8, originalText: "I like food that feels restaurant-style" },
      { entityType: "attribute" as const, value: "not diet food", label: "Healthy food that doesn't feel like diet food", score: 0.7, originalText: "Healthy, but not stereotypically diet food" },
      { entityType: "attribute" as const, value: "saucy", label: "Flavourful sauces", score: 0.8, originalText: "I love a good sauce" },
    ]) {
      await upsertExplicit(sql, owner, { memberId: null, ...p });
    }

    // Purchase history (~4 months), as if imported from a retailer.
    const tripDays = new Map<number, { name: string; brand?: string; product?: string }[]>();
    for (const p of PURCHASES) {
      for (let d = p.last, i = 0; d < 125; d += p.every + ((i * 3) % 3) - 1, i++) {
        const day = Math.round(d);
        tripDays.set(day, [...(tripDays.get(day) ?? []), p]);
      }
    }
    for (const [daysAgo, items] of [...tripDays.entries()].sort((a, b) => b[0] - a[0])) {
      const at = new Date(now - daysAgo * DAY);
      at.setHours(11, 0, 0, 0);
      const purchase = await sql.one<{ id: string }>("insert into purchases (household_id, retailer, source, purchased_at) values ($1,'Continente','seed',$2) returning id", [householdId, at.toISOString()]);
      for (const it of items) {
        const resolved = resolveItem(it.name);
        await sql.query(
          `insert into purchase_items (purchase_id, household_id, retailer, raw_name, normalized_name, brand, quantity, retail_product_id, ingredient_id, shopping_product_id)
           values ($1,$2,'Continente',$3,$4,$5,1,(select id from retail_products where provider='mock' and external_id=$6),
             (select id from ingredients where canonical_name=$4),(select id from shopping_products where canonical_name=$4))`,
          [purchase!.id, householdId, it.brand ? `${it.brand} ${resolved.display}` : resolved.display, resolved.name, it.brand ?? null, it.product ?? null],
        );
      }
    }

    // Something already on the list, and one planned dinner.
    const listId = String((await sql.one<{ id: string }>("select id from shopping_lists where household_id = $1 and is_active", [householdId]))!.id);
    for (const [raw, name, display, category, note] of [
      ["strawberries for the kids", "strawberries", "Strawberries", "Produce", "for the kids"],
      ["kitchen roll", "paper towels", "Paper towels", "Household", null],
    ] as const) {
      const item = await sql.one<{ id: string }>(
        `insert into shopping_list_items (shopping_list_id, household_id, raw_text, normalized_name, display_name, category, note, status, ingredient_id, shopping_product_id)
         values ($1,$2,$3,$4,$5,$6,$7,'need_to_buy',(select id from ingredients where canonical_name=$4),(select id from shopping_products where canonical_name=$4)) returning id`,
        [listId, householdId, raw, name, display, category, note],
      );
      await sql.query("insert into shopping_list_item_sources (shopping_list_item_id, source_type, label) values ($1,'manual',$2)", [item!.id, note]);
    }

    const weekStart = mondayOf(new Date());
    const planId = await ensurePlan(sql, householdId, weekStart);
    const tuesday = addDays(weekStart, 1);
    const orzo = ids.get("lemon-chicken-orzo") ?? [...ids.values()][0]!;
    if (tuesday >= localDate(new Date())) await upsertPlanItem(sql, planId, tuesday, orzo, "The kids loved it last time.", false);
  });

  // Derive taste memory and plan-driven list items through the normal services.
  const { recomputeTaste } = await import("../services/taste");
  const { syncMealPlanSources } = await import("../services/shopping");
  await db.asUser(userId, async (sql) => {
    const profile = (await sql.one<{ household_id: string; display_name: string }>("select household_id, display_name from profiles where user_id = $1", [userId]))!;
    const self = (await sql.one<{ id: string }>("select id from household_members where user_id = $1", [userId]))!;
    const ctx: Ctx = { sql, userId, householdId: String(profile.household_id), selfMemberId: String(self.id), displayName: String(profile.display_name) };
    await recomputeTaste(ctx);
    await syncMealPlanSources(ctx);
  });
  console.log(`[seed] demo account ready: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}
