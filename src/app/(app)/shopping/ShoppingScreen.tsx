"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ShoppingView } from "@/server/services/shopping";
import type { ProductOptions } from "@/server/services/products";
import type { ShoppingListItem as Item } from "@/core/domain/types";
import type { ItemStatus } from "@/core/domain/schemas";
import { SHOPPING_CATEGORIES } from "@/core/domain/categories";
import { exportListText } from "@/core/services/shoppingList";
import { RETAILER_SEARCH } from "@/core/grocery/retailerLinks";
import { apiFetch } from "@/lib/api";
import { QuickAddInput } from "@/components/QuickAddInput";
import { ShoppingListItem } from "@/components/ShoppingListItem";
import { BottomSheet, Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toaster";

const CATEGORY_LABEL: Record<string, string> = { "Dairy & Eggs": "Fridge", "Meat & Fish": "Meat & Fish" };

export function ShoppingScreen({ view }: { view: ShoppingView }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<{ key: string; name: string; note?: string; quantity?: number }[]>([]);
  const [open, setOpen] = useState<Item | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [showHave, setShowHave] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [hiddenSuggestions, setHiddenSuggestions] = useState<string[]>([]);

  // Server data wins once it arrives.
  useEffect(() => {
    setCheckedIds({});
    setPending([]);
  }, [view]);

  const refresh = () => startTransition(() => router.refresh());
  const isChecked = (i: Item) => checkedIds[i.id] ?? i.checked;

  async function toggle(item: Item) {
    const next = !isChecked(item);
    setCheckedIds((s) => ({ ...s, [item.id]: next }));
    try {
      await apiFetch(`/api/shopping/items/${item.id}`, { method: "PATCH", body: { checked: next } });
      refresh();
    } catch (e) {
      setCheckedIds((s) => ({ ...s, [item.id]: !next }));
      toast(e instanceof Error ? e.message : "Couldn't update.", { tone: "error" });
    }
  }

  async function suggestion(name: string, accept: boolean) {
    setHiddenSuggestions((s) => [...s, name]);
    try {
      await apiFetch("/api/shopping/suggestions", { body: { name, accept } });
      if (accept) toast("Added.");
      refresh();
    } catch {
      setHiddenSuggestions((s) => s.filter((x) => x !== name));
    }
  }

  const allOpen = [...view.need.flatMap((g) => g.items), ...view.check, ...view.have];
  const doneNow = [...allOpen.filter((i) => isChecked(i)), ...view.done.filter((i) => isChecked(i))];
  const visible = (items: Item[]) => items.filter((i) => !isChecked(i));
  const restored = view.done.filter((i) => !isChecked(i));
  const needGroups = useMemo(() => {
    const groups = view.need.map((g) => ({ ...g, items: visible(g.items) }));
    for (const r of restored) {
      const g = groups.find((x) => x.category === r.category);
      if (g) g.items.push(r);
      else groups.push({ category: r.category, items: [r] });
    }
    return groups.filter((g) => g.items.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, checkedIds]);
  const check = visible(view.check);
  const have = visible(view.have);
  const suggestions = view.suggestions.filter((s) => !hiddenSuggestions.includes(s.name));
  const empty = needGroups.length === 0 && check.length === 0 && pending.length === 0;

  const exportText = exportListText([
    ...needGroups.map((g) => ({ title: CATEGORY_LABEL[g.category] ?? g.category, items: g.items })),
    { title: "Check at home", items: check },
  ]);

  return (
    <div className="animate-fade">
      <header className="flex items-end justify-between px-5 pt-[max(env(safe-area-inset-top),24px)]">
        <div>
          <h1 className="font-display text-[46px]">Shopping</h1>
          <p className="text-[13.5px] text-muted">{view.totalOpen ? `${view.totalOpen} thing${view.totalOpen === 1 ? "" : "s"} to get` : "All caught up"}</p>
        </div>
        <button onClick={() => setExportOpen(true)} className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-surface shadow-soft" aria-label="Share or shop online">
          <Icon name="share" size={18} />
        </button>
      </header>

      <div className="sticky top-0 z-20 bg-bg/90 px-5 pb-3 pt-4 backdrop-blur-xl">
        <QuickAddInput
          variant="inline"
          placeholder="Add anything… “we're out of olive oil”"
          onOptimistic={(items) => setPending((p) => [...p, ...items.map((i, n) => ({ key: `${Date.now()}-${n}`, ...i }))])}
          onSettled={() => undefined}
        />
      </div>

      {suggestions.length > 0 && (
        <section className="mx-5 mb-2 mt-1 rounded-[20px] bg-terracotta-soft/60 px-4 pb-1.5 pt-3.5">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-terracotta-deep">
            <Icon name="refresh" size={14} /> Usually around now
          </p>
          <div className="mt-1 divide-y divide-[rgb(169_103_78/0.15)]">
            {suggestions.map((s) => (
              <div key={s.name} className="flex animate-fade items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{s.display}</p>
                  <p className="truncate text-[12px] text-muted">{s.reason}</p>
                </div>
                <button onClick={() => suggestion(s.name, true)} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-ink px-3 text-[12.5px] font-medium text-bg">
                  <Icon name="plus" size={13} /> Add
                </button>
                <button onClick={() => suggestion(s.name, false)} className="h-8 shrink-0 rounded-full px-2 text-[12.5px] text-muted hover:text-ink" aria-label={`I still have ${s.display}`}>
                  Have it
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {empty && (
        <div className="mx-5 mt-8 text-center">
          <p className="font-display text-[30px]">Nothing to buy yet</p>
          <p className="mx-auto mt-2 max-w-[280px] text-[14.5px] leading-relaxed text-muted">Add things as you think of them, or plan a few dinners and we&apos;ll work out the ingredients.</p>
        </div>
      )}

      {(pending.length > 0 || needGroups.length > 0) && (
        <section className="mt-3 px-5">
          <h2 className="mb-1 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-muted">Need to buy</h2>
          {pending.length > 0 && (
            <div className="border-b border-line pb-1">
              {pending.map((p) => (
                <div key={p.key} className="flex animate-rise items-center gap-3 py-2.5 opacity-70">
                  <span className="h-[26px] w-[26px] shrink-0 rounded-full shadow-[inset_0_0_0_1.6px_var(--color-sand-2)]" />
                  <span className="flex-1 text-[15.5px] capitalize">{p.name}</span>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-faint border-t-transparent" />
                </div>
              ))}
            </div>
          )}
          {needGroups.map((g) => (
            <div key={g.category} className="mt-3">
              <h3 className="text-[15px] font-semibold text-olive-deep">{CATEGORY_LABEL[g.category] ?? g.category}</h3>
              <div className="divide-y divide-line">
                {g.items.map((i) => (
                  <ShoppingListItem key={i.id} item={{ ...i, checked: isChecked(i) }} onToggle={() => toggle(i)} onOpen={() => setOpen(i)} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {check.length > 0 && (
        <section className="mx-5 mt-7 rounded-[22px] bg-surface/70 px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-line)]">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-[#9A8455]">Check at home</h2>
            <span className="text-[12px] text-faint">Tap ✓ if you need it</span>
          </div>
          <div className="divide-y divide-line">
            {check.map((i) => (
              <StatusRow key={i.id} item={i} onOpen={() => setOpen(i)} onRefresh={refresh} />
            ))}
          </div>
        </section>
      )}

      {have.length > 0 && (
        <section className="mx-5 mt-4">
          <button onClick={() => setShowHave((s) => !s)} className="flex w-full items-center justify-between py-2 text-left">
            <span className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-olive">Probably already at home · {have.length}</span>
            <Icon name="chevronDown" size={16} className={`text-faint transition ${showHave ? "rotate-180" : ""}`} />
          </button>
          {showHave ? (
            <div className="divide-y divide-line">
              {have.map((i) => (
                <StatusRow key={i.id} item={i} onOpen={() => setOpen(i)} onRefresh={refresh} />
              ))}
            </div>
          ) : (
            <p className="text-[14px] leading-relaxed text-muted">{have.map((i) => i.displayName).join(", ")}</p>
          )}
        </section>
      )}

      {doneNow.length > 0 && (
        <section className="mx-5 mt-7">
          <div className="flex items-center justify-between">
            <button onClick={() => setShowDone((s) => !s)} className="flex items-center gap-1.5 py-2 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-faint">
              Done · {doneNow.length}
              <Icon name="chevronDown" size={15} className={`transition ${showDone ? "rotate-180" : ""}`} />
            </button>
            <button
              onClick={async () => {
                await apiFetch("/api/shopping/clear-done", { body: {} });
                refresh();
              }}
              className="text-[13px] text-muted hover:text-ink"
            >
              Clear
            </button>
          </div>
          {showDone && (
            <div className="divide-y divide-line">
              {doneNow.map((i) => (
                <ShoppingListItem key={i.id} item={{ ...i, checked: true }} onToggle={() => toggle(i)} onOpen={() => setOpen(i)} />
              ))}
            </div>
          )}
        </section>
      )}

      <ItemSheet item={open} onClose={() => setOpen(null)} onChanged={refresh} />

      <BottomSheet open={exportOpen} onClose={() => setExportOpen(false)} title="Take it shopping">
        <p className="-mt-1 text-[14px] text-muted">Share the list, or search for everything at your supermarket.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="primary"
            icon="share"
            onClick={async () => {
              if (navigator.share) await navigator.share({ title: "Shopping", text: exportText }).catch(() => undefined);
              else {
                await navigator.clipboard.writeText(exportText);
                toast("List copied.");
              }
            }}
          >
            Share list
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(exportText);
              toast("List copied.");
            }}
          >
            Copy text
          </Button>
        </div>
        <p className="mt-6 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">Search at</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {RETAILER_SEARCH.map((r) => (
            <a
              key={r.id}
              href={r.url(needGroups[0]?.items[0]?.displayName ?? "")}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13.5px] shadow-[inset_0_0_0_1px_var(--color-line)]"
            >
              {r.name} <Icon name="external" size={13} />
            </a>
          ))}
        </div>
        <p className="mt-4 text-[12.5px] leading-relaxed text-faint">Direct baskets need an official retailer integration. Until then, open each item from its details to search your store.</p>
      </BottomSheet>
    </div>
  );
}

function StatusRow({ item, onOpen, onRefresh }: { item: Item; onOpen: () => void; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const set = async (status: ItemStatus) => {
    setBusy(true);
    try {
      await apiFetch(`/api/shopping/items/${item.id}`, { method: "PATCH", body: { status } });
      onRefresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`flex items-center gap-3 py-2.5 ${busy ? "opacity-50" : ""}`}>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[15px]">{item.displayName}</span>
        <span className="block truncate text-[12px] text-faint">
          {item.quantityLabel ? `${item.quantityLabel} needed · ` : ""}
          {item.sourceLabel}
        </span>
      </button>
      {item.status !== "need_to_buy" && (
        <button onClick={() => set("need_to_buy")} className="h-8 shrink-0 rounded-full bg-surface px-3 text-[12.5px] font-medium shadow-[inset_0_0_0_1px_var(--color-line)]">
          Need it
        </button>
      )}
      {item.status === "check_at_home" && (
        <button onClick={() => set("probably_have")} className="h-8 shrink-0 rounded-full bg-olive-soft px-3 text-[12.5px] font-medium text-olive-deep">
          Have it
        </button>
      )}
    </div>
  );
}

function ItemSheet({ item, onClose, onChanged }: { item: Item | null; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("Other");
  const [products, setProducts] = useState<ProductOptions | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setName(item.displayName);
    setQty(item.quantityLabel ?? "");
    setNote(item.note ?? "");
    setCategory(item.category);
    setProducts(null);
    apiFetch<ProductOptions>(`/api/shopping/items/${item.id}/products`).then(setProducts).catch(() => undefined);
  }, [item]);

  if (!item) return <BottomSheet open={false} onClose={onClose}>{null}</BottomSheet>;

  async function patch(body: object, close = true) {
    setSaving(true);
    try {
      await apiFetch(`/api/shopping/items/${item!.id}`, { method: "PATCH", body });
      onChanged();
      if (close) onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save.", { tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  function save() {
    const body: Record<string, unknown> = {};
    if (name.trim() && name !== item!.displayName) body.displayName = name.trim();
    if (note !== (item!.note ?? "")) body.note = note;
    if (category !== item!.category) body.category = category;
    if (qty !== (item!.quantityLabel ?? "")) {
      const m = qty.trim().match(/^×?\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]*)$/);
      body.quantity = m ? Number(m[1]!.replace(",", ".")) : null;
      body.unit = m && m[2] ? m[2] : null;
    }
    if (Object.keys(body).length) patch(body);
    else onClose();
  }

  const statuses: { value: ItemStatus; label: string }[] = [
    { value: "need_to_buy", label: "Need to buy" },
    { value: "check_at_home", label: "Check at home" },
    { value: "probably_have", label: "Have it" },
  ];
  const field = "w-full rounded-[14px] bg-surface px-3.5 text-[15px] shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--color-olive)]";

  return (
    <BottomSheet open onClose={onClose} title={item.displayName}>
      <div className="grid grid-cols-[1fr_110px] gap-2">
        <label>
          <span className="text-[12.5px] font-medium text-muted">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${field} mt-1 h-11`} />
        </label>
        <label>
          <span className="text-[12.5px] font-medium text-muted">Quantity</span>
          <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="2, 500g…" className={`${field} mt-1 h-11`} />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="text-[12.5px] font-medium text-muted">Note</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="for the kids, the big pack…" className={`${field} mt-1 h-11`} />
      </label>
      <label className="mt-3 block">
        <span className="text-[12.5px] font-medium text-muted">Aisle</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${field} mt-1 h-11 appearance-none`}>
          {SHOPPING_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>

      <div className="mt-4 grid grid-cols-3 gap-1 rounded-[14px] bg-sand p-1">
        {statuses.map((s) => (
          <button key={s.value} onClick={() => patch({ status: s.value })} className={`h-9 rounded-[11px] text-[13px] font-medium transition ${item.status === s.value ? "bg-surface shadow-soft" : "text-muted"}`}>
            {s.label}
          </button>
        ))}
      </div>
      {item.pantryProbability != null && item.status !== "need_to_buy" && <p className="mt-2 text-[12px] text-muted">We guessed this from what you bought and cooked recently. Correcting it teaches the estimate.</p>}

      <div className="mt-5">
        <p className="text-[12.5px] font-semibold uppercase tracking-[0.06em] text-muted">Why it&apos;s here</p>
        <ul className="mt-1.5 space-y-1 text-[14px]">
          {item.sources.map((s) => (
            <li key={s.id} className="flex justify-between gap-3">
              <span className="text-ink-2">
                {s.type === "manual" ? "Added by you" : s.type === "meal_plan" ? `Meal plan · ${s.label}` : s.type === "recipe" ? s.label : s.type === "repeat_purchase" ? "You usually buy this" : "Probably running low"}
                {s.type === "manual" && s.label ? ` · ${s.label}` : ""}
              </span>
              {s.quantity != null && <span className="text-muted">{s.quantity}{s.unit ? ` ${s.unit}` : ""}</span>}
            </li>
          ))}
        </ul>
      </div>

      {products && products.products.length > 0 && (
        <div className="mt-5">
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.06em] text-muted">Preferred product</p>
          <div className="mt-2 space-y-1.5">
            {products.products.slice(0, 4).map((p) => {
              const selected = item.preferredRetailProductId === p.dbId;
              return (
                <button
                  key={p.dbId}
                  onClick={() => patch({ preferredRetailProductId: selected ? null : p.dbId }, false)}
                  className={`flex w-full items-center justify-between gap-3 rounded-[14px] px-3.5 py-2.5 text-left transition ${selected ? "bg-olive-soft" : "bg-surface shadow-[inset_0_0_0_1px_var(--color-line)]"}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{p.name}</span>
                    <span className="block text-[12px] text-muted">
                      {p.badge ?? p.brand}
                      {p.packsNeeded && p.packsNeeded > 1 ? ` · ${p.packsNeeded} packs` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] tabular-nums text-ink-2">{p.price != null ? `€${p.price.toFixed(2)}` : ""}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {products && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {products.links.map((l) => (
            <a key={l.name} href={l.url} target="_blank" rel="noreferrer noopener" className="inline-flex h-8 items-center gap-1 rounded-full bg-surface px-3 text-[12.5px] shadow-[inset_0_0_0_1px_var(--color-line)]">
              {l.name} <Icon name="external" size={12} />
            </a>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-[auto_1fr] gap-2">
        <Button
          variant="danger"
          icon="trash"
          onClick={async () => {
            await apiFetch(`/api/shopping/items/${item.id}`, { method: "DELETE" });
            toast(`Removed ${item.displayName}.`);
            onChanged();
            onClose();
          }}
        >
          Remove
        </Button>
        <Button onClick={save} loading={saving}>
          Done
        </Button>
      </div>
    </BottomSheet>
  );
}
