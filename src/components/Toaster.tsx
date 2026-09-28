"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type Toast = { id: number; message: string; action?: { label: string; onClick: () => void }; tone?: "default" | "error" };

const listeners = new Set<(t: Toast) => void>();
let nextId = 1;

export function toast(message: string, opts: { action?: Toast["action"]; tone?: Toast["tone"] } = {}) {
  const t = { id: nextId++, message, ...opts };
  listeners.forEach((l) => l(t));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (t: Toast) => {
      setItems((xs) => [...xs.slice(-2), t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), t.action ? 5500 : 3200);
    };
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[92px] z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex w-full max-w-[440px] animate-rise items-center gap-3 rounded-2xl px-4 py-3 text-[14px] shadow-lift ${t.tone === "error" ? "bg-terracotta-deep text-white" : "bg-ink text-bg"}`}
        >
          <Icon name={t.tone === "error" ? "close" : "check"} size={16} className="shrink-0 opacity-80" />
          <span className="flex-1 leading-snug">{t.message}</span>
          {t.action && (
            <button
              className="shrink-0 font-semibold text-[#E8C5B5]"
              onClick={() => {
                t.action!.onClick();
                setItems((xs) => xs.filter((x) => x.id !== t.id));
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
