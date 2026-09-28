"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RecommendationResult } from "@/server/services/recommend";
import { apiFetch } from "@/lib/api";
import { RecommendationCard } from "@/components/RecommendationCard";
import { Chip } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toaster";

type Result = { results: RecommendationResult[]; understood: string[] };

const MOODS = ["Anything", "Fresh", "Comforting", "Asian", "Mediterranean", "Healthy", "Indulgent"];
const TIMES: { label: string; value?: number }[] = [{ label: "15 min", value: 15 }, { label: "30 min", value: 30 }, { label: "45 min", value: 45 }, { label: "No limit" }];

export function CookAssistant({ initial, initialQuery, initialMax, initialMood, initialUseUp }: { initial: Result; initialQuery: string; initialMax?: number; initialMood?: string; initialUseUp: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [mood, setMood] = useState(initialMood ?? "Anything");
  const [max, setMax] = useState<number | undefined>(initialMax);
  const [useUp, setUseUp] = useState(initialUseUp);
  const [showUseUp, setShowUseUp] = useState(!!initialUseUp);
  const [data, setData] = useState<Result>(initial);
  const [seen, setSeen] = useState<string[]>(initial.results.map((r) => r.recipe.id));
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  async function load(next: { query?: string; mood?: string; max?: number | null; useUp?: string; more?: boolean } = {}) {
    const q = next.query ?? query;
    const m = next.mood ?? mood;
    const mx = next.max === null ? undefined : (next.max ?? max);
    const u = next.useUp ?? useUp;
    const id = ++reqId.current;
    setLoading(true);
    try {
      const res = await apiFetch<Result>("/api/recommendations", {
        body: { query: q, mood: m === "Anything" ? undefined : m, maxMinutes: mx, useUp: u || undefined, exclude: next.more ? seen : [], limit: 3 },
      });
      if (id !== reqId.current) return;
      setData(res);
      setSeen((s) => (next.more ? [...s, ...res.results.map((r) => r.recipe.id)] : res.results.map((r) => r.recipe.id)));
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (m !== "Anything") params.set("mood", m);
      if (mx) params.set("max", String(mx));
      if (u) params.set("useUp", u);
      window.history.replaceState(null, "", `/cook${params.size ? `?${params}` : ""}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't get ideas.", { tone: "error" });
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }

  async function notTonight(recipeId: string) {
    setData((d) => ({ ...d, results: d.results.filter((r) => r.recipe.id !== recipeId) }));
    try {
      await apiFetch("/api/recommendations/reject", { body: { recipeId } });
      const res = await apiFetch<Result>("/api/recommendations", {
        body: { query, mood: mood === "Anything" ? undefined : mood, maxMinutes: max, useUp: useUp || undefined, exclude: [...seen, recipeId], limit: 1 },
      });
      setSeen((s) => [...s, ...res.results.map((r) => r.recipe.id)]);
      setData((d) => ({ ...d, results: [...d.results.filter((r) => r.recipe.id !== recipeId), ...res.results] }));
      toast("Got it — we'll suggest it less.");
    } catch {
      /* the card is already gone; nothing else to do */
    }
  }

  async function planTonight(recipeId: string) {
    const today = new Date();
    const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    try {
      await apiFetch("/api/plan/items", { body: { day, recipeId } });
      toast("On tonight's plan. Missing ingredients are on your list.", { action: { label: "View list", onClick: () => router.push("/shopping") } });
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't plan that.", { tone: "error" });
    }
  }

  return (
    <div className="animate-fade pb-6">
      <header className="flex items-center px-3 pt-[max(env(safe-area-inset-top),12px)]">
        <button onClick={() => router.back()} className="grid h-10 w-10 place-items-center rounded-full hover:bg-sand" aria-label="Back">
          <Icon name="chevronLeft" size={22} />
        </button>
      </header>
      <section className="px-5">
        <h1 className="font-display text-[42px]">What should I cook?</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          className="mt-5 flex items-center gap-2 rounded-[20px] bg-surface p-2 pl-4.5 shadow-lift"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Something Asian with salmon, under 30 minutes"
            aria-label="Describe what you feel like"
            className="h-11 min-w-0 flex-1 bg-transparent text-[15.5px] outline-none placeholder:text-faint"
          />
          <button type="submit" className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-olive text-white" aria-label="Get ideas">
            {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name="arrowRight" size={19} />}
          </button>
        </form>
      </section>

      <section className="mt-5 space-y-2.5">
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5">
          {MOODS.map((m) => (
            <Chip
              key={m}
              active={mood === m}
              onClick={() => {
                setMood(m);
                load({ mood: m });
              }}
            >
              {m}
            </Chip>
          ))}
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5">
          {TIMES.map((t) => (
            <Chip
              key={t.label}
              icon={t.value ? "clock" : undefined}
              active={max === t.value}
              onClick={() => {
                setMax(t.value);
                load({ max: t.value ?? null });
              }}
            >
              {t.label}
            </Chip>
          ))}
          <Chip icon="leaf" active={showUseUp} onClick={() => setShowUseUp((s) => !s)}>
            Use up…
          </Chip>
        </div>
        {showUseUp && (
          <form
            className="mx-5 flex animate-fade items-center gap-2 rounded-[16px] bg-surface px-4 shadow-[inset_0_0_0_1px_var(--color-line)]"
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
          >
            <input
              autoFocus
              value={useUp}
              onChange={(e) => setUseUp(e.target.value)}
              onBlur={() => useUp !== initialUseUp && load()}
              placeholder="salmon, courgettes and half an avocado"
              aria-label="Ingredients to use up"
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
            />
          </form>
        )}
      </section>

      {data.understood.length > 0 && (
        <div className="mx-5 mt-4 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
          <span>Looking for</span>
          {data.understood.map((u) => (
            <span key={u} className="rounded-full bg-olive-soft px-2 py-0.5 font-medium text-olive-deep">
              {u}
            </span>
          ))}
        </div>
      )}

      <section className={`mt-6 space-y-4 px-5 transition-opacity ${loading ? "opacity-50" : ""}`}>
        {data.results.map((r) => (
          <RecommendationCard key={r.recipe.id} recipe={r.recipe} reason={r.reason} onNotInterested={() => notTonight(r.recipe.id)} onPlan={() => planTonight(r.recipe.id)} />
        ))}
        {!loading && data.results.length === 0 && (
          <div className="rounded-[22px] bg-surface p-6 text-center shadow-soft">
            <p className="font-display text-[26px]">Nothing fits all of that</p>
            <p className="mt-2 text-[14px] text-muted">Try loosening the time limit, or save a few more recipes like this.</p>
          </div>
        )}
      </section>

      {data.results.length > 0 && (
        <div className="mt-5 flex justify-center">
          <button onClick={() => load({ more: true })} className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14.5px] font-medium text-ink-2 hover:bg-sand">
            <Icon name="refresh" size={17} /> Show me three others
          </button>
        </div>
      )}
    </div>
  );
}
