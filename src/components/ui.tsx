"use client";

import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type ButtonVariant = "primary" | "secondary" | "ghost" | "accent" | "danger";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ink text-bg hover:bg-ink-2 active:scale-[0.98]",
  accent: "bg-olive text-white hover:bg-olive-deep active:scale-[0.98]",
  secondary: "bg-surface text-ink shadow-soft hover:bg-white active:scale-[0.98]",
  ghost: "text-ink hover:bg-sand",
  danger: "text-terracotta-deep hover:bg-terracotta-soft",
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  loading,
  className = "",
  children,
  ...rest
}: { variant?: ButtonVariant; size?: "sm" | "md" | "lg"; icon?: IconName; loading?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizes = { sm: "h-9 px-3.5 text-[13px] gap-1.5", md: "h-11 px-4.5 text-[15px] gap-2", lg: "h-13 px-6 text-[16px] gap-2" };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center rounded-[14px] font-medium transition duration-150 disabled:opacity-50 disabled:pointer-events-none ${VARIANTS[variant]} ${sizes[size]} ${className}`}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} /> : null}
      {children}
    </button>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent opacity-70" style={{ width: size, height: size }} aria-label="Loading" />;
}

export function Chip({ active, onClick, children, icon, className = "" }: { active?: boolean; onClick?: () => void; children: ReactNode; icon?: IconName; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium transition ${
        active ? "bg-ink text-bg" : "bg-surface text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-white"
      } ${className}`}
    >
      {icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

export function SectionHeader({ title, action, subtitle }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4 px-5">
      <div>
        <h2 className="text-[19px] font-semibold tracking-[-0.01em]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13.5px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 animate-fade bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="absolute bottom-0 w-full max-w-[480px] animate-sheet rounded-t-[28px] bg-bg pb-safe shadow-lift">
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-ink/15" />
        {title && (
          <div className="flex items-center justify-between px-5 pb-1 pt-4">
            <h3 className="font-display text-[28px]">{title}</h3>
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-sand text-muted hover:text-ink" aria-label="Close">
              <Icon name="close" size={18} />
            </button>
          </div>
        )}
        <div className="max-h-[78dvh] overflow-y-auto px-5 pb-6 pt-3">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, body, children, art = "bookmark" }: { title: string; body: string; children?: ReactNode; art?: IconName }) {
  return (
    <div className="mx-5 flex flex-col items-center rounded-[24px] bg-surface/70 px-6 py-10 text-center shadow-[inset_0_0_0_1px_var(--color-line)]">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-olive-soft text-olive">
        <Icon name={art} size={24} />
      </div>
      <h3 className="font-display text-[28px]">{title}</h3>
      <p className="mt-2 max-w-[280px] text-[14.5px] leading-relaxed text-muted">{body}</p>
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
