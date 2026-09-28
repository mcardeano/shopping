"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { looksLikeShoppingCommand } from "@/core/services/shoppingIntent";
import { apiFetch } from "@/lib/api";
import type { QuickAddResult } from "@/server/services/shopping";
import { Icon } from "./Icon";
import { toast } from "./Toaster";

const PROMPTS: { label: string; href: string }[] = [
  { label: "20 min", href: "/cook?max=20" },
  { label: "Use what I have", href: "/cook?q=use%20what%20I%20already%20have" },
  { label: "High protein", href: "/cook?q=high%20protein" },
  { label: "Kids", href: "/cook?q=something%20the%20kids%20will%20eat" },
  { label: "Something new", href: "/cook?q=something%20new%20I%20haven%27t%20cooked" },
];

/**
 * One box for anything about dinner. Questions go to "What should I cook?";
 * shopping statements ("we're out of olive oil") go straight to the list.
 */
export function AIInput({ placeholder = "Ask anything about dinner…", showPrompts = true, initial = "" }: { placeholder?: string; showPrompts?: boolean; initial?: string }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q) {
      router.push("/cook");
      return;
    }
    if (looksLikeShoppingCommand(q)) {
      setBusy(true);
      try {
        const res = await apiFetch<QuickAddResult>("/api/shopping/quick-add", { body: { text: q } });
        setText("");
        if (res.findRecipesUsing?.length) router.push(`/cook?useUp=${encodeURIComponent(res.findRecipesUsing.join(", "))}`);
        else if (res.showList) router.push("/shopping");
        else {
          toast(res.message, { action: { label: "View list", onClick: () => router.push("/shopping") } });
          router.refresh();
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : "Couldn't do that.", { tone: "error" });
      } finally {
        setBusy(false);
      }
      return;
    }
    router.push(`/cook?q=${encodeURIComponent(q)}`);
  }

  return (
    <div>
      <form onSubmit={submit} className="flex items-center gap-2 rounded-[20px] bg-surface p-2 pl-4.5 shadow-lift">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label="Ask about dinner"
          enterKeyHint="go"
          className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
        />
        <button type="submit" className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-olive text-white transition hover:bg-olive-deep active:scale-95" aria-label="Ask">
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name="arrowRight" size={19} />}
        </button>
      </form>
      {showPrompts && (
        <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
          {PROMPTS.map((p) => (
            <button
              key={p.label}
              onClick={() => router.push(p.href)}
              className="h-9 shrink-0 rounded-full bg-surface/70 px-3.5 text-[13.5px] font-medium text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] transition hover:bg-surface"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
