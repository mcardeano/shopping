"use client";

import type { PantryStatus } from "@/core/domain/types";
import { Icon } from "./Icon";

const STATUS_LABEL: Record<PantryStatus, string> = {
  probably_have: "Probably have",
  check_at_home: "Check at home",
  need_to_buy: "Need to buy",
};

/** An ingredient line with its pantry estimate. Tapping toggles "have it" for this cook. */
export function IngredientRow({ text, amount, status, checked, onToggle }: { text: string; amount?: string | null; status?: PantryStatus; checked: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 py-3 text-left" aria-pressed={checked}>
      <span className={`mt-[1px] grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full transition ${checked ? "bg-olive text-white" : "shadow-[inset_0_0_0_1.5px_var(--color-sand-2)]"}`}>
        {checked && <Icon name="check" size={13} strokeWidth={2.4} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] leading-snug ${checked ? "text-muted" : "text-ink"}`}>
          {amount && <span className="font-semibold">{amount} </span>}
          {text}
        </span>
      </span>
      {status && (
        <span
          className={`mt-[2px] shrink-0 text-[12px] font-medium ${status === "probably_have" ? "text-olive" : status === "check_at_home" ? "text-[#A08A5C]" : "text-terracotta-deep"}`}
        >
          {STATUS_LABEL[status]}
        </span>
      )}
    </button>
  );
}
