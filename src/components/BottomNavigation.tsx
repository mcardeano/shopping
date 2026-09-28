"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

const TABS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/", label: "Home", icon: "home", match: (p) => p === "/" || p.startsWith("/cook") },
  { href: "/saved", label: "Saved", icon: "bookmark", match: (p) => p.startsWith("/saved") || p.startsWith("/recipes") || p.startsWith("/add") },
  { href: "/plan", label: "Plan", icon: "calendar", match: (p) => p.startsWith("/plan") },
  { href: "/shopping", label: "Shopping", icon: "bag", match: (p) => p.startsWith("/shopping") },
];

export function BottomNavigation({ shoppingCount }: { shoppingCount?: number }) {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 border-t border-line bg-bg pb-safe" aria-label="Main">
      <ul className="grid grid-cols-4">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.href}>
              <Link href={t.href} className={`relative flex h-[62px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${active ? "text-ink" : "text-faint hover:text-muted"}`} aria-current={active ? "page" : undefined}>
                <span className="relative">
                  <Icon name={t.icon} size={23} strokeWidth={active ? 1.9 : 1.6} filled={active && t.icon !== "calendar" && t.icon !== "bag"} className={active && (t.icon === "calendar" || t.icon === "bag") ? "text-ink" : undefined} />
                  {t.href === "/shopping" && !!shoppingCount && (
                    <span className="absolute -right-2.5 -top-1.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-terracotta px-1 text-[10px] font-semibold text-white">{shoppingCount > 99 ? "99+" : shoppingCount}</span>
                  )}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
