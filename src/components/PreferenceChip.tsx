"use client";

import { useState } from "react";
import type { TastePreference } from "@/core/domain/types";
import { Icon } from "./Icon";

/**
 * A taste preference. Explicit ones are filled; inferred ones are outlined.
 * Tap to reveal confirm / remove, so the resting state stays calm.
 */
export function PreferenceChip({ pref, onConfirm, onRemove, tone = "like" }: { pref: TastePreference; onConfirm?: () => void; onRemove?: () => void; tone?: "like" | "avoid" | "habit" }) {
  const [open, setOpen] = useState(false);
  const explicit = pref.source === "explicit" || pref.status === "confirmed";
  const colors =
    tone === "avoid"
      ? explicit
        ? "bg-terracotta-soft text-terracotta-deep"
        : "bg-surface text-terracotta-deep shadow-[inset_0_0_0_1px_rgb(201_134_107/0.4)]"
      : explicit
        ? "bg-olive-soft text-olive-deep"
        : "bg-surface text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]";
  const why = pref.originalText ? `You said “${pref.originalText}”` : explicit ? "You told me" : `Learned from ${pref.evidenceCount} recipe${pref.evidenceCount === 1 ? "" : "s"} you saved or cooked`;
  return (
    <span className={`inline-flex h-9 items-center rounded-full text-[13.5px] font-medium transition ${colors} ${open ? "pr-1" : ""}`}>
      <button onClick={() => setOpen((o) => !o)} className="h-full px-3.5" title={why} aria-expanded={open}>
        {pref.label}
      </button>
      {open && (
        <span className="flex animate-fade items-center">
          {!explicit && onConfirm && (
            <button
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
              className="grid h-7 w-7 place-items-center rounded-full bg-olive text-white"
              aria-label={`Confirm ${pref.label}`}
            >
              <Icon name="check" size={14} strokeWidth={2.2} />
            </button>
          )}
          {onRemove && (
            <button onClick={onRemove} className="ml-1 grid h-7 w-7 place-items-center rounded-full bg-sand text-muted hover:text-ink" aria-label={`Remove ${pref.label}`}>
              <Icon name="close" size={13} />
            </button>
          )}
        </span>
      )}
    </span>
  );
}
