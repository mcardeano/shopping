import Link from "next/link";
import { asViewer } from "@/server/context";
import { recommendForViewer } from "@/server/services/recommend";
import { loadRecipes, getFeedback } from "@/server/repos/recipes";
import { AIInput } from "@/components/AIInput";
import { QuickAddInput } from "@/components/QuickAddInput";
import { RecommendationCard } from "@/components/RecommendationCard";
import { RecipeRail } from "@/components/RecipeCard";
import { RatingPrompt } from "@/components/RatingPrompt";
import { SectionHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { greeting } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await asViewer(async (ctx) => {
    const [tonight, recipes] = await Promise.all([recommendForViewer(ctx, { query: "", exclude: [], limit: 3 }), loadRecipes(ctx.sql)]);
    const pantry = await recommendForViewer(ctx, { query: "use what I already have", exclude: tonight.results.map((r) => r.recipe.id), limit: 4 }, { record: false });
    const recent = [...recipes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
    const weekAgo = Date.now() - 6 * 86_400_000;
    const cookAgain = recipes
      .filter((r) => (r.rating === "loved" || r.isFavorite || r.timesCooked >= 2) && (!r.lastCookedAt || new Date(r.lastCookedAt).getTime() < weekAgo))
      .sort((a, b) => b.timesCooked - a.timesCooked)
      .slice(0, 8);
    // Ask about the most recent cook if we haven't heard how it went.
    const lastCooked = recipes.filter((r) => r.lastCookedAt && Date.now() - new Date(r.lastCookedAt).getTime() < 3 * 86_400_000).sort((a, b) => b.lastCookedAt!.localeCompare(a.lastCookedAt!))[0];
    let ask = null as null | { id: string; title: string };
    if (lastCooked) {
      const fb = await getFeedback(ctx.sql, lastCooked.id);
      if (!fb.some((f) => f.memberName === null && f.createdAt >= lastCooked.lastCookedAt!)) ask = { id: lastCooked.id, title: lastCooked.title };
    }
    const list = await ctx.sql.one<{ n: number }>("select count(*)::int as n from shopping_list_items i join shopping_lists l on l.id = i.shopping_list_id where l.is_active and not i.checked");
    return { name: ctx.displayName, tonight: tonight.results, pantry: pantry.results, recent, cookAgain, ask, listCount: list?.n ?? 0, total: recipes.length };
  });

  return (
    <div className="animate-fade">
      <header className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),20px)]">
        <p className="text-[14px] text-muted">
          {greeting()}
          {data.name && data.name !== "there" ? `, ${data.name}` : ""}
        </p>
        <Link href="/profile" className="grid h-10 w-10 place-items-center rounded-full bg-olive-soft font-display text-[20px] text-olive-deep" aria-label="Your taste & profile">
          {(data.name && data.name !== "there" ? data.name : "Me").charAt(0)}
        </Link>
      </header>

      <section className="px-5 pb-2 pt-5">
        <h1 className="font-display text-[46px]">
          What should
          <br />
          we cook?
        </h1>
        <div className="mt-5">
          <AIInput />
        </div>
      </section>

      {data.ask && (
        <div className="mt-6 px-5">
          <RatingPrompt recipeId={data.ask.id} title={data.ask.title} />
        </div>
      )}

      {data.total === 0 ? (
        <div className="mt-10">
          <div className="mx-5 rounded-[24px] bg-surface p-6 shadow-soft">
            <h2 className="font-display text-[30px]">Start your food memory</h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted">Save a recipe you found online — a link, a screenshot or the caption. Suggestions get more personal with every recipe you save and cook.</p>
            <Link href="/add" className="mt-5 inline-flex h-11 items-center gap-2 rounded-[14px] bg-ink px-4.5 text-[15px] font-medium text-bg">
              <Icon name="plus" size={18} /> Save your first recipe
            </Link>
          </div>
        </div>
      ) : (
        <>
          <section className="mt-9">
            <SectionHeader
              title="For you tonight"
              subtitle="Picked from what you usually love"
              action={
                <Link href="/cook" className="text-[13.5px] font-medium text-olive">
                  More ideas
                </Link>
              }
            />
            <div className="no-scrollbar flex gap-3.5 overflow-x-auto px-5 pb-1">
              {data.tonight.map((r) => (
                <RecommendationCard key={r.recipe.id} recipe={r.recipe} reason={r.reason} size="compact" />
              ))}
            </div>
          </section>

          <section className="mx-5 mt-9 rounded-[22px] bg-olive-soft/80 p-4 pt-4.5">
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h2 className="text-[17px] font-semibold">What do you need?</h2>
              <Link href="/shopping" className="text-[13px] font-medium text-olive-deep">
                {data.listCount ? `${data.listCount} on your list` : "Open list"}
              </Link>
            </div>
            <QuickAddInput />
          </section>

          {data.pantry.length > 0 && (
            <section className="mt-9">
              <SectionHeader title="Use what you already have" subtitle="Mostly things you probably have at home" />
              <div className="no-scrollbar flex gap-3.5 overflow-x-auto px-5 pb-1">
                {data.pantry.map((r) => (
                  <RecommendationCard key={r.recipe.id} recipe={r.recipe} reason={r.reason} size="compact" />
                ))}
              </div>
            </section>
          )}

          <section className="mt-9">
            <SectionHeader
              title="Recently saved"
              action={
                <Link href="/saved" className="text-[13.5px] font-medium text-olive">
                  All {data.total}
                </Link>
              }
            />
            <RecipeRail recipes={data.recent} />
          </section>

          {data.cookAgain.length > 0 && (
            <section className="mt-9">
              <SectionHeader title="Cook again" subtitle="Favourites you haven't made this week" />
              <RecipeRail recipes={data.cookAgain} />
            </section>
          )}

          <div className="mx-5 mt-10 flex items-center justify-between rounded-[20px] bg-surface p-4 shadow-soft">
            <div>
              <p className="text-[15px] font-semibold">Found something good?</p>
              <p className="text-[13px] text-muted">Paste a link, screenshot or caption.</p>
            </div>
            <Link href="/add" className="inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-ink px-3.5 text-[14px] font-medium text-bg">
              <Icon name="plus" size={16} /> Save
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
