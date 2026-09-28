import type { Sql } from "../db/driver";
import type { HouseholdMember, MealPlan, MealPlanItem } from "@/core/domain/types";
import type { HouseholdRole } from "@/core/domain/schemas";
import { dateOnly, iso, str } from "./rows";

// ── Household ──────────────────────────────────────────────────────────────────

export async function listMembers(sql: Sql): Promise<HouseholdMember[]> {
  const rows = await sql.query("select id, name, role, user_id from household_members order by case role when 'self' then 0 when 'partner' then 1 when 'child' then 2 else 3 end, created_at");
  return rows.map((r) => ({ id: String(r.id), name: String(r.name), role: r.role as HouseholdRole, userId: str(r.user_id) }));
}

export async function addMember(sql: Sql, householdId: string, name: string, role: HouseholdRole): Promise<void> {
  await sql.query("insert into household_members (household_id, name, role) values ($1,$2,$3)", [householdId, name, role]);
}

export async function removeMember(sql: Sql, id: string): Promise<void> {
  await sql.query("delete from household_members where id = $1 and role <> 'self'", [id]);
}

// ── Meal plans ─────────────────────────────────────────────────────────────────

export async function getPlan(sql: Sql, weekStart: string): Promise<MealPlan> {
  const plan = await sql.one("select id, week_start, brief from meal_plans where week_start = $1", [weekStart]);
  if (!plan) return { id: null, weekStart, brief: null, items: [] };
  const items = await sql.query("select * from meal_plan_items where meal_plan_id = $1 order by day, meal_type", [plan.id]);
  return {
    id: String(plan.id),
    weekStart,
    brief: str(plan.brief),
    items: items.map(
      (i): MealPlanItem => ({
        id: String(i.id),
        day: dateOnly(i.day),
        mealType: String(i.meal_type),
        recipeId: String(i.recipe_id),
        locked: Boolean(i.locked),
        reason: str(i.reason),
        servings: i.servings == null ? null : Number(i.servings),
      }),
    ),
  };
}

export async function ensurePlan(sql: Sql, householdId: string, weekStart: string): Promise<string> {
  const row = await sql.one<{ id: string }>(
    "insert into meal_plans (household_id, week_start) values ($1, $2) on conflict (household_id, week_start) do update set updated_at = now() returning id",
    [householdId, weekStart],
  );
  return String(row!.id);
}

export async function setPlanBrief(sql: Sql, planId: string, brief: string | null) {
  await sql.query("update meal_plans set brief = $2, updated_at = now() where id = $1", [planId, brief]);
}

export async function upsertPlanItem(sql: Sql, planId: string, day: string, recipeId: string, reason: string | null, locked = false): Promise<{ id: string; replacedId: string | null }> {
  const previous = await sql.one<{ id: string }>("select id from meal_plan_items where meal_plan_id = $1 and day = $2 and meal_type = 'dinner'", [planId, day]);
  if (previous) await sql.query("delete from meal_plan_items where id = $1", [previous.id]);
  const row = await sql.one<{ id: string }>(
    "insert into meal_plan_items (meal_plan_id, day, meal_type, recipe_id, reason, locked) values ($1,$2,'dinner',$3,$4,$5) returning id",
    [planId, day, recipeId, reason, locked],
  );
  return { id: String(row!.id), replacedId: previous ? String(previous.id) : null };
}

export async function deletePlanItem(sql: Sql, id: string): Promise<void> {
  await sql.query("delete from meal_plan_items where id = $1", [id]);
}

export async function setPlanItemLocked(sql: Sql, id: string, locked: boolean): Promise<void> {
  await sql.query("update meal_plan_items set locked = $2 where id = $1", [id, locked]);
}

export async function planItemsBetween(sql: Sql, from: string, to: string): Promise<{ id: string; day: string; recipeId: string }[]> {
  const rows = await sql.query("select i.id, i.day, i.recipe_id from meal_plan_items i where i.day between $1 and $2", [from, to]);
  return rows.map((r) => ({ id: String(r.id), day: dateOnly(r.day), recipeId: String(r.recipe_id) }));
}

// ── Purchases & pantry ────────────────────────────────────────────────────────

export async function purchaseHistories(sql: Sql, sinceDays = 200): Promise<Map<string, string[]>> {
  const rows = await sql.query<{ normalized_name: string; purchased_at: Date }>(
    `select pi.normalized_name, p.purchased_at from purchase_items pi join purchases p on p.id = pi.purchase_id
     where pi.normalized_name is not null and p.purchased_at > now() - ($1 || ' days')::interval`,
    [String(sinceDays)],
  );
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.normalized_name, [...(map.get(r.normalized_name) ?? []), iso(r.purchased_at)]);
  return map;
}

export async function pantryCorrections(sql: Sql): Promise<Map<string, { hasItem: boolean; at: string }[]>> {
  const rows = await sql.query<{ normalized_name: string; has_item: boolean; created_at: Date }>(
    "select normalized_name, has_item, created_at from pantry_corrections where created_at > now() - interval '120 days'",
  );
  const map = new Map<string, { hasItem: boolean; at: string }[]>();
  for (const r of rows) map.set(r.normalized_name, [...(map.get(r.normalized_name) ?? []), { hasItem: Boolean(r.has_item), at: iso(r.created_at) }]);
  return map;
}

export async function addPantryCorrection(sql: Sql, householdId: string, name: string, hasItem: boolean): Promise<void> {
  await sql.query("insert into pantry_corrections (household_id, normalized_name, has_item) values ($1,$2,$3)", [householdId, name, hasItem]);
}

/** Checking an item off records it as bought today — shopping becomes purchase memory. */
export async function recordPurchase(
  sql: Sql,
  householdId: string,
  item: { normalizedName: string; rawName: string; quantity?: number | null; brand?: string | null; retailProductId?: string | null; ingredientId?: string | null; shoppingProductId?: string | null },
  retailer = "Shopping list",
): Promise<void> {
  let purchase = await sql.one<{ id: string }>(
    "select id from purchases where household_id = $1 and source = 'shopping_list' and purchased_at::date = current_date order by purchased_at desc limit 1",
    [householdId],
  );
  purchase ??= await sql.one<{ id: string }>("insert into purchases (household_id, retailer, source) values ($1,$2,'shopping_list') returning id", [householdId, retailer]);
  await sql.query(
    `insert into purchase_items (purchase_id, household_id, retailer, raw_name, normalized_name, quantity, brand, retail_product_id, ingredient_id, shopping_product_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [purchase!.id, householdId, retailer, item.rawName, item.normalizedName, item.quantity ?? null, item.brand ?? null, item.retailProductId ?? null, item.ingredientId ?? null, item.shoppingProductId ?? null],
  );
}

/** Un-checking the same day undoes the purchase record. */
export async function undoTodaysPurchase(sql: Sql, name: string): Promise<void> {
  await sql.query(
    `delete from purchase_items where id = (
       select pi.id from purchase_items pi join purchases p on p.id = pi.purchase_id
       where pi.normalized_name = $1 and p.source = 'shopping_list' and p.purchased_at::date = current_date
       order by p.purchased_at desc limit 1)`,
    [name],
  );
}

export async function productPurchaseSignals(sql: Sql, name: string) {
  return sql.query<{ brand: string | null; retail_product_id: string | null; n: number }>(
    "select brand, retail_product_id, count(*)::int as n from purchase_items where normalized_name = $1 group by brand, retail_product_id",
    [name],
  );
}

export async function retailProductsFor(sql: Sql, name: string) {
  return sql.query<Record<string, unknown>>(
    `select rp.* from retail_products rp
     left join ingredients i on i.id = rp.ingredient_id
     left join shopping_products sp on sp.id = rp.shopping_product_id
     where i.canonical_name = $1 or sp.canonical_name = $1`,
    [name],
  );
}
