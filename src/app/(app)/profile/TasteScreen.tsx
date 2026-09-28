"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TasteView } from "@/server/services/taste";
import type { TastePreference } from "@/core/domain/types";
import { apiFetch } from "@/lib/api";
import { PreferenceChip } from "@/components/PreferenceChip";
import { BottomSheet, Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toaster";

export function TasteScreen({ view, name, email, aiProvider }: { view: TasteView; name: string; email: string | null; aiProvider: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [memberSheet, setMemberSheet] = useState(false);
  const refresh = () => startTransition(() => router.refresh());

  async function addStatement(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ added: number; parsed: { preferences: { label: string; score: number }[]; member: string } }>("/api/taste", { body: { text } });
      const labels = res.parsed.preferences.map((p) => `${p.score < 0 ? "avoid" : "like"} ${p.label.toLowerCase()}`);
      toast(res.added ? `Got it${res.parsed.member !== "self" ? ` (for ${res.parsed.member === "kids" ? "the kids" : "your partner"})` : ""}: ${labels.join(", ")}.` : "I couldn't pick out a preference there — try naming a food or flavour.");
      setText("");
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save that.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function update(p: TastePreference, action: "confirm" | "remove") {
    setHidden((h) => (action === "remove" ? [...h, p.id] : h));
    try {
      if (action === "confirm") await apiFetch(`/api/taste/${p.id}`, { method: "PATCH", body: { status: "confirmed" } });
      else await apiFetch(`/api/taste/${p.id}`, { method: "DELETE" });
      if (action === "remove") toast(`Removed “${p.label}”. We won't infer it again.`, { action: { label: "Undo", onClick: () => apiFetch(`/api/taste/${p.id}`, { method: "PATCH", body: { status: "active" } }).then(refresh) } });
      refresh();
    } catch {
      setHidden((h) => h.filter((x) => x !== p.id));
    }
  }

  const show = (list: TastePreference[]) => list.filter((p) => !hidden.includes(p.id));
  const Section = ({ title, list, tone, empty }: { title: string; list: TastePreference[]; tone: "like" | "avoid" | "habit"; empty: string }) => (
    <section className="mt-8 px-5">
      <h2 className="text-[19px] font-semibold">{title}</h2>
      {show(list).length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {show(list).map((p) => (
            <PreferenceChip key={p.id} pref={p} tone={tone} onConfirm={() => update(p, "confirm")} onRemove={() => update(p, "remove")} />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[14px] text-muted">{empty}</p>
      )}
    </section>
  );

  return (
    <div className="animate-fade pb-8">
      <header className="flex items-center px-3 pt-[max(env(safe-area-inset-top),12px)]">
        <button onClick={() => router.back()} className="grid h-10 w-10 place-items-center rounded-full hover:bg-sand" aria-label="Back">
          <Icon name="chevronLeft" size={22} />
        </button>
      </header>
      <section className="px-5">
        <h1 className="font-display text-[46px]">Your Taste</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          What I&apos;ve learned from {view.stats.recipes} saved recipe{view.stats.recipes === 1 ? "" : "s"}, {view.stats.cooked} you&apos;ve cooked and {view.stats.feedback} bit{view.stats.feedback === 1 ? "" : "s"} of feedback. Edit anything that&apos;s wrong.
        </p>
        <div className="mt-4 flex gap-4 text-[12.5px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-olive-soft shadow-[inset_0_0_0_1px_rgb(104_115_91/0.3)]" /> You told me
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-surface shadow-[inset_0_0_0_1px_var(--color-line)]" /> Learned — tap to confirm or remove
          </span>
        </div>
        <form onSubmit={addStatement} className="mt-5 flex items-center gap-2 rounded-[18px] bg-surface p-1.5 pl-4 shadow-soft">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="“I don't really like blue cheese”"
            aria-label="Tell me a preference"
            className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
          />
          <button type="submit" disabled={busy || text.trim().length < 2} className="h-10 shrink-0 rounded-[12px] bg-ink px-4 text-[14px] font-medium text-bg disabled:bg-sand disabled:text-faint">
            {busy ? "…" : "Tell me"}
          </button>
        </form>
      </section>

      <Section title="You often like" list={view.likes} tone="like" empty="Save and cook a few recipes — this fills in on its own." />
      <Section title="You tend to avoid" list={view.avoids} tone="avoid" empty="Nothing yet. Tell me, or say “not for me” after cooking something." />
      <Section title="Cooking habits" list={view.habits} tone="habit" empty="I'll notice patterns like quick weeknights or bigger weekend cooks." />

      <section className="mt-10 px-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[19px] font-semibold">Household</h2>
          <button onClick={() => setMemberSheet(true)} className="inline-flex h-9 items-center gap-1 rounded-full bg-surface px-3 text-[13px] font-medium shadow-[inset_0_0_0_1px_var(--color-line)]">
            <Icon name="plus" size={15} /> Add
          </button>
        </div>
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-3 rounded-[18px] bg-surface p-3.5 shadow-soft">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-olive-soft font-display text-[20px] text-olive-deep">{(name === "there" ? "Me" : name).charAt(0)}</span>
            <div>
              <p className="text-[15px] font-semibold">{name === "there" ? "You" : name}</p>
              <p className="text-[12.5px] text-muted">{email ?? "Signed in"}</p>
            </div>
          </div>
          {view.members.map((m) => (
            <div key={m.id} className="rounded-[18px] bg-surface p-3.5 shadow-soft">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-terracotta-soft font-display text-[20px] text-terracotta-deep">{m.name.charAt(0)}</span>
                <div className="flex-1">
                  <p className="text-[15px] font-semibold">{m.name}</p>
                  <p className="text-[12.5px] capitalize text-muted">{m.role === "child" ? "Child" : m.role}</p>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm(`Remove ${m.name} from your household?`)) return;
                    await apiFetch(`/api/household/${m.id}`, { method: "DELETE" });
                    refresh();
                  }}
                  className="grid h-8 w-8 place-items-center rounded-full text-faint hover:bg-sand hover:text-ink"
                  aria-label={`Remove ${m.name}`}
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
              {(m.likes.length > 0 || m.avoids.length > 0) && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 text-[12.5px]">
                  {m.likes.map((p) => (
                    <span key={p.id} className="rounded-full bg-olive-soft px-2.5 py-1 text-olive-deep">
                      {p.label}
                    </span>
                  ))}
                  {m.avoids.map((p) => (
                    <span key={p.id} className="rounded-full bg-terracotta-soft px-2.5 py-1 text-terracotta-deep">
                      Not {p.label.toLowerCase()}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">Say things like “my kids loved this” in feedback and I&apos;ll remember it for them.</p>
      </section>

      <section className="mt-10 px-5">
        <h2 className="text-[19px] font-semibold">Privacy</h2>
        <div className="mt-3 divide-y divide-line rounded-[18px] bg-surface shadow-soft">
          <p className="px-4 py-3.5 text-[13.5px] leading-relaxed text-muted">
            Your recipes, taste and shopping history are private to your household. Understanding is done by: <span className="font-medium text-ink-2">{aiProvider}</span>.
          </p>
          <button
            onClick={async () => {
              await apiFetch("/api/auth/logout", { body: {} });
              router.push("/login");
              router.refresh();
            }}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px]"
          >
            <Icon name="arrowRight" size={18} /> Sign out
          </button>
          <button
            onClick={async () => {
              if (!confirm("Delete all your recipes, taste memory, plans, lists and purchase history? This can't be undone.")) return;
              await apiFetch("/api/account/data", { method: "DELETE" });
              toast("Your data has been deleted.");
              router.push("/");
              router.refresh();
            }}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] text-terracotta-deep"
          >
            <Icon name="trash" size={18} /> Delete my data
          </button>
        </div>
      </section>

      <AddMemberSheet open={memberSheet} onClose={() => setMemberSheet(false)} onAdded={refresh} />
    </div>
  );
}

function AddMemberSheet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"partner" | "child" | "other">("child");
  return (
    <BottomSheet open={open} onClose={onClose} title="Add someone">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus className="h-12 w-full rounded-[14px] bg-surface px-4 text-[15px] shadow-[inset_0_0_0_1px_var(--color-line)] outline-none" />
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-[14px] bg-sand p-1">
        {(["partner", "child", "other"] as const).map((r) => (
          <button key={r} onClick={() => setRole(r)} className={`h-9 rounded-[11px] text-[13.5px] font-medium capitalize ${role === r ? "bg-surface shadow-soft" : "text-muted"}`}>
            {r}
          </button>
        ))}
      </div>
      <Button
        className="mt-5 w-full"
        size="lg"
        disabled={!name.trim()}
        onClick={async () => {
          await apiFetch("/api/household", { body: { name, role } });
          setName("");
          onAdded();
          onClose();
        }}
      >
        Add to household
      </Button>
    </BottomSheet>
  );
}
