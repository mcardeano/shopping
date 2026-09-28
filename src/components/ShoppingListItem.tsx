"use client";

import type { ShoppingListItem as Item } from "@/core/domain/types";
import { Icon } from "./Icon";

export function ShoppingListItem({ item, pending, onToggle, onOpen }: { item: Item; pending?: boolean; onToggle: () => void; onOpen: () => void }) {
  return (
    <div className={`flex items-center gap-3 py-2.5 transition ${pending ? "opacity-60" : ""}`}>
      <button
        onClick={onToggle}
        className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full transition active:scale-90 ${item.checked ? "bg-olive text-white" : "shadow-[inset_0_0_0_1.6px_var(--color-sand-2)] hover:shadow-[inset_0_0_0_1.6px_var(--color-olive)]"}`}
        aria-label={item.checked ? `Restore ${item.displayName}` : `Check off ${item.displayName}`}
      >
        {item.checked && <Icon name="check" size={14} strokeWidth={2.4} />}
      </button>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-baseline justify-between gap-3 text-left">
        <span className="min-w-0">
          <span className={`block truncate text-[15.5px] leading-snug ${item.checked ? "text-muted line-through decoration-ink/20" : "text-ink"}`}>
            {item.displayName}
            {item.note && <span className="text-[13px] text-muted"> · {item.note}</span>}
          </span>
          <span className="block truncate text-[12px] text-faint">{item.sourceLabel}</span>
        </span>
        {item.quantityLabel && item.quantityLabel !== "1" && <span className="shrink-0 text-[13px] tabular-nums text-muted">{/^[\d.¼½¾]+$/.test(item.quantityLabel) ? `×${item.quantityLabel}` : item.quantityLabel}</span>}
      </button>
    </div>
  );
}
