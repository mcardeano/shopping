import type { Ctx } from "../context";
import { AIUnavailableError } from "@/core/ai/provider";
import { RecipeDraft, type ImportBody } from "@/core/domain/schemas";
import { enrichDraft } from "@/core/services/enrichment";
import { detectPlatform } from "@/core/services/recipeParsing";
import { ai } from "../ai";
import { storage } from "../storage";
import { saveRecipe } from "./recipes";

export type ImportOutcome = { status: "needs_review" | "failed"; draft: RecipeDraft | null; warnings: string[]; error?: string };

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 4_000_000;

async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-GB,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`The page answered ${res.status}.`);
    const text = await res.text();
    return text.slice(0, MAX_BYTES);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The ingestion pipeline up to the review step. Runs OUTSIDE any database transaction
 * because it may wait on the network or a model.
 *   submit → fetch/read source → AI extraction → normalization → enrichment → review
 */
export async function extractFromInput(input: ImportBody): Promise<ImportOutcome> {
  try {
    const provider = ai();
    if (input.type === "url") {
      const platform = detectPlatform(input.url);
      let html: string;
      try {
        html = await fetchPage(input.url);
      } catch (e) {
        const reason = e instanceof Error && e.name === "AbortError" ? "The page took too long to respond." : e instanceof Error ? e.message : "We couldn't open that link.";
        const social = platform === "instagram" || platform === "tiktok";
        return {
          status: "failed",
          draft: null,
          warnings: [],
          error: social
            ? `${reason} ${platform === "instagram" ? "Instagram" : "TikTok"} often blocks automated reading — paste the caption text instead and we'll keep the link.`
            : `${reason} You can paste the recipe text instead.`,
        };
      }
      const result = await provider.extractRecipe({ kind: "html", html, url: input.url, platform });
      if (!result.draft) return { status: "failed", draft: null, warnings: result.warnings, error: result.warnings[0] ?? "We couldn't find a recipe on that page." };
      return { status: "needs_review", draft: enrichDraft({ ...result.draft, sourceUrl: input.url, sourcePlatform: platform }), warnings: result.warnings };
    }
    if (input.type === "text") {
      const url = input.text.match(/https?:\/\/\S+/)?.[0];
      const result = await provider.extractRecipe({ kind: "text", text: input.text, sourceUrl: url, platform: url ? detectPlatform(url) : "text" });
      if (!result.draft) return { status: "failed", draft: null, warnings: result.warnings, error: result.warnings[0] ?? "We couldn't find a recipe in that text." };
      return { status: "needs_review", draft: enrichDraft(result.draft), warnings: result.warnings };
    }
    const bytes = Buffer.from(input.imageBase64, "base64");
    const result = await provider.extractRecipe({ kind: "image", base64: input.imageBase64, mediaType: input.mediaType });
    if (!result.draft) return { status: "failed", draft: null, warnings: result.warnings, error: result.warnings[0] ?? "We couldn't read a recipe in that image." };
    const imageUrl = await storage.save(bytes, input.mediaType);
    return { status: "needs_review", draft: enrichDraft({ ...result.draft, imageUrl, sourcePlatform: "image" }), warnings: result.warnings };
  } catch (e) {
    if (e instanceof AIUnavailableError) return { status: "failed", draft: null, warnings: [], error: e.message };
    console.error("[import]", e);
    return { status: "failed", draft: null, warnings: [], error: "Something went wrong reading that. Try pasting the text instead." };
  }
}

export async function recordImport(ctx: Ctx, input: ImportBody, outcome: ImportOutcome): Promise<string> {
  const row = await ctx.sql.one<{ id: string }>(
    `insert into recipe_imports (household_id, user_id, input_type, input_text, status, draft, warnings, error)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7::text[],$8) returning id`,
    [
      ctx.householdId,
      ctx.userId,
      input.type,
      input.type === "url" ? input.url : input.type === "text" ? input.text.slice(0, 20000) : null,
      outcome.status,
      outcome.draft ? JSON.stringify({ ...outcome.draft, imageUrl: outcome.draft.imageUrl?.startsWith("data:") ? undefined : outcome.draft.imageUrl }) : null,
      outcome.warnings,
      outcome.error ?? null,
    ],
  );
  return String(row!.id);
}

export async function confirmImport(ctx: Ctx, importId: string | null, draft: RecipeDraft): Promise<string> {
  const id = await saveRecipe(ctx, draft);
  if (importId) await ctx.sql.query("update recipe_imports set status = 'complete', recipe_id = $2, updated_at = now() where id = $1", [importId, id]);
  return id;
}
