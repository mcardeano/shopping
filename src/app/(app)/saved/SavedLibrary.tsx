"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LibraryResult } from "@/server/services/recipes";
import { RecipeGrid } from "@/components/RecipeCard";
import { Chip, EmptyState } from "@/components/ui";
import { Icon } from "@/components/Icon";

const CHIPS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "favorites", label: "Favourites" },
  { id: "cooked", label: "Cooked" },
  { id: "not-cooked", label: "Not cooked" },
  { id: "quick", label: "Quick" },
  { id: "asian", label: "Asian" },
  { id: "mediterranean", label: "Mediterranean" },
  { id: "middle-eastern", label: "Middle Eastern" },
  { id: "high-protein", label: "High protein" },
  { id: "kids-liked", label: "Kids liked" },
  { id: "instagram", label: "From Instagram" },
];

const EXAMPLES = ["salmon under 30 minutes", "things I saved but haven't cooked", "recipes my kids liked", "similar to the Korean beef bowl", "comforting but not heavy"];

export function SavedLibrary({ initialQuery, initialChip, result }: { initialQuery: string; initialChip: string; result: LibraryResult }) {
  const [q, setQ] = useState(initialQuery);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const first = useRef(true);

  const navigate = (query: string, chip: string) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (chip !== "all") params.set("chip", chip);
    startTransition(() => router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false }));
  };

  // Debounced search-as-you-type.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => navigate(q, initialChip), 380);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const total = result.recipes.length;
  return (
    <div className="animate-fade">
      <header className="flex items-end justify-between px-5 pt-[max(env(safe-area-inset-top),24px)]">
        <h1 className="font-display text-[46px]">Saved</h1>
        <Link href="/add" className="mb-2 inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-ink px-3.5 text-[14px] font-medium text-bg">
          <Icon name="plus" size={16} /> Add
        </Link>
      </header>

      <div className="sticky top-0 z-20 bg-bg/90 pb-3 pt-3 backdrop-blur-xl">
        <form
          className="mx-5 flex items-center gap-2.5 rounded-[16px] bg-surface px-4 shadow-soft"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(q, initialChip);
          }}
        >
          <Icon name="search" size={18} className="text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your recipes"
            aria-label="Search your recipes"
            enterKeyHint="search"
            className="h-12 min-w-0 flex-1 bg-transparent text-[15.5px] outline-none placeholder:text-faint"
          />
          {pending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-transparent" />
          ) : (
            q && (
              <button type="button" onClick={() => setQ("")} className="text-faint hover:text-ink" aria-label="Clear search">
                <Icon name="close" size={17} />
              </button>
            )
          )}
        </form>
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-5">
          {CHIPS.map((c) => (
            <Chip key={c.id} active={initialChip === c.id} onClick={() => navigate(q, c.id)}>
              {c.label}
            </Chip>
          ))}
        </div>
      </div>

      {result.understood.length > 0 && (
        <div className="mx-5 mb-4 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
          <span>Showing</span>
          {result.understood.map((u) => (
            <span key={u} className="rounded-full bg-olive-soft px-2 py-0.5 font-medium text-olive-deep">
              {u}
            </span>
          ))}
        </div>
      )}

      <div className={`transition-opacity ${pending ? "opacity-60" : ""}`}>
        {total > 0 ? (
          <>
            {(q || initialChip !== "all") && <p className="mb-3 px-5 text-[13px] text-muted">{total === 1 ? "1 recipe" : `${total} recipes`}</p>}
            <RecipeGrid recipes={result.recipes} />
          </>
        ) : q || initialChip !== "all" ? (
          <EmptyState title="Nothing matches" body="Try fewer words, or ask the way you'd ask a friend." art="search">
            {EXAMPLES.slice(0, 3).map((e) => (
              <Chip key={e} onClick={() => setQ(e)}>
                {e}
              </Chip>
            ))}
          </EmptyState>
        ) : (
          <EmptyState title="No saved recipes yet" body="Save a recipe you found online or upload a screenshot — we'll do the tidying up.">
            <Link href="/add?method=link" className="inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-ink px-4 text-[14px] font-medium text-bg">
              <Icon name="link" size={16} /> Paste a link
            </Link>
            <Link href="/add?method=image" className="inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-sand px-4 text-[14px] font-medium">
              <Icon name="image" size={16} /> Upload screenshot
            </Link>
          </EmptyState>
        )}
      </div>

      {!q && initialChip === "all" && total > 0 && (
        <div className="mx-5 mt-10 rounded-[20px] bg-surface/60 p-4 text-[13px] text-muted shadow-[inset_0_0_0_1px_var(--color-line)]">
          <p className="font-medium text-ink-2">Search the way you think</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => setQ(e)} className="rounded-full bg-surface px-2.5 py-1 text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-white">
                “{e}”
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
