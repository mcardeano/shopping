import type { Ctx } from "../context";

/** Deletes everything this household has stored (recipes, taste, lists, purchases). */
export async function deleteHouseholdData(ctx: Ctx): Promise<void> {
  const tables = ["recipe_imports", "recipe_interactions", "recipe_feedback", "taste_preferences", "meal_plans", "shopping_lists", "purchases", "pantry_corrections", "pantry_estimates", "recipes"];
  for (const t of tables) await ctx.sql.query(`delete from ${t} where household_id = $1`, [ctx.householdId]);
  await ctx.sql.query("delete from household_members where household_id = $1 and role <> 'self'", [ctx.householdId]);
  await ctx.sql.query("insert into shopping_lists (household_id, name, is_active) values ($1, 'Shopping', true)", [ctx.householdId]);
}
