import { asViewer } from "@/server/context";
import { getWeek } from "@/server/services/plan";
import { mondayOf } from "@/server/time";
import { PlanWeek } from "./PlanWeek";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plan" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const weekStart = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? mondayOf(new Date(week + "T12:00:00")) : mondayOf(new Date());
  const data = await asViewer(async (ctx) => {
    const view = await getWeek(ctx, weekStart);
    const listCount = await ctx.sql.one<{ n: number }>(
      `select count(distinct i.id)::int as n from shopping_list_items i join shopping_list_item_sources s on s.shopping_list_item_id = i.id
       join shopping_lists l on l.id = i.shopping_list_id where l.is_active and not i.checked and s.source_type = 'meal_plan'`,
    );
    return { ...view, planItemsOnList: listCount?.n ?? 0 };
  });
  return <PlanWeek {...data} currentWeek={mondayOf(new Date())} />;
}
