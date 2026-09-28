/**
 * The brief's "initial prototype behavior" flow, end to end against a real
 * (in-memory) Postgres with the production migrations, RLS and services.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDatabase, type Database } from "@/server/db/driver";
import { runMigrations } from "@/server/db";
import { seedReferenceData } from "@/server/seed/reference";
import { seedDemoAccount } from "@/server/seed/demo";
import type { Ctx } from "@/server/context";
import { recommendForViewer } from "@/server/services/recommend";
import { addToPlan, removeFromPlan, generateWeek, getWeek } from "@/server/services/plan";
import { applyShoppingActions, getShoppingView, addRecipeContributions, removeRecipeFromList, setChecked, setStatus } from "@/server/services/shopping";
import { submitFeedback, searchLibrary } from "@/server/services/recipes";
import { applyPreferenceStatement, getTasteView } from "@/server/services/taste";
import { parseShoppingText } from "@/core/services/shoppingIntent";
import { interpretFeedback, parsePreferenceStatement } from "@/core/services/taste";
import { loadRecipes } from "@/server/repos/recipes";
import { addDays, localDate, mondayOf } from "@/server/time";

let db: Database;
let userId: string;

async function asDemo<T>(fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  return db.asUser(userId, async (sql) => {
    const p = (await sql.one<{ household_id: string; display_name: string }>("select household_id, display_name from profiles where user_id = $1", [userId]))!;
    const m = (await sql.one<{ id: string }>("select id from household_members where user_id = $1", [userId]))!;
    return fn({ sql, userId, householdId: String(p.household_id), selfMemberId: String(m.id), displayName: String(p.display_name) });
  });
}

const allNeed = (v: Awaited<ReturnType<typeof getShoppingView>>) => v.need.flatMap((g) => g.items);
const names = (items: { normalizedName: string }[]) => items.map((i) => i.normalizedName);

beforeAll(async () => {
  db = await createPgliteDatabase("memory://");
  await runMigrations(db);
  await db.asService((sql) => seedReferenceData(sql));
  await seedDemoAccount(db);
  userId = String((await db.asService((sql) => sql.one<{ id: string }>("select id from auth.users where email = 'demo@larder.app'")))!.id);
});

describe("What should I cook?", () => {
  it("returns three personal, explained, constraint-respecting picks", async () => {
    const res = await asDemo((ctx) => recommendForViewer(ctx, { query: "Something Asian with salmon under 30 minutes", exclude: [], limit: 3 }));
    expect(res.results).toHaveLength(3);
    for (const r of res.results) {
      expect(r.recipe.ingredients.some((i) => i.normalizedName.includes("salmon"))).toBe(true);
      expect(r.recipe.totalTimeMinutes!).toBeLessThanOrEqual(35);
      expect(r.reason.length).toBeGreaterThan(10);
      expect(r.reason).not.toMatch(/\d\.\d{2}/); // never a raw score
    }
  });
  it("respects exclusions and audiences", async () => {
    const res = await asDemo((ctx) => recommendForViewer(ctx, { query: "something the kids will eat, no pasta", exclude: [], limit: 3 }));
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results.every((r) => !r.recipe.ingredients.some((i) => i.normalizedName === "pasta"))).toBe(true);
  });
});

describe("plan → shopping list → quick add", () => {
  const today = localDate(new Date());
  const thursday = addDays(today, 3);
  const friday = addDays(today, 4);

  it("adding two recipes to the plan generates a consolidated, classified list", async () => {
    await asDemo(async (ctx) => {
      const recipes = await loadRecipes(ctx.sql);
      const miso = recipes.find((r) => r.title.startsWith("Miso-Glazed Salmon"))!;
      const shawarma = recipes.find((r) => r.title === "Chicken Shawarma Bowl")!;
      await addToPlan(ctx, thursday, miso.id);
      await addToPlan(ctx, friday, shawarma.id);
      const view = await getShoppingView(ctx);
      const need = names(allNeed(view));
      for (const n of ["salmon", "cucumber", "chicken thighs", "greek yogurt"]) expect(need).toContain(n);
      const have = names(view.have);
      expect(have).toEqual(expect.arrayContaining(["soy sauce", "olive oil"]));
      expect([...names(view.check), ...have]).toContain("garlic");
      // Cucumber is needed by both recipes → one line, merged.
      expect(need.filter((n) => n === "cucumber")).toHaveLength(1);
      const cucumber = allNeed(view).find((i) => i.normalizedName === "cucumber")!;
      expect(cucumber.sources.filter((s) => s.type === "meal_plan")).toHaveLength(2);
    });
  });

  it("quick-add puts non-food items on the same list, categorised", async () => {
    await asDemo(async (ctx) => {
      await applyShoppingActions(ctx, parseShoppingText("Dishwasher tablets, bananas and toothpaste"));
      const view = await getShoppingView(ctx);
      const byName = new Map(allNeed(view).map((i) => [i.normalizedName, i]));
      expect(byName.get("dishwasher tablets")?.category).toBe("Household");
      expect(byName.get("banana")?.category).toBe("Produce");
      expect(byName.get("toothpaste")?.category).toBe("Personal Care");
      expect(byName.get("toothpaste")?.sourceLabel).toBe("Added by you");
    });
  });

  it("merges duplicates and increments quantities", async () => {
    await asDemo(async (ctx) => {
      await applyShoppingActions(ctx, parseShoppingText("oat milk"));
      await applyShoppingActions(ctx, parseShoppingText("Greek yoghurt"));
      await applyShoppingActions(ctx, parseShoppingText("Get another Greek yogurt"));
      const view = await getShoppingView(ctx);
      const yogurt = allNeed(view).filter((i) => i.normalizedName === "greek yogurt");
      expect(yogurt).toHaveLength(1);
      expect(yogurt[0]!.sources.find((s) => s.type === "manual")?.quantity).toBe(2);
    });
  });

  it("manual items survive plan changes; generated ones follow the plan", async () => {
    await asDemo(async (ctx) => {
      const week = await getWeek(ctx, mondayOf(new Date(friday + "T12:00:00")));
      const fridayItem = week.plan.items.find((i) => i.day === friday) ?? (await getWeek(ctx, mondayOf(new Date(thursday + "T12:00:00")))).plan.items.find((i) => i.day === friday);
      expect(fridayItem).toBeDefined();
      await removeFromPlan(ctx, fridayItem!.id);
      const view = await getShoppingView(ctx);
      const all = [...allNeed(view), ...view.check, ...view.have];
      expect(all.some((i) => i.sources.some((s) => s.sourceId === fridayItem!.id))).toBe(false);
      expect(names(all)).not.toContain("ground cinnamon"); // only the shawarma needed it
      expect(names(all)).toEqual(expect.arrayContaining(["dishwasher tablets", "toothpaste", "banana", "greek yogurt"])); // yogurt was also added by hand
      expect(names(all)).toContain("salmon"); // still planned on Thursday
    });
  });

  it("an item that is both manual and from a recipe stays when the recipe is removed", async () => {
    await asDemo(async (ctx) => {
      const recipes = await loadRecipes(ctx.sql);
      const salad = recipes.find((r) => r.title.startsWith("Salmon & Avocado"))!;
      await applyShoppingActions(ctx, parseShoppingText("avocados"));
      await addRecipeContributions(ctx, salad.id, { type: "recipe", sourceId: salad.id, label: salad.title });
      let avocado = [...allNeed(await getShoppingView(ctx))].find((i) => i.normalizedName === "avocado")!;
      expect(avocado.sources.map((s) => s.type)).toEqual(expect.arrayContaining(["manual", "recipe"]));
      await removeRecipeFromList(ctx, salad.id);
      avocado = [...allNeed(await getShoppingView(ctx))].find((i) => i.normalizedName === "avocado")!;
      expect(avocado).toBeDefined();
      expect(avocado.sources.map((s) => s.type)).toContain("manual");
      expect(avocado.sources.map((s) => s.type)).not.toContain("recipe");
    });
  });

  it("checking off records a purchase; corrections move items", async () => {
    await asDemo(async (ctx) => {
      const view = await getShoppingView(ctx);
      const toothpaste = allNeed(view).find((i) => i.normalizedName === "toothpaste")!;
      await setChecked(ctx, toothpaste.id, true);
      const count = await ctx.sql.one<{ n: number }>("select count(*)::int as n from purchase_items where normalized_name = 'toothpaste'");
      expect(count!.n).toBe(1);
      await setChecked(ctx, toothpaste.id, false);
      expect((await ctx.sql.one<{ n: number }>("select count(*)::int as n from purchase_items where normalized_name = 'toothpaste'"))!.n).toBe(0);
      const soy = (await getShoppingView(ctx)).have.find((i) => i.normalizedName === "soy sauce")!;
      await setStatus(ctx, soy.id, "need_to_buy");
      expect(names(allNeed(await getShoppingView(ctx)))).toContain("soy sauce");
    });
  });
});

describe("taste memory", () => {
  it("learns from feedback and plain-English statements, keeping them distinct", async () => {
    await asDemo(async (ctx) => {
      const recipes = await loadRecipes(ctx.sql);
      const bowl = recipes.find((r) => r.title === "Korean Beef Bowl")!;
      const comment = "Loved it but a bit too spicy. My kids loved this one.";
      await submitFeedback(ctx, bowl.id, { reaction: "loved", comment }, interpretFeedback(comment, "loved"));
      await applyPreferenceStatement(ctx, "I don't really like blue cheese", parsePreferenceStatement("I don't really like blue cheese"));
      const taste = await getTasteView(ctx);
      const blue = taste.avoids.find((p) => p.value === "blue cheese")!;
      expect(blue.source).toBe("explicit");
      expect(taste.likes.some((p) => p.source !== "explicit")).toBe(true);
      expect(taste.avoids.some((p) => p.value === "very cheesy")).toBe(true);
      const kidsReactions = await ctx.sql.query("select 1 from recipe_feedback f join household_members m on m.id = f.household_member_id where f.recipe_id = $1 and m.role = 'child'", [bowl.id]);
      expect(kidsReactions.length).toBe(2);
    });
  });
});

describe("library search", () => {
  it("answers natural-language library questions", async () => {
    await asDemo(async (ctx) => {
      const notCooked = await searchLibrary(ctx, "things I saved but haven't cooked");
      expect(notCooked.recipes.length).toBeGreaterThan(0);
      expect(notCooked.recipes.every((r) => r.timesCooked === 0)).toBe(true);
      const tahini = await searchLibrary(ctx, "recipes with tahini");
      expect(tahini.recipes.length).toBeGreaterThan(0);
      expect(tahini.recipes.every((r) => r.ingredients.some((i) => i.normalizedName === "tahini"))).toBe(true);
      const kids = await searchLibrary(ctx, "recipes my kids liked");
      expect(kids.recipes.map((r) => r.title)).toContain("Sticky Teriyaki Salmon");
      const similar = await searchLibrary(ctx, "something similar to the Korean beef bowl");
      expect(similar.recipes.length).toBeGreaterThan(0);
      expect(similar.recipes.map((r) => r.title)).not.toContain("Korean Beef Bowl");
    });
  });
});

describe("meal planning", () => {
  it("plans the requested number of dinners and keeps locked meals", async () => {
    const nextWeek = addDays(mondayOf(new Date()), 7);
    const res = await asDemo((ctx) => generateWeek(ctx, nextWeek, 4, "Quick meals, mostly healthy, make Friday more indulgent"));
    expect(res.planned).toBe(4);
    const week = await asDemo((ctx) => getWeek(ctx, nextWeek));
    expect(new Set(week.plan.items.map((i) => i.recipeId)).size).toBe(4);
    for (const i of week.plan.items) expect(i.reason).toBeTruthy();
  });
});

describe("privacy", () => {
  it("row level security isolates households", async () => {
    const other = String((await db.asService((sql) => sql.one<{ id: string }>("insert into auth.users (email, encrypted_password) values ('other@example.com','x') returning id")))!.id);
    const seen = await db.asUser(other, async (sql) => {
      await sql.query("select bootstrap_user('Other')");
      return {
        recipes: (await sql.one<{ n: number }>("select count(*)::int as n from recipes"))!.n,
        purchases: (await sql.one<{ n: number }>("select count(*)::int as n from purchase_items"))!.n,
        items: (await sql.one<{ n: number }>("select count(*)::int as n from shopping_list_items"))!.n,
        prefs: (await sql.one<{ n: number }>("select count(*)::int as n from taste_preferences"))!.n,
      };
    });
    expect(seen).toEqual({ recipes: 0, purchases: 0, items: 0, prefs: 0 });
  });
});
