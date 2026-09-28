"use client";

import Link from "next/link";
import type { Recipe } from "@/core/domain/types";
import { recipeMeta } from "@/lib/format";
import { RecipeImage } from "./RecipeImage";
import { Icon } from "./Icon";

/** A recommendation with its one-sentence reason. Scores are never shown. */
export function RecommendationCard({
  recipe,
  reason,
  onNotInterested,
  onPlan,
  size = "large",
}: {
  recipe: Recipe;
  reason: string;
  onNotInterested?: () => void;
  onPlan?: () => void;
  size?: "large" | "compact";
}) {
  if (size === "compact") {
    return (
      <Link href={`/recipes/${recipe.id}`} className="group block w-[232px] shrink-0">
        <RecipeImage id={recipe.id} title={recipe.title} imageUrl={recipe.imageUrl} cuisine={recipe.cuisine} ingredients={recipe.ingredients.map((i) => i.normalizedName)} aspect={1} />
        <div className="mt-2.5 px-0.5">
          <h3 className="line-clamp-1 text-[15.5px] font-semibold">{recipe.title}</h3>
          <p className="text-[12.5px] text-muted">{recipeMeta(recipe)}</p>
          <p className="mt-1.5 line-clamp-3 text-[13px] leading-snug text-ink-2">{reason}</p>
        </div>
      </Link>
    );
  }
  return (
    <article className="animate-rise overflow-hidden rounded-[24px] bg-surface shadow-soft">
      <Link href={`/recipes/${recipe.id}`} className="block">
        <RecipeImage id={recipe.id} title={recipe.title} imageUrl={recipe.imageUrl} cuisine={recipe.cuisine} ingredients={recipe.ingredients.map((i) => i.normalizedName)} aspect={16 / 10} rounded="rounded-none" />
      </Link>
      <div className="p-4.5 pt-4">
        <Link href={`/recipes/${recipe.id}`}>
          <h3 className="font-display text-[27px]">{recipe.title}</h3>
          <p className="mt-1 text-[13px] text-muted">{recipeMeta(recipe, { protein: true })}</p>
        </Link>
        <p className="mt-3 flex gap-2 text-[14.5px] leading-snug text-ink-2">
          <Icon name="leaf" size={16} className="mt-[3px] shrink-0 text-olive" />
          <span>{reason}</span>
        </p>
        {(onPlan || onNotInterested) && (
          <div className="mt-4 flex items-center gap-2">
            <Link href={`/recipes/${recipe.id}`} className="inline-flex h-10 items-center rounded-[12px] bg-ink px-4 text-[14px] font-medium text-bg">
              Let&apos;s cook
            </Link>
            {onPlan && (
              <button onClick={onPlan} className="inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-sand px-3.5 text-[14px] font-medium">
                <Icon name="calendar" size={16} /> Plan
              </button>
            )}
            {onNotInterested && (
              <button onClick={onNotInterested} className="ml-auto h-10 rounded-[12px] px-2 text-[13px] text-muted hover:text-ink">
                Not tonight
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
