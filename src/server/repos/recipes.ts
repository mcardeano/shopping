import type { Sql } from "../db/driver";
import type { HouseholdReaction, Recipe, RecipeFeedback, RecipeIngredient } from "@/core/domain/types";
import type { HouseholdRole, Reaction, RecipeDraft, SourcePlatform, TasteSignals } from "@/core/domain/schemas";
import { TasteSignals as TasteSignalsSchema } from "@/core/domain/schemas";
import { toPgVector, fromPgVector } from "@/core/services/embedding";
import { arr, iso, isoOrNull, num, str } from "./rows";

const RECIPE_COLUMNS = `r.id, r.household_id, r.user_id, r.title, r.description, r.source_url, r.source_platform, r.source_creator, r.image_url,
  r.servings, r.prep_time_minutes, r.cook_time_minutes, r.total_time_minutes, r.calories_per_serving, r.protein_grams, r.carbs_grams, r.fat_grams,
  r.nutrition_is_estimate, r.cuisine, r.meal_type, r.techniques, r.flavors, r.dietary, r.tags, r.difficulty, r.rating, r.is_favorite,
  r.times_cooked, r.last_cooked_at, r.open_count, r.notes, r.created_at, r.updated_at`;

type Row = Record<string, unknown>;

function mapRecipe(r: Row, ingredients: RecipeIngredient[], steps: string[], household: HouseholdReaction[]): Recipe {
  return {
    id: String(r.id),
    householdId: String(r.household_id),
    userId: String(r.user_id),
    title: String(r.title),
    description: str(r.description),
    sourceUrl: str(r.source_url),
    sourcePlatform: (r.source_platform as SourcePlatform | null) ?? null,
    sourceCreator: str(r.source_creator),
    imageUrl: str(r.image_url),
    servings: num(r.servings),
    prepTimeMinutes: num(r.prep_time_minutes),
    cookTimeMinutes: num(r.cook_time_minutes),
    totalTimeMinutes: num(r.total_time_minutes),
    caloriesPerServing: num(r.calories_per_serving),
    proteinGrams: num(r.protein_grams),
    carbsGrams: num(r.carbs_grams),
    fatGrams: num(r.fat_grams),
    nutritionIsEstimate: Boolean(r.nutrition_is_estimate),
    cuisine: str(r.cuisine),
    mealType: str(r.meal_type),
    techniques: arr(r.techniques),
    flavors: arr(r.flavors),
    dietary: arr(r.dietary),
    tags: arr(r.tags),
    difficulty: (r.difficulty as Recipe["difficulty"]) ?? null,
    rating: (r.rating as Reaction | null) ?? null,
    isFavorite: Boolean(r.is_favorite),
    timesCooked: Number(r.times_cooked ?? 0),
    lastCookedAt: isoOrNull(r.last_cooked_at),
    openCount: Number(r.open_count ?? 0),
    notes: str(r.notes),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    ingredients,
    steps,
    household,
  };
}

function mapIngredient(r: Row): RecipeIngredient {
  return {
    id: String(r.id),
    position: Number(r.position),
    rawText: String(r.raw_text),
    ingredientId: str(r.ingredient_id),
    normalizedName: String(r.normalized_name),
    amount: num(r.amount),
    unit: str(r.unit),
    preparation: str(r.preparation),
    optional: Boolean(r.optional),
  };
}

export type RecipeWithEmbedding = Recipe & { embedding?: number[] };

/**
 * Loads recipes with ingredients and household reactions (not steps).
 * RLS scopes everything to the caller's household.
 */
export async function loadRecipes(sql: Sql, opts: { ids?: string[]; withEmbedding?: boolean; withSteps?: boolean } = {}): Promise<RecipeWithEmbedding[]> {
  const where = opts.ids ? "where r.id = any($1::uuid[])" : "";
  const params = opts.ids ? [opts.ids] : [];
  const rows = await sql.query(`select ${RECIPE_COLUMNS}${opts.withEmbedding ? ", r.embedding::text as embedding" : ""} from recipes r ${where} order by r.created_at desc`, params);
  if (!rows.length) return [];
  const ids = rows.map((r) => String(r.id));
  const [ings, reactions, steps] = await Promise.all([
    sql.query(`select * from recipe_ingredients where recipe_id = any($1::uuid[]) order by recipe_id, position`, [ids]),
    sql.query(
      `select distinct on (f.recipe_id, f.household_member_id) f.recipe_id, f.household_member_id, f.reaction, m.name, m.role
       from recipe_feedback f join household_members m on m.id = f.household_member_id
       where f.recipe_id = any($1::uuid[]) and f.reaction is not null and m.role <> 'self'
       order by f.recipe_id, f.household_member_id, f.created_at desc`,
      [ids],
    ),
    opts.withSteps ? sql.query(`select recipe_id, text from recipe_steps where recipe_id = any($1::uuid[]) order by recipe_id, position`, [ids]) : Promise.resolve([]),
  ]);
  const ingBy = new Map<string, RecipeIngredient[]>();
  for (const i of ings) {
    const k = String(i.recipe_id);
    ingBy.set(k, [...(ingBy.get(k) ?? []), mapIngredient(i)]);
  }
  const hhBy = new Map<string, HouseholdReaction[]>();
  for (const h of reactions) {
    const k = String(h.recipe_id);
    hhBy.set(k, [...(hhBy.get(k) ?? []), { memberId: String(h.household_member_id), memberName: String(h.name), role: h.role as HouseholdRole, reaction: h.reaction as Reaction }]);
  }
  const stepsBy = new Map<string, string[]>();
  for (const s of steps) {
    const k = String(s.recipe_id);
    stepsBy.set(k, [...(stepsBy.get(k) ?? []), String(s.text)]);
  }
  return rows.map((r) => {
    const recipe: RecipeWithEmbedding = mapRecipe(r, ingBy.get(String(r.id)) ?? [], stepsBy.get(String(r.id)) ?? [], hhBy.get(String(r.id)) ?? []);
    if (opts.withEmbedding) recipe.embedding = fromPgVector(r.embedding);
    return recipe;
  });
}

export async function getRecipe(sql: Sql, id: string): Promise<Recipe | undefined> {
  const [r] = await loadRecipes(sql, { ids: [id], withSteps: true });
  return r;
}

export async function getFeedback(sql: Sql, recipeId: string): Promise<RecipeFeedback[]> {
  const rows = await sql.query(
    `select f.*, m.name as member_name, m.role as member_role from recipe_feedback f left join household_members m on m.id = f.household_member_id
     where f.recipe_id = $1 order by f.created_at desc`,
    [recipeId],
  );
  return rows.map((r) => {
    const parsed = r.signals ? TasteSignalsSchema.safeParse(typeof r.signals === "string" ? JSON.parse(r.signals) : r.signals) : null;
    return {
      id: String(r.id),
      recipeId: String(r.recipe_id),
      memberId: str(r.household_member_id),
      memberName: r.member_role === "self" ? null : str(r.member_name),
      reaction: (r.reaction as Reaction | null) ?? null,
      comment: str(r.comment),
      signals: parsed?.success ? parsed.data : null,
      createdAt: iso(r.created_at),
    };
  });
}

export type RecipeWrite = RecipeDraft & { semanticText: string; embedding: number[]; ingredientIds: Map<string, string> };

export async function insertRecipe(sql: Sql, owner: { householdId: string; userId: string; createdAt?: string }, d: RecipeWrite): Promise<string> {
  const row = await sql.one<{ id: string }>(
    `insert into recipes (household_id, user_id, title, description, source_url, source_platform, source_creator, image_url, servings,
      prep_time_minutes, cook_time_minutes, total_time_minutes, calories_per_serving, protein_grams, carbs_grams, fat_grams, nutrition_is_estimate,
      cuisine, meal_type, techniques, flavors, dietary, tags, difficulty, notes, semantic_text, embedding, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::text[],$21::text[],$22::text[],$23::text[],$24,$25,$26,$27::vector,
      coalesce($28::timestamptz, now()), coalesce($28::timestamptz, now()))
     returning id`,
    [
      owner.householdId, owner.userId, d.title, d.description, d.sourceUrl, d.sourcePlatform, d.sourceCreator, d.imageUrl, d.servings,
      d.prepTimeMinutes, d.cookTimeMinutes, d.totalTimeMinutes, d.caloriesPerServing, d.proteinGrams, d.carbsGrams, d.fatGrams, d.nutritionIsEstimate,
      d.cuisine, d.mealType, d.techniques, d.flavors, d.dietary, d.tags, d.difficulty, d.notes, d.semanticText, toPgVector(d.embedding), owner.createdAt ?? null,
    ],
  );
  const id = row!.id;
  await writeChildren(sql, id, d);
  return id;
}

async function writeChildren(sql: Sql, id: string, d: RecipeWrite) {
  if (d.ingredients.length) {
    await sql.query(
      `insert into recipe_ingredients (recipe_id, position, raw_text, ingredient_id, normalized_name, amount, unit, preparation, optional)
       select $1, * from unnest($2::int[], $3::text[], $4::uuid[], $5::text[], $6::numeric[], $7::text[], $8::text[], $9::boolean[])`,
      [
        id,
        d.ingredients.map((_, i) => i),
        d.ingredients.map((i) => i.rawText),
        d.ingredients.map((i) => d.ingredientIds.get(i.name) ?? null),
        d.ingredients.map((i) => i.name),
        d.ingredients.map((i) => i.amount ?? null),
        d.ingredients.map((i) => i.unit ?? null),
        d.ingredients.map((i) => i.preparation ?? null),
        d.ingredients.map((i) => i.optional),
      ],
    );
  }
  if (d.steps.length) {
    await sql.query(`insert into recipe_steps (recipe_id, position, text) select $1, * from unnest($2::int[], $3::text[])`, [id, d.steps.map((_, i) => i), d.steps]);
  }
}

export async function updateRecipe(sql: Sql, id: string, d: RecipeWrite): Promise<void> {
  await sql.query(
    `update recipes set title=$2, description=$3, source_url=$4, source_creator=$5, image_url=$6, servings=$7, prep_time_minutes=$8, cook_time_minutes=$9,
      total_time_minutes=$10, calories_per_serving=$11, protein_grams=$12, carbs_grams=$13, fat_grams=$14, cuisine=$15, meal_type=$16, tags=$17::text[],
      flavors=$18::text[], difficulty=$19, notes=$20, semantic_text=$21, embedding=$22::vector, updated_at=now() where id=$1`,
    [id, d.title, d.description, d.sourceUrl, d.sourceCreator, d.imageUrl, d.servings, d.prepTimeMinutes, d.cookTimeMinutes, d.totalTimeMinutes, d.caloriesPerServing, d.proteinGrams, d.carbsGrams, d.fatGrams, d.cuisine, d.mealType, d.tags, d.flavors, d.difficulty, d.notes, d.semanticText, toPgVector(d.embedding)],
  );
  await sql.query("delete from recipe_ingredients where recipe_id = $1", [id]);
  await sql.query("delete from recipe_steps where recipe_id = $1", [id]);
  await writeChildren(sql, id, d);
}

export async function deleteRecipe(sql: Sql, id: string): Promise<void> {
  await sql.query("delete from recipes where id = $1", [id]);
}

export async function setFavorite(sql: Sql, id: string, favorite: boolean): Promise<void> {
  await sql.query("update recipes set is_favorite = $2, updated_at = now() where id = $1", [id, favorite]);
}

export async function setNotes(sql: Sql, id: string, notes: string | null): Promise<void> {
  await sql.query("update recipes set notes = $2, updated_at = now() where id = $1", [id, notes]);
}

export async function markCooked(sql: Sql, id: string, at = new Date()): Promise<void> {
  await sql.query("update recipes set times_cooked = times_cooked + 1, last_cooked_at = greatest(coalesce(last_cooked_at, $2), $2), updated_at = now() where id = $1", [id, at]);
}

export async function setRating(sql: Sql, id: string, rating: Reaction | null): Promise<void> {
  await sql.query("update recipes set rating = $2, updated_at = now() where id = $1", [id, rating]);
}

export async function incrementOpen(sql: Sql, id: string): Promise<void> {
  await sql.query("update recipes set open_count = open_count + 1 where id = $1", [id]);
}

export async function recordInteraction(
  sql: Sql,
  owner: { householdId: string; userId: string },
  type: "saved" | "opened" | "cooked" | "favorited" | "unfavorited" | "rejected" | "not_interested" | "planned" | "swapped_out" | "searched",
  recipeId: string | null,
  opts: { query?: string; at?: string } = {},
): Promise<void> {
  await sql.query(
    "insert into recipe_interactions (household_id, user_id, recipe_id, type, query, created_at) values ($1,$2,$3,$4,$5, coalesce($6::timestamptz, now()))",
    [owner.householdId, owner.userId, recipeId, type, opts.query ?? null, opts.at ?? null],
  );
}

export async function insertFeedback(
  sql: Sql,
  owner: { householdId: string; userId: string },
  f: { recipeId: string; memberId: string; reaction: Reaction | null; comment: string | null; signals: TasteSignals | null; at?: string },
): Promise<void> {
  await sql.query(
    `insert into recipe_feedback (household_id, recipe_id, author_user_id, household_member_id, reaction, comment, signals, created_at)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb, coalesce($8::timestamptz, now()))`,
    [owner.householdId, f.recipeId, owner.userId, f.memberId, f.reaction, f.comment, f.signals ? JSON.stringify(f.signals) : null, f.at ?? null],
  );
}

export async function semanticSearch(sql: Sql, embedding: number[], limit = 30): Promise<{ id: string; distance: number }[]> {
  const rows = await sql.query<{ id: string; distance: number }>(
    "select id, (embedding <=> $1::vector)::float8 as distance from recipes where embedding is not null order by embedding <=> $1::vector limit $2",
    [toPgVector(embedding), limit],
  );
  return rows.map((r) => ({ id: String(r.id), distance: Number(r.distance) }));
}

export async function interactionCounts(sql: Sql, sinceDays = 365) {
  return sql.query<{ recipe_id: string; type: string; n: number; last_at: Date }>(
    `select recipe_id, type, count(*)::int as n, max(created_at) as last_at from recipe_interactions
     where recipe_id is not null and created_at > now() - ($1 || ' days')::interval group by recipe_id, type`,
    [String(sinceDays)],
  );
}

export async function cookEvents(sql: Sql) {
  return sql.query<{ recipe_id: string; created_at: Date }>("select recipe_id, created_at from recipe_interactions where type = 'cooked' and recipe_id is not null order by created_at desc limit 400");
}

export async function ingredientIdMap(sql: Sql, names: string[]): Promise<Map<string, string>> {
  if (!names.length) return new Map();
  const rows = await sql.query<{ id: string; canonical_name: string }>("select id, canonical_name from ingredients where canonical_name = any($1::text[])", [names]);
  return new Map(rows.map((r) => [r.canonical_name, String(r.id)]));
}
