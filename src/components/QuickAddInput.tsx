"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseShoppingText } from "@/core/services/shoppingIntent";
import { apiFetch } from "@/lib/api";
import type { QuickAddResult } from "@/server/services/shopping";
import { Icon } from "./Icon";
import { toast } from "./Toaster";

type Props = {
  placeholder?: string;
  variant?: "card" | "inline";
  /** Called immediately with the locally-parsed items, before the server answers. */
  onOptimistic?: (names: { name: string; note?: string; quantity?: number }[]) => void;
  onSettled?: () => void;
  autoFocus?: boolean;
};

/**
 * "What do you need?" — the fastest path from a thought to the shopping list.
 * Parses locally for instant feedback, then the server normalises, merges and categorises.
 */
export function QuickAddInput({ placeholder = "Milk, bananas, toilet paper…", variant = "card", onOptimistic, onSettled, autoFocus }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    const actions = parseShoppingText(value);
    const items = actions.flatMap((a) => (a.type === "add_items" ? a.items : []));
    if (items.length) onOptimistic?.(items.map((i) => ({ name: i.name, note: i.note, quantity: i.quantity })));
    setText("");
    setBusy(true);
    try {
      const res = await apiFetch<QuickAddResult & { createdIds: string[] }>("/api/shopping/quick-add", { body: { text: value } });
      if (res.findRecipesUsing?.length) {
        toast(res.message || "Added.");
        router.push(`/cook?useUp=${encodeURIComponent(res.findRecipesUsing.join(", "))}`);
        return;
      }
      if (res.showList) {
        router.push("/shopping");
        return;
      }
      toast(res.message || "Added.", {
        action: res.createdIds.length
          ? {
              label: "Undo",
              onClick: async () => {
                await Promise.all(res.createdIds.map((id) => apiFetch(`/api/shopping/items/${id}`, { method: "DELETE" })));
                startTransition(() => router.refresh());
              },
            }
          : variant === "card"
            ? { label: "View list", onClick: () => router.push("/shopping") }
            : undefined,
      });
      startTransition(() => router.refresh());
    } catch (err) {
      setText(value);
      toast(err instanceof Error ? err.message : "Couldn't add that.", { tone: "error" });
    } finally {
      setBusy(false);
      onSettled?.();
      inputRef.current?.focus();
    }
  }

  const shell =
    variant === "card"
      ? "flex items-center gap-2 rounded-[18px] bg-surface p-1.5 pl-4 shadow-soft"
      : "flex items-center gap-2 rounded-[16px] bg-surface p-1.5 pl-4 shadow-[inset_0_0_0_1px_var(--color-line)]";

  return (
    <form onSubmit={submit} className={shell}>
      <Icon name="plus" size={18} className="shrink-0 text-olive" />
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        enterKeyHint="done"
        aria-label="Add to shopping list"
        className="h-10 min-w-0 flex-1 bg-transparent text-[15.5px] outline-none placeholder:text-faint"
      />
      <button
        type="submit"
        disabled={!text.trim() || busy}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-ink text-bg transition disabled:bg-sand disabled:text-faint"
        aria-label="Add"
      >
        {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name="arrowUp" size={18} />}
      </button>
    </form>
  );
}
