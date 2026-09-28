"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RecipeDraft } from "@/core/domain/schemas";
import type { Recipe } from "@/core/domain/types";
import { parseIngredientLine } from "@/core/services/recipeParsing";
import { apiFetch } from "@/lib/api";
import { minutesLabel } from "@/lib/format";
import { RecipeImage } from "@/components/RecipeImage";
import { SourceBadge } from "@/components/SourceBadge";
import { Button } from "@/components/ui";
import { Icon, type IconName } from "@/components/Icon";
import { toast } from "@/components/Toaster";

type Method = "link" | "image" | "text" | "manual";
type Stage = "choose" | "input" | "extracting" | "review" | "edit";
type ImportResponse = { importId: string; status: "needs_review" | "failed"; draft: RecipeDraft | null; warnings: string[]; error?: string };

const METHODS: { id: Method; icon: IconName; title: string; body: string }[] = [
  { id: "link", icon: "link", title: "Paste a link", body: "Instagram, TikTok or any recipe site" },
  { id: "image", icon: "image", title: "Upload a screenshot", body: "A saved post, a photo of a cookbook page" },
  { id: "text", icon: "text", title: "Paste text", body: "A caption, a note, a message from a friend" },
  { id: "manual", icon: "pencil", title: "Write it yourself", body: "Just a title is fine — add the rest later" },
];

const PROGRESS = ["Reading the source…", "Finding the ingredients…", "Tidying up quantities…", "Working out cuisine and tags…", "Estimating nutrition…"];

const EMPTY: RecipeDraft = { title: "", techniques: [], flavors: [], dietary: [], tags: [], ingredients: [], steps: [], nutritionIsEstimate: true };

export function AddRecipe({ initialMethod, shared, editId }: { initialMethod?: string; shared?: { url?: string; text?: string }; editId?: string }) {
  const router = useRouter();
  const [method, setMethod] = useState<Method | null>((initialMethod as Method) ?? null);
  const [stage, setStage] = useState<Stage>(initialMethod ? (initialMethod === "manual" ? "edit" : "input") : "choose");
  const [url, setUrl] = useState(shared?.url ?? "");
  const [text, setText] = useState(shared?.text ?? "");
  const [draft, setDraft] = useState<RecipeDraft>(EMPTY);
  const [importId, setImportId] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage !== "extracting") return;
    setProgress(0);
    const t = setInterval(() => setProgress((p) => Math.min(PROGRESS.length - 1, p + 1)), 1100);
    return () => clearInterval(t);
  }, [stage]);

  const runImport = useCallback(async (body: object) => {
    setError(null);
    setStage("extracting");
    try {
      const res = await apiFetch<ImportResponse>("/api/imports", { body });
      setImportId(res.importId);
      if (res.status === "failed" || !res.draft) {
        setError(res.error ?? "We couldn't find a recipe there.");
        setStage("input");
        return;
      }
      setDraft(res.draft);
      setWarnings(res.warnings);
      setStage(res.draft.ingredients.length ? "review" : "edit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStage("input");
    }
  }, []);

  // Shared from another app → start straight away.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !shared) return;
    started.current = true;
    const link = shared.url ?? shared.text?.match(/https?:\/\/\S+/)?.[0];
    const caption = shared.text?.replace(link ?? "", "").trim();
    if (caption && caption.length > 60) {
      setMethod("text");
      setText(shared.text ?? "");
      runImport({ type: "text", text: shared.text });
    } else if (link) {
      setMethod("link");
      setUrl(link);
      runImport({ type: "url", url: link });
    }
  }, [shared, runImport]);

  // Editing an existing recipe reuses the same form.
  useEffect(() => {
    if (!editId) return;
    apiFetch<{ recipe: Recipe }>(`/api/recipes/${editId}`).then(({ recipe }) => {
      setMethod("manual");
      setDraft(recipeToDraft(recipe));
      setStage("edit");
    });
  }, [editId]);

  async function onFile(file: File) {
    if (file.size > 10_000_000) {
      setError("That image is a bit large — try a screenshot under 10 MB.");
      return;
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const mediaType = (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) ? file.type : "image/jpeg") as "image/png";
    runImport({ type: "image", imageBase64: base64, mediaType });
  }

  async function save(d: RecipeDraft) {
    if (!d.title.trim()) {
      toast("Give it a name first.", { tone: "error" });
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await apiFetch(`/api/recipes/${editId}`, { method: "PATCH", body: { draft: d } });
        toast("Recipe updated.");
        router.push(`/recipes/${editId}`);
      } else {
        const res = await apiFetch<{ id: string }>("/api/imports/confirm", { body: { importId, draft: d } });
        toast("Saved to your recipes.");
        router.push(`/recipes/${res.id}`);
      }
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save.", { tone: "error" });
      setSaving(false);
    }
  }

  const back = () => {
    if (stage === "choose" || editId) router.back();
    else if (stage === "review" || stage === "edit") setStage(method === "manual" ? "choose" : "input");
    else setStage("choose");
  };

  return (
    <div className="min-h-dvh animate-fade px-5 pt-[max(env(safe-area-inset-top),16px)]">
      <div className="flex items-center justify-between">
        <button onClick={back} className="-ml-2 grid h-10 w-10 place-items-center rounded-full hover:bg-sand" aria-label="Back">
          <Icon name="chevronLeft" size={22} />
        </button>
      </div>

      {stage === "choose" && (
        <>
          <h1 className="mt-2 font-display text-[44px]">Save a recipe</h1>
          <p className="mt-2 text-[15px] text-muted">Drop it in however you found it. We&apos;ll do the tidying.</p>
          <div className="mt-7 space-y-2.5">
            {METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setMethod(m.id);
                  setError(null);
                  if (m.id === "manual") {
                    setDraft(EMPTY);
                    setStage("edit");
                  } else setStage("input");
                  if (m.id === "image") setTimeout(() => fileRef.current?.click(), 50);
                }}
                className="flex w-full items-center gap-4 rounded-[20px] bg-surface p-4 text-left shadow-soft transition hover:bg-white active:scale-[0.99]"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-olive-soft text-olive">
                  <Icon name={m.icon} size={22} />
                </span>
                <span className="flex-1">
                  <span className="block text-[16px] font-semibold">{m.title}</span>
                  <span className="block text-[13.5px] text-muted">{m.body}</span>
                </span>
                <Icon name="chevronRight" size={18} className="text-faint" />
              </button>
            ))}
          </div>
          <p className="mt-8 text-center text-[12.5px] leading-relaxed text-faint">Tip: on your phone, add Larder to your home screen and share straight from Instagram.</p>
        </>
      )}

      {stage === "input" && method === "link" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) runImport({ type: "url", url: url.trim() });
          }}
        >
          <h1 className="mt-2 font-display text-[40px]">Paste a link</h1>
          <p className="mt-2 text-[15px] text-muted">We keep the original link, always.</p>
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            type="url"
            inputMode="url"
            placeholder="https://www.instagram.com/p/…"
            className="mt-6 h-14 w-full rounded-[16px] bg-surface px-4 text-[15.5px] shadow-soft outline-none placeholder:text-faint focus:shadow-[inset_0_0_0_1.5px_var(--color-olive)]"
          />
          <ErrorNote error={error} onPasteText={() => { setError(null); setMethod("text"); }} />
          <Button type="submit" size="lg" className="mt-5 w-full" disabled={!url.trim()}>
            Find the recipe
          </Button>
        </form>
      )}

      {stage === "input" && method === "text" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim().length >= 10) runImport({ type: "text", text });
          }}
        >
          <h1 className="mt-2 font-display text-[40px]">Paste text</h1>
          <p className="mt-2 text-[15px] text-muted">A caption, a note, a recipe from a message — messy is fine.</p>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={11}
            placeholder={"Miso salmon bowl 🍣\n\nIngredients\n2 salmon fillets\n1 tbsp white miso\n1 tbsp soy sauce\n…\n\nMethod\n1. Mix the miso…"}
            className="mt-6 w-full resize-none rounded-[16px] bg-surface p-4 text-[15px] leading-relaxed shadow-soft outline-none placeholder:text-faint focus:shadow-[inset_0_0_0_1.5px_var(--color-olive)]"
          />
          <ErrorNote error={error} />
          <Button type="submit" size="lg" className="mt-4 w-full" disabled={text.trim().length < 10}>
            Find the recipe
          </Button>
        </form>
      )}

      {stage === "input" && method === "image" && (
        <div>
          <h1 className="mt-2 font-display text-[40px]">Upload a screenshot</h1>
          <p className="mt-2 text-[15px] text-muted">We&apos;ll read the recipe from the image and keep it as the cover.</p>
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-6 flex h-52 w-full flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-ink/20 bg-surface/60 text-muted transition hover:bg-surface"
          >
            <Icon name="image" size={28} />
            <span className="text-[15px] font-medium text-ink-2">Choose an image</span>
            <span className="text-[12.5px]">PNG, JPG or WebP</span>
          </button>
          <ErrorNote error={error} onPasteText={() => setMethod("text")} />
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />

      {stage === "extracting" && (
        <div className="flex min-h-[60dvh] flex-col items-center justify-center text-center">
          <div className="relative h-20 w-20">
            <span className="absolute inset-0 animate-ping rounded-full bg-olive/15" />
            <span className="absolute inset-3 grid place-items-center rounded-full bg-olive text-white">
              <Icon name="leaf" size={24} />
            </span>
          </div>
          <p className="mt-7 font-display text-[28px]">One moment</p>
          <p key={progress} className="mt-2 animate-fade text-[15px] text-muted">
            {PROGRESS[progress]}
          </p>
        </div>
      )}

      {stage === "review" && (
        <Review draft={draft} warnings={warnings} saving={saving} onSave={() => save(draft)} onEdit={() => setStage("edit")} />
      )}

      {stage === "edit" && <EditForm draft={draft} setDraft={setDraft} saving={saving} onSave={save} isEdit={!!editId} />}
    </div>
  );
}

function ErrorNote({ error, onPasteText }: { error: string | null; onPasteText?: () => void }) {
  if (!error) return null;
  return (
    <div className="mt-4 rounded-[16px] bg-terracotta-soft px-4 py-3 text-[14px] leading-snug text-terracotta-deep">
      {error}
      {onPasteText && (
        <button type="button" onClick={onPasteText} className="mt-1.5 block font-semibold underline underline-offset-2">
          Paste the text instead
        </button>
      )}
    </div>
  );
}

function Review({ draft, warnings, saving, onSave, onEdit }: { draft: RecipeDraft; warnings: string[]; saving: boolean; onSave: () => void; onEdit: () => void }) {
  const meta = [minutesLabel(draft.totalTimeMinutes), draft.caloriesPerServing ? `${draft.caloriesPerServing} kcal` : null, draft.proteinGrams ? `${draft.proteinGrams}g protein` : null].filter(Boolean).join(" · ");
  return (
    <div className="animate-rise pb-8">
      <p className="mt-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-olive">We found this recipe</p>
      <div className="mt-4 overflow-hidden rounded-[24px] bg-surface shadow-soft">
        <RecipeImage id={draft.title} title={draft.title} imageUrl={draft.imageUrl} cuisine={draft.cuisine} ingredients={draft.ingredients.map((i) => i.name)} aspect={16 / 10} rounded="rounded-none" />
        <div className="p-5">
          <SourceBadge platform={draft.sourcePlatform ?? null} creator={draft.sourceCreator} />
          <h2 className="mt-1.5 font-display text-[32px]">{draft.title}</h2>
          {meta && <p className="mt-1 text-[14px] text-muted">{meta}{draft.nutritionIsEstimate && draft.caloriesPerServing ? " (est.)" : ""}</p>}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {draft.ingredients.map((i, idx) => (
              <span key={idx} className="rounded-full bg-sand px-2.5 py-1 text-[13px] text-ink-2">
                {i.name}
              </span>
            ))}
          </div>
          {draft.steps.length > 0 && <p className="mt-4 text-[13px] text-muted">{draft.steps.length} steps · {[draft.cuisine, ...draft.tags.slice(0, 3)].filter(Boolean).join(" · ")}</p>}
        </div>
      </div>
      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-[13px] text-muted">
          {warnings.map((w) => (
            <li key={w}>• {w}</li>
          ))}
        </ul>
      )}
      <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
        <Button size="lg" onClick={onSave} loading={saving}>
          Save
        </Button>
        <Button size="lg" variant="secondary" onClick={onEdit} icon="pencil">
          Edit
        </Button>
      </div>
    </div>
  );
}

function EditForm({ draft, setDraft, saving, onSave, isEdit }: { draft: RecipeDraft; setDraft: (d: RecipeDraft) => void; saving: boolean; onSave: (d: RecipeDraft) => void; isEdit: boolean }) {
  const [ingredients, setIngredients] = useState(draft.ingredients.map((i) => i.rawText).join("\n"));
  const [steps, setSteps] = useState(draft.steps.join("\n"));
  const set = <K extends keyof RecipeDraft>(k: K, v: RecipeDraft[K]) => setDraft({ ...draft, [k]: v });
  const num = (v: string) => (v.trim() === "" ? undefined : Math.max(0, Math.round(Number(v)) || 0));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const lines = ingredients.split("\n").map((l) => l.trim()).filter(Boolean);
    const parsed = lines.map(parseIngredientLine).filter((x) => x !== null);
    const totalTimeMinutes = draft.prepTimeMinutes != null || draft.cookTimeMinutes != null ? (draft.prepTimeMinutes ?? 0) + (draft.cookTimeMinutes ?? 0) : draft.totalTimeMinutes;
    onSave({ ...draft, totalTimeMinutes, ingredients: parsed, steps: steps.split("\n").map((s) => s.replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean) });
  }

  const field = "w-full rounded-[14px] bg-surface px-4 text-[15px] shadow-[inset_0_0_0_1px_var(--color-line)] outline-none placeholder:text-faint focus:shadow-[inset_0_0_0_1.5px_var(--color-olive)]";
  return (
    <form onSubmit={submit} className="animate-rise pb-10">
      <h1 className="mt-2 font-display text-[40px]">{isEdit ? "Edit recipe" : draft.title ? "Check the details" : "Write it down"}</h1>
      <p className="mt-1.5 text-[14.5px] text-muted">Only the title is required. We&apos;ll fill in cuisine, tags and nutrition.</p>
      <label className="mt-6 block text-[13px] font-medium text-muted">Title</label>
      <input autoFocus={!draft.title} value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="Miso salmon rice bowl" className={`${field} mt-1.5 h-12 text-[16px]`} />
      <div className="mt-4 grid grid-cols-3 gap-2">
        {(
          [
            ["Prep (min)", "prepTimeMinutes"],
            ["Cook (min)", "cookTimeMinutes"],
            ["Servings", "servings"],
          ] as const
        ).map(([label, key]) => (
          <label key={key} className="block">
            <span className="text-[13px] font-medium text-muted">{label}</span>
            <input inputMode="numeric" value={draft[key] ?? ""} onChange={(e) => set(key, num(e.target.value))} className={`${field} mt-1.5 h-11`} />
          </label>
        ))}
      </div>
      <label className="mt-5 block text-[13px] font-medium text-muted">Ingredients · one per line</label>
      <textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={8} placeholder={"2 salmon fillets\n1 tbsp white miso\n150 g sushi rice"} className={`${field} mt-1.5 resize-none py-3 leading-relaxed`} />
      <label className="mt-5 block text-[13px] font-medium text-muted">Method · one step per line</label>
      <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={6} placeholder={"Mix the miso, soy and honey.\nGrill the salmon for 8 minutes…"} className={`${field} mt-1.5 resize-none py-3 leading-relaxed`} />
      <label className="mt-5 block text-[13px] font-medium text-muted">Source link (optional)</label>
      <input value={draft.sourceUrl ?? ""} onChange={(e) => set("sourceUrl", e.target.value || undefined)} type="url" placeholder="https://…" className={`${field} mt-1.5 h-11`} />
      <Button type="submit" size="lg" className="mt-7 w-full" loading={saving}>
        {isEdit ? "Save changes" : "Save recipe"}
      </Button>
    </form>
  );
}

function recipeToDraft(r: Recipe): RecipeDraft {
  const u = <T,>(v: T | null) => (v == null ? undefined : v);
  return {
    title: r.title,
    description: u(r.description),
    sourceUrl: u(r.sourceUrl),
    sourcePlatform: u(r.sourcePlatform),
    sourceCreator: u(r.sourceCreator),
    imageUrl: u(r.imageUrl),
    servings: u(r.servings),
    prepTimeMinutes: u(r.prepTimeMinutes),
    cookTimeMinutes: u(r.cookTimeMinutes),
    totalTimeMinutes: u(r.totalTimeMinutes),
    caloriesPerServing: u(r.caloriesPerServing),
    proteinGrams: u(r.proteinGrams),
    carbsGrams: u(r.carbsGrams),
    fatGrams: u(r.fatGrams),
    nutritionIsEstimate: r.nutritionIsEstimate,
    cuisine: u(r.cuisine),
    mealType: u(r.mealType),
    techniques: r.techniques,
    flavors: r.flavors,
    dietary: r.dietary,
    tags: r.tags,
    difficulty: u(r.difficulty),
    ingredients: r.ingredients.map((i) => ({ rawText: i.rawText, name: i.normalizedName, amount: u(i.amount), unit: u(i.unit), preparation: u(i.preparation), optional: i.optional })),
    steps: r.steps,
    notes: u(r.notes),
  };
}
