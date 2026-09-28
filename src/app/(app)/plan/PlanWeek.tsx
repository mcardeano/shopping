"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { WeekView } from "@/server/services/plan";
import type { LibraryResult } from "@/server/services/recipes";
import { apiFetch } from "@/lib/api";
import { recipeMeta } from "@/lib/format";
import { MealPlanCard } from "@/components/MealPlanCard";
import { RecipeImage } from "@/components/RecipeImage";
import { BottomSheet, Button, EmptyState } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toaster";

const DAY = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function shift(week: string, days: number) {
  const d = new Date(week + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function PlanWeek({ plan, recipes, days, today, currentWeek, planItemsOnList }: WeekView & { currentWeek: string; planItemsOnList: number }) {
  const router = useRouter();
  const [sheet, setSheet] = useState(false);
  const [count, setCount] = useState(4);
  const [brief, setBrief] = useState(plan.brief ?? "");
  const [generating, setGenerating] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [pickDay, setPickDay] = useState<string | null>(null);
  const weekStart = plan.weekStart;
  const hasMeals = plan.items.length > 0;
  const isPastWeek = shift(weekStart, 6) < today;

  const title = weekStart === currentWeek ? "This week" : weekStart === shift(currentWeek, 7) ? "Next week" : weekStart === shift(currentWeek, -7) ? "Last week" : `Week of ${new Date(weekStart + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;

  async function generate() {
    setGenerating(true);
    try {
      const res = await apiFetch<{ planned: number }>("/api/plan/generate", { body: { weekStart, count, brief } });
      setSheet(false);
      toast(res.planned ? `Planned ${res.planned} dinner${res.planned === 1 ? "" : "s"}. Ingredients are on your list.` : "No free nights left to plan.", {
        action: res.planned ? { label: "View list", onClick: () => router.push("/shopping") } : undefined,
      });
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't plan the week.", { tone: "error" });
    } finally {
      setGenerating(false);
    }
  }

  async function itemAction(id: string, fn: () => Promise<unknown>, message?: string) {
    setBusyItem(id);
    try {
      await fn();
      if (message) toast(message);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong.", { tone: "error" });
    } finally {
      setBusyItem(null);
    }
  }

  return (
    <div className="animate-fade">
      <header className="px-5 pt-[max(env(safe-area-inset-top),24px)]">
        <div className="flex items-end justify-between">
          <h1 className="font-display text-[46px]">{title}</h1>
          <div className="mb-2 flex gap-1">
            <Link href={`/plan?week=${shift(weekStart, -7)}`} className="grid h-9 w-9 place-items-center rounded-full bg-surface shadow-soft" aria-label="Previous week" scroll={false}>
              <Icon name="chevronLeft" size={18} />
            </Link>
            <Link href={`/plan?week=${shift(weekStart, 7)}`} className="grid h-9 w-9 place-items-center rounded-full bg-surface shadow-soft" aria-label="Next week" scroll={false}>
              <Icon name="chevronRight" size={18} />
            </Link>
          </div>
        </div>
        {!isPastWeek && (
          <div className="mt-4 flex gap-2">
            <Button onClick={() => setSheet(true)} icon="sparkle" size="lg" className="flex-1">
              Plan my week
            </Button>
          </div>
        )}
        {hasMeals && planItemsOnList > 0 && (
          <Link href="/shopping" className="mt-3 flex items-center justify-between rounded-[16px] bg-olive-soft px-4 py-3 text-[14px] text-olive-deep">
            <span>
              <strong className="font-semibold">{planItemsOnList} ingredients</strong> for your plan are on the shopping list
            </span>
            <Icon name="chevronRight" size={16} />
          </Link>
        )}
      </header>

      {!hasMeals && !isPastWeek && (
        <div className="mt-6">
          <EmptyState title="No meal plan yet" body="Tell me how many dinners you want this week — I'll balance favourites, new things and what's already in your kitchen." art="calendar">
            <Button onClick={() => setSheet(true)} icon="sparkle">
              Plan my week
            </Button>
          </EmptyState>
        </div>
      )}

      <div className="mt-4 divide-y divide-line px-5">
        {days.map((d, i) => {
          const item = plan.items.find((x) => x.day === d);
          const recipe = item ? recipes[item.recipeId] : undefined;
          return (
            <MealPlanCard
              key={d}
              dayLabel={DAY[i]!}
              dateLabel={String(Number(d.slice(8, 10)))}
              isToday={d === today}
              isPast={d < today}
              item={item}
              recipe={recipe}
              busy={busyItem === item?.id}
              onAdd={() => setPickDay(d)}
              onLock={() => item && itemAction(item.id, () => apiFetch(`/api/plan/items/${item.id}`, { method: "PATCH", body: { locked: !item.locked } }))}
              onSwap={() => item && itemAction(item.id, () => apiFetch(`/api/plan/items/${item.id}/swap`, { body: { weekStart } }), "Swapped. Your list is updated.")}
              onRemove={() => item && itemAction(item.id, () => apiFetch(`/api/plan/items/${item.id}`, { method: "DELETE" }), "Removed. Things you added by hand stay on your list.")}
            />
          );
        })}
      </div>

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Plan my week">
        <p className="text-[14.5px] font-medium">How many dinners?</p>
        <div className="mt-2.5 grid grid-cols-4 gap-2">
          {[3, 4, 5, 7].map((n) => (
            <button key={n} onClick={() => setCount(n)} className={`h-14 rounded-[14px] font-display text-[26px] transition ${count === n ? "bg-ink text-bg" : "bg-surface shadow-soft"}`}>
              {n}
            </button>
          ))}
        </div>
        <p className="mt-5 text-[14.5px] font-medium">Anything to consider?</p>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={3}
          placeholder="Quick meals, mostly healthy, use the chicken I already have. Make Friday more indulgent."
          className="mt-2 w-full resize-none rounded-[16px] bg-surface px-4 py-3 text-[15px] shadow-[inset_0_0_0_1px_var(--color-line)] outline-none placeholder:text-faint focus:shadow-[inset_0_0_0_1.5px_var(--color-olive)]"
        />
        <div className="no-scrollbar -mx-5 mt-2 flex gap-1.5 overflow-x-auto px-5">
          {["Under 30 minutes", "Reuse ingredients", "Make Friday indulgent", "Only Monday to Thursday", "Salmon, chicken and beef"].map((s) => (
            <button key={s} onClick={() => setBrief((b) => (b ? `${b.replace(/[.\s]+$/, "")}. ${s}` : s))} className="h-8 shrink-0 rounded-full bg-surface px-3 text-[12.5px] text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]">
              + {s}
            </button>
          ))}
        </div>
        {hasMeals && <p className="mt-3 text-[12.5px] text-muted">Locked meals (<Icon name="lock" size={11} className="inline" />) stay put; the rest is replanned.</p>}
        <Button onClick={generate} loading={generating} size="lg" className="mt-5 w-full">
          {hasMeals ? "Regenerate" : "Generate"}
        </Button>
      </BottomSheet>

      <RecipePicker day={pickDay} onClose={() => setPickDay(null)} onPicked={() => router.refresh()} />
    </div>
  );
}

function RecipePicker({ day, onClose, onPicked }: { day: string | null; onClose: () => void; onPicked: () => void }) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<LibraryResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!day) return;
    const t = setTimeout(() => {
      apiFetch<LibraryResult>(`/api/recipes?q=${encodeURIComponent(q)}`).then(setResult).catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [q, day]);

  const label = day ? new Date(day + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long" }) : "";
  async function pick(recipeId: string) {
    if (!day) return;
    setBusy(recipeId);
    try {
      await apiFetch("/api/plan/items", { body: { day, recipeId } });
      toast(`Added to ${label}.`);
      onPicked();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't add that.", { tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <BottomSheet open={!!day} onClose={onClose} title={`Dinner on ${label}`}>
      <div className="flex items-center gap-2 rounded-[14px] bg-surface px-3.5 shadow-[inset_0_0_0_1px_var(--color-line)]">
        <Icon name="search" size={17} className="text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your recipes" className="h-11 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint" />
      </div>
      <ul className="mt-3 divide-y divide-line">
        {(result?.recipes ?? []).slice(0, 30).map((r) => (
          <li key={r.id}>
            <button onClick={() => pick(r.id)} disabled={!!busy} className="flex w-full items-center gap-3 py-2.5 text-left">
              <RecipeImage id={r.id} title={r.title} imageUrl={r.imageUrl} cuisine={r.cuisine} ingredients={r.ingredients.map((i) => i.normalizedName)} aspect={1} className="w-14 shrink-0" rounded="rounded-[12px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{r.title}</span>
                <span className="block text-[12.5px] text-muted">{recipeMeta(r)}</span>
              </span>
              {busy === r.id ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-transparent" /> : <Icon name="plus" size={18} className="text-faint" />}
            </button>
          </li>
        ))}
        {!result && Array.from({ length: 4 }).map((_, i) => <li key={i} className="skeleton my-2 h-14 rounded-[12px]" />)}
      </ul>
    </BottomSheet>
  );
}
