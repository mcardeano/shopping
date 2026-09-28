import Link from "next/link";
import type { Recipe } from "@/core/domain/types";
import { contextualTags, recipeMeta } from "@/lib/format";
import { RecipeImage } from "./RecipeImage";
import { Icon } from "./Icon";

type Props = { recipe: Recipe; reason?: string | null; variant?: "grid" | "rail" | "wide"; priority?: boolean; showTags?: boolean };

export function RecipeCard({ recipe, reason, variant = "grid", priority, showTags = true }: Props) {
  const tags = showTags ? contextualTags(recipe) : [];
  const img = (
    <div className="relative">
      <RecipeImage
        id={recipe.id}
        title={recipe.title}
        imageUrl={recipe.imageUrl}
        cuisine={recipe.cuisine}
        ingredients={recipe.ingredients.map((i) => i.normalizedName)}
        aspect={variant === "wide" ? 16 / 11 : 4 / 5}
        priority={priority}
      />
      {recipe.isFavorite && (
        <span className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-surface/85 text-terracotta backdrop-blur" aria-label="Favourite">
          <Icon name="heart" size={15} filled strokeWidth={1.4} />
        </span>
      )}
      {tags.length > 0 && variant !== "rail" && (
        <div className="absolute bottom-2.5 left-2.5 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-surface/88 px-2 py-[3px] text-[11px] font-medium text-ink-2 backdrop-blur">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <Link href={`/recipes/${recipe.id}`} className={`group block ${variant === "rail" ? "w-[148px] shrink-0" : ""}`}>
      <div className="transition duration-200 group-active:scale-[0.985]">{img}</div>
      <div className="mt-2.5 px-0.5">
        <h3 className={`font-semibold leading-snug tracking-[-0.005em] text-ink ${variant === "wide" ? "text-[17px]" : "text-[14.5px]"} line-clamp-2`}>{recipe.title}</h3>
        <p className="mt-0.5 text-[12.5px] text-muted">{recipeMeta(recipe)}</p>
        {reason && <p className="mt-1.5 text-[13px] leading-snug text-ink-2">{reason}</p>}
      </div>
    </Link>
  );
}

export function RecipeGrid({ recipes }: { recipes: Recipe[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-3.5 gap-y-6 px-5">
      {recipes.map((r, i) => (
        <RecipeCard key={r.id} recipe={r} priority={i < 4} />
      ))}
    </div>
  );
}

export function RecipeRail({ recipes }: { recipes: Recipe[] }) {
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto px-5 pb-1">
      {recipes.map((r) => (
        <RecipeCard key={r.id} recipe={r} variant="rail" />
      ))}
    </div>
  );
}
