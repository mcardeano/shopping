"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Reaction } from "@/core/domain/schemas";
import { apiFetch } from "@/lib/api";
import { Icon } from "./Icon";
import { toast } from "./Toaster";

const OPTIONS: { value: Reaction; label: string }[] = [
  { value: "loved", label: "Loved it" },
  { value: "good", label: "Good" },
  { value: "not_for_me", label: "Not for me" },
];

/** "How was it?" — optional, one tap, with an optional free-text follow-up. Never forced. */
export function RatingPrompt({ recipeId, title, onDone, compact }: { recipeId: string; title?: string; onDone?: () => void; compact?: boolean }) {
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [comment, setComment] = useState("");
  const [stage, setStage] = useState<"ask" | "comment" | "done" | "hidden">("ask");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function send(r: Reaction | null, text: string) {
    setBusy(true);
    try {
      await apiFetch(`/api/recipes/${recipeId}/feedback`, { body: { reaction: r ?? undefined, comment: text.trim() || undefined } });
      setStage("done");
      toast(text.trim() ? "Thanks — noted what you'd change." : "Thanks — that helps us learn your taste.");
      onDone?.();
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save that.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (stage === "hidden") return null;
  if (stage === "done")
    return (
      <div className="flex animate-fade items-center gap-2 rounded-[20px] bg-olive-soft px-4 py-3.5 text-[14px] text-olive-deep">
        <Icon name="check" size={16} /> Saved to your taste memory.
      </div>
    );

  return (
    <div className={`animate-rise rounded-[22px] bg-surface p-4.5 shadow-soft ${compact ? "" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12.5px] font-medium uppercase tracking-[0.06em] text-muted">After cooking</p>
          <h3 className="mt-0.5 text-[17px] font-semibold leading-snug">How was {title ? <span className="font-display text-[21px] font-normal italic">{title}</span> : "it"}?</h3>
        </div>
        <button onClick={() => setStage("hidden")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-faint hover:bg-sand hover:text-ink" aria-label="Not now">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="mt-3.5 grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            disabled={busy}
            onClick={() => {
              setReaction(o.value);
              setStage("comment");
            }}
            className={`h-11 rounded-[14px] text-[14px] font-medium transition ${reaction === o.value ? "bg-ink text-bg" : "bg-sand text-ink hover:bg-sand-2"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {stage === "comment" && (
        <div className="mt-3 animate-fade">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Anything you'd change? e.g. “less tahini”, “kids loved it”"
            rows={2}
            className="w-full resize-none rounded-[14px] bg-bg px-3.5 py-3 text-[14.5px] outline-none placeholder:text-faint focus:shadow-[inset_0_0_0_1.5px_var(--color-olive)]"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => send(reaction, "")} disabled={busy} className="h-10 rounded-[12px] px-3.5 text-[14px] text-muted hover:text-ink">
              Skip
            </button>
            <button onClick={() => send(reaction, comment)} disabled={busy} className="h-10 rounded-[12px] bg-ink px-4 text-[14px] font-medium text-bg">
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
