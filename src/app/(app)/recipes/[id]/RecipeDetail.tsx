"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { HouseholdMember, PantryStatus, Recipe, RecipeFeedback } from "@/core/domain/types";
import { formatQuantity, scaleAmount } from "@/core/text/quantity";
import { apiFetch } from "@/lib/api";
import { minutesLabel, recipeMeta, relativeDays, shortDate } from "@/lib/format";
import { RecipeImage } from "@/components/RecipeImage";
import { IngredientRow } from "@/components/IngredientRow";
import { RatingPrompt } from "@/components/RatingPrompt";
import { SourceBadge } from "@/components/SourceBadge";
import { BottomSheet, Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toaster";

const REACTION_LABEL = { loved: "Loved it", good: "Good", not_for_me: "Not for me" } as const;

type Props = {
  recipe: Recipe;
  feedback: RecipeFeedback[];
  members: HouseholdMember[];
  pantry: Record<string, PantryStatus>;
  onList: boolean;
  planned: string[];
  weekStart: string;
  today: string;
};

export function RecipeDetail({ recipe, feedback, pantry, onList, planned, today }: Props) {
  const router = useRouter();
  const [servings, setServings] = useState(recipe.servings ?? 2);
  const [have, setHave] = useState<Set<string>>(() => new Set(recipe.ingredients.filter((i) => pantry[i.normalizedName] === "probably_have").map((i) => i.id)));
  const [favorite, setFavorite] = useState(recipe.isFavorite);
  const [justCooked, setJustCooked] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notes, setNotes] = useState(recipe.notes ?? "");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/recipes/${recipe.id}/open`, { body: {} }).catch(() => undefined);
  }, [recipe.id]);

  const scaled = useMemo(
    () =>
      recipe.ingredients.map((i) => {
        const amount = scaleAmount(i.amount ?? undefined, recipe.servings ?? undefined, servings);
        return { ...i, amountLabel: amount != null ? formatQuantity({ amount, unit: i.unit ?? undefined }) : null };
      }),
    [recipe, servings],
  );

  async function run<T>(key: string, fn: () => Promise<T>) {
    setBusy(key);
    try {
      return await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong.", { tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  const cook = () =>
    run("cook", async () => {
      await apiFetch(`/api/recipes/${recipe.id}/cook`, { body: {} });
      setJustCooked(true);
      toast("Nice. Marked as cooked.");
      router.refresh();
    });

  const toggleFavorite = () =>
    run("fav", async () => {
      const next = !favorite;
      setFavorite(next);
      await apiFetch(`/api/recipes/${recipe.id}/favorite`, { body: { favorite: next } });
      router.refresh();
    });

  const addToShopping = () =>
    run("shop", async () => {
      const res = await apiFetch<{ count: number }>(`/api/recipes/${recipe.id}/shopping`, { body: { servings } });
      toast(res.count ? `Added ${res.count} ingredients. Things you probably have are listed separately.` : "Everything's already on your list.", {
        action: { label: "View list", onClick: () => router.push("/shopping") },
      });
      router.refresh();
    });

  const planOn = (day: string) =>
    run("plan", async () => {
      await apiFetch("/api/plan/items", { body: { day, recipeId: recipe.id } });
      setPlanOpen(false);
      toast(`Planned for ${new Date(day + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long" })}. Ingredients added to your list.`, {
        action: { label: "View plan", onClick: () => router.push("/plan") },
      });
      router.refresh();
    });

  const saveNotes = () =>
    run("notes", async () => {
      await apiFetch(`/api/recipes/${recipe.id}`, { method: "PATCH", body: { notes } });
      toast("Notes saved.");
    });

  const remove = () =>
    run("delete", async () => {
      if (!confirm("Delete this recipe from your library? Items you added by hand stay on your shopping list.")) return;
      await apiFetch(`/api/recipes/${recipe.id}`, { method: "DELETE" });
      toast("Recipe deleted.");
      router.push("/saved");
      router.refresh();
    });

  const ownFeedback = feedback.filter((f) => !f.memberName && (f.comment || f.reaction));
  const householdLine = recipe.household.length
    ? recipe.household.map((h) => `${h.memberName}: ${REACTION_LABEL[h.reaction].toLowerCase()}`).join(" · ")
    : null;
  const next14 = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  return (
    <article className="animate-fade">
      <div className="relative">
        <RecipeImage
          id={recipe.id}
          title={recipe.title}
          imageUrl={recipe.imageUrl}
          cuisine={recipe.cuisine}
          ingredients={recipe.ingredients.map((i) => i.normalizedName)}
          aspect={4 / 3.6}
          rounded="rounded-none"
          priority
        />
        <div className="absolute inset-x-0 top-0 flex justify-between p-4 pt-[max(env(safe-area-inset-top),16px)]">
          <button onClick={() => router.back()} className="grid h-10 w-10 place-items-center rounded-full bg-surface/90 shadow-soft backdrop-blur" aria-label="Back">
            <Icon name="chevronLeft" size={20} />
          </button>
          <div className="flex gap-2">
            <button onClick={toggleFavorite} className={`grid h-10 w-10 place-items-center rounded-full bg-surface/90 shadow-soft backdrop-blur ${favorite ? "text-terracotta" : ""}`} aria-label={favorite ? "Remove from favourites" : "Add to favourites"} aria-pressed={favorite}>
              <Icon name="heart" size={19} filled={favorite} />
            </button>
            <button onClick={() => setMoreOpen(true)} className="grid h-10 w-10 place-items-center rounded-full bg-surface/90 shadow-soft backdrop-blur" aria-label="More">
              <Icon name="more" size={20} strokeWidth={2.6} />
            </button>
          </div>
        </div>
      </div>

      <div className="relative -mt-6 rounded-t-[28px] bg-bg px-5 pt-6">
        <SourceBadge platform={recipe.sourcePlatform} creator={recipe.sourceCreator} url={recipe.sourceUrl} />
        <h1 className="mt-2 font-display text-[40px]">{recipe.title}</h1>
        <p className="mt-2 text-[14px] text-muted">{recipeMeta(recipe, { protein: true })}</p>
        {recipe.description && <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{recipe.description}</p>}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button onClick={cook} loading={busy === "cook"} icon="flame" size="lg">
            Cooked it
          </Button>
          <Button onClick={() => setPlanOpen(true)} variant="secondary" icon="calendar" size="lg">
            {planned.length ? "Planned" : "Add to plan"}
          </Button>
          <Button onClick={addToShopping} loading={busy === "shop"} variant="secondary" icon="bag" size="lg" className="col-span-2">
            {onList ? "Add ingredients again" : "Add ingredients to shopping"}
          </Button>
        </div>
        {planned.length > 0 && (
          <p className="mt-2 text-center text-[12.5px] text-muted">
            On your plan for {planned.map((d) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long" })).join(" & ")}
          </p>
        )}

        {justCooked && (
          <div className="mt-5">
            <RatingPrompt recipeId={recipe.id} onDone={() => setJustCooked(false)} />
          </div>
        )}

        <section className="mt-9">
          <div className="flex items-center justify-between">
            <h2 className="text-[20px] font-semibold">Ingredients</h2>
            <div className="flex items-center gap-1 rounded-full bg-surface p-1 shadow-[inset_0_0_0_1px_var(--color-line)]">
              <button onClick={() => setServings((s) => Math.max(1, s - 1))} className="grid h-7 w-7 place-items-center rounded-full hover:bg-sand" aria-label="Fewer servings">
                −
              </button>
              <span className="min-w-[68px] text-center text-[13px] font-medium">{servings} serving{servings === 1 ? "" : "s"}</span>
              <button onClick={() => setServings((s) => Math.min(20, s + 1))} className="grid h-7 w-7 place-items-center rounded-full hover:bg-sand" aria-label="More servings">
                +
              </button>
            </div>
          </div>
          <p className="mt-1 text-[12.5px] text-muted">Based on what you usually buy. Tap to tick off what you have.</p>
          <div className="mt-2 divide-y divide-line">
            {scaled.map((i) => (
              <IngredientRow
                key={i.id}
                text={ingredientText(i.rawText, i.amount, i.unit)}
                amount={i.amountLabel}
                status={pantry[i.normalizedName]}
                checked={have.has(i.id)}
                onToggle={() =>
                  setHave((s) => {
                    const n = new Set(s);
                    if (n.has(i.id)) n.delete(i.id);
                    else n.add(i.id);
                    return n;
                  })
                }
              />
            ))}
          </div>
        </section>

        {recipe.steps.length > 0 && (
          <section className="mt-9">
            <h2 className="text-[20px] font-semibold">Method</h2>
            <ol className="mt-3 space-y-5">
              {recipe.steps.map((s, i) => (
                <li key={i} className="flex gap-4">
                  <span className="font-display text-[28px] leading-none text-terracotta">{i + 1}</span>
                  <p className="pt-1 text-[15.5px] leading-relaxed text-ink-2">{s}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-[20px] font-semibold">Notes</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== (recipe.notes ?? "") && saveNotes()}
            placeholder="Your tweaks, swaps, what to do differently…"
            rows={3}
            className="mt-3 w-full resize-none rounded-[16px] bg-surface px-4 py-3 text-[15px] shadow-[inset_0_0_0_1px_var(--color-line)] outline-none placeholder:text-faint focus:shadow-[inset_0_0_0_1.5px_var(--color-olive)]"
          />
          {ownFeedback.length > 0 && (
            <ul className="mt-3 space-y-2">
              {ownFeedback.map((f) => (
                <li key={f.id} className="rounded-[16px] bg-surface/60 px-4 py-3 text-[14px] shadow-[inset_0_0_0_1px_var(--color-line)]">
                  <div className="flex items-center justify-between text-[12px] text-muted">
                    <span>{f.reaction ? REACTION_LABEL[f.reaction] : "Note"}</span>
                    <span>{shortDate(f.createdAt)}</span>
                  </div>
                  {f.comment && <p className="mt-1 text-ink-2">“{f.comment}”</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10 rounded-[20px] bg-surface/60 p-4 shadow-[inset_0_0_0_1px_var(--color-line)]">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">History</h2>
          <dl className="mt-2 space-y-1.5 text-[14px]">
            <Row label="Cooked">{recipe.timesCooked ? `${recipe.timesCooked} time${recipe.timesCooked === 1 ? "" : "s"}` : "Not yet"}</Row>
            {recipe.lastCookedAt && <Row label="Last cooked">{`${shortDate(recipe.lastCookedAt)} (${relativeDays(recipe.lastCookedAt)})`}</Row>}
            {recipe.rating && <Row label="You rated it">{REACTION_LABEL[recipe.rating]}</Row>}
            {householdLine && <Row label="Household">{householdLine}</Row>}
            <Row label="Saved">{shortDate(recipe.createdAt)}</Row>
          </dl>
        </section>

        <section className="mt-6 pb-4">
          <div className="flex flex-wrap gap-1.5">
            {[recipe.cuisine, ...recipe.tags].filter(Boolean).map((t) => (
              <span key={t} className="rounded-full bg-sand px-2.5 py-1 text-[12px] font-medium text-ink-2">
                {t}
              </span>
            ))}
          </div>
          {(recipe.caloriesPerServing || recipe.proteinGrams) && (
            <p className="mt-3 text-[12.5px] text-muted">
              Per serving: {recipe.caloriesPerServing ?? "–"} kcal · {recipe.proteinGrams ?? "–"}g protein · {recipe.carbsGrams ?? "–"}g carbs · {recipe.fatGrams ?? "–"}g fat
              {recipe.nutritionIsEstimate ? " · estimated" : ""}
              {recipe.prepTimeMinutes != null && ` · prep ${minutesLabel(recipe.prepTimeMinutes)}`}
            </p>
          )}
        </section>
      </div>

      <BottomSheet open={planOpen} onClose={() => setPlanOpen(false)} title="Add to plan">
        <p className="-mt-1 mb-3 text-[14px] text-muted">Pick a night. Ingredients go straight onto your list.</p>
        <div className="grid grid-cols-2 gap-2">
          {next14.map((d) => {
            const date = new Date(d + "T12:00:00");
            const isPlanned = planned.includes(d);
            return (
              <button
                key={d}
                disabled={busy === "plan"}
                onClick={() => planOn(d)}
                className={`flex h-14 items-center justify-between rounded-[14px] px-4 text-left transition ${isPlanned ? "bg-olive-soft text-olive-deep" : "bg-surface shadow-soft hover:bg-white"}`}
              >
                <span>
                  <span className="block text-[14.5px] font-medium">{d === today ? "Tonight" : date.toLocaleDateString("en-GB", { weekday: "long" })}</span>
                  <span className="block text-[12px] text-muted">{date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                </span>
                {isPlanned && <Icon name="check" size={16} />}
              </button>
            );
          })}
        </div>
      </BottomSheet>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)}>
        <div className="space-y-1">
          {recipe.sourceUrl && (
            <a href={recipe.sourceUrl} target="_blank" rel="noreferrer noopener" className="flex h-12 items-center gap-3 rounded-[12px] px-2 text-[15px] hover:bg-sand">
              <Icon name="external" size={18} /> Open original
            </a>
          )}
          <Link href={`/add?edit=${recipe.id}`} className="flex h-12 items-center gap-3 rounded-[12px] px-2 text-[15px] hover:bg-sand">
            <Icon name="pencil" size={18} /> Edit recipe
          </Link>
          <Link href={`/cook?q=${encodeURIComponent(`similar to the ${recipe.title}`)}`} className="flex h-12 items-center gap-3 rounded-[12px] px-2 text-[15px] hover:bg-sand">
            <Icon name="search" size={18} /> Find similar recipes
          </Link>
          <button onClick={remove} className="flex h-12 w-full items-center gap-3 rounded-[12px] px-2 text-[15px] text-terracotta-deep hover:bg-terracotta-soft">
            <Icon name="trash" size={18} /> Delete recipe
          </button>
        </div>
      </BottomSheet>
    </article>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-ink-2">{children}</dd>
    </div>
  );
}

/** "2 tbsp soy sauce" → "soy sauce" when we render the (scaled) amount separately. */
function ingredientText(raw: string, amount: number | null, unit: string | null): string {
  if (amount == null) return raw;
  const stripped = raw
    .replace(/^\s*[\d½¼¾⅓⅔.,/\s-]+/, "")
    .replace(new RegExp(`^(${unit ?? "__none__"}s?|tbsps?|tsps?|tablespoons?|teaspoons?|grams?|g|kg|ml|l|cups?|cloves?|cans?|tins?|bunch(es)?|handfuls?|pinch(es)?|packs?|pieces?)\\.?\\s+(of\\s+)?`, "i"), "");
  return stripped || raw;
}
