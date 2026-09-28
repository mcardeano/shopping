import { notFound } from "next/navigation";
import { asViewer } from "@/server/context";
import { getFeedback, getRecipe } from "@/server/repos/recipes";
import { listMembers, planItemsBetween } from "@/server/repos/misc";
import { loadPantry } from "@/server/services/pantry";
import { activeListId, sourceIdsOfType } from "@/server/repos/shopping";
import { addDays, localDate, mondayOf } from "@/server/time";
import { RecipeDetail } from "./RecipeDetail";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const title = await asViewer(async (ctx) => (await getRecipe(ctx.sql, id))?.title);
  return { title: title ?? "Recipe" };
}

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await asViewer(async (ctx) => {
    const recipe = await getRecipe(ctx.sql, id);
    if (!recipe) return null;
    const [feedback, pantry, members, listId] = await Promise.all([getFeedback(ctx.sql, id), loadPantry(ctx), listMembers(ctx.sql), activeListId(ctx.sql, ctx.householdId)]);
    const onList = (await sourceIdsOfType(ctx.sql, listId, "recipe")).includes(id);
    const today = localDate(new Date());
    const planned = (await planItemsBetween(ctx.sql, today, addDays(today, 13))).filter((p) => p.recipeId === id).map((p) => p.day);
    return {
      recipe,
      feedback,
      members,
      onList,
      planned,
      weekStart: mondayOf(new Date()),
      today,
      pantry: Object.fromEntries(recipe.ingredients.map((i) => [i.normalizedName, pantry.estimate(i.normalizedName).status])),
    };
  });
  if (!data) notFound();
  return <RecipeDetail {...data} />;
}
