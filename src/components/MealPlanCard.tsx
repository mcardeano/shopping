"use client";

import Link from "next/link";
import type { MealPlanItem, Recipe } from "@/core/domain/types";
import { recipeMeta } from "@/lib/format";
import { RecipeImage } from "./RecipeImage";
import { Icon } from "./Icon";

export function MealPlanCard({
  dayLabel,
  dateLabel,
  isToday,
  isPast,
  item,
  recipe,
  onAdd,
  onSwap,
  onLock,
  onRemove,
  busy,
}: {
  dayLabel: string;
  dateLabel: string;
  isToday: boolean;
  isPast: boolean;
  item?: MealPlanItem;
  recipe?: Recipe;
  onAdd: () => void;
  onSwap?: () => void;
  onLock?: () => void;
  onRemove?: () => void;
  busy?: boolean;
}) {
  return (
    <div className={`flex gap-3.5 py-3 ${isPast ? "opacity-55" : ""}`}>
      <div className="w-11 shrink-0 pt-1 text-center">
        <p className={`text-[11.5px] font-semibold tracking-[0.08em] ${isToday ? "text-terracotta" : "text-muted"}`}>{dayLabel}</p>
        <p className={`font-display text-[26px] ${isToday ? "text-terracotta" : "text-ink"}`}>{dateLabel}</p>
      </div>
      {item && recipe ? (
        <div className={`flex min-w-0 flex-1 gap-3 rounded-[20px] bg-surface p-2.5 shadow-soft transition ${busy ? "animate-pulse" : ""}`}>
          <Link href={`/recipes/${recipe.id}`} className="w-[76px] shrink-0">
            <RecipeImage id={recipe.id} title={recipe.title} imageUrl={recipe.imageUrl} cuisine={recipe.cuisine} ingredients={recipe.ingredients.map((i) => i.normalizedName)} aspect={1} rounded="rounded-[14px]" />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col py-0.5">
            <Link href={`/recipes/${recipe.id}`} className="line-clamp-2 text-[15px] font-semibold leading-snug">
              {recipe.title}
            </Link>
            <p className="mt-0.5 text-[12.5px] text-muted">{recipeMeta(recipe)}</p>
            {item.reason && <p className="mt-1 line-clamp-1 text-[12.5px] text-olive-deep">{item.reason}</p>}
            {!isPast && (
              <div className="mt-auto flex items-center gap-0.5 pt-1.5 -ml-1.5">
                <button onClick={onLock} className={`grid h-8 w-8 place-items-center rounded-full ${item.locked ? "text-terracotta" : "text-faint hover:text-ink"}`} aria-label={item.locked ? "Unlock meal" : "Lock meal"} title={item.locked ? "Locked — kept when you regenerate" : "Lock to keep when regenerating"}>
                  <Icon name={item.locked ? "lock" : "unlock"} size={16} />
                </button>
                <button onClick={onSwap} disabled={item.locked} className="grid h-8 w-8 place-items-center rounded-full text-faint hover:text-ink disabled:opacity-30" aria-label="Swap meal" title="Swap for something else">
                  <Icon name="swap" size={16} />
                </button>
                <button onClick={onRemove} className="grid h-8 w-8 place-items-center rounded-full text-faint hover:text-terracotta-deep" aria-label="Remove meal" title="Remove">
                  <Icon name="trash" size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={onAdd}
          disabled={isPast}
          className="flex h-[96px] flex-1 items-center justify-center gap-2 rounded-[20px] border border-dashed border-ink/15 text-[14px] text-faint transition hover:border-ink/30 hover:text-muted disabled:pointer-events-none"
        >
          {!isPast && (
            <>
              <Icon name="plus" size={17} /> Add dinner
            </>
          )}
        </button>
      )}
    </div>
  );
}
