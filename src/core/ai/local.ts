/**
 * LocalAIProvider — deterministic, offline, instant.
 * Good at structured sources (schema.org pages, formatted captions, pasted recipes)
 * and at the everyday language of feedback and preferences. Can't read images.
 */
import { RecipeDraft } from "../domain/schemas";
import { embedText } from "../services/embedding";
import { extractJsonLdRecipe, extractMeta, parseRecipeText } from "../services/recipeParsing";
import { interpretFeedback, parsePreferenceStatement } from "../services/taste";
import { AIUnavailableError, type AIProvider, type ExtractionResult, type FeedbackInput, type RecipeInput } from "./provider";

function finalize(partial: Partial<RecipeDraft> & { title?: string }, extra: Partial<RecipeDraft>): ExtractionResult {
  const warnings: string[] = [];
  const title = partial.title?.trim() || extra.title?.trim();
  if (!title) return { draft: null, warnings: ["We couldn't find a recipe title."] };
  const candidate = { ...extra, ...stripUndefined(partial), title };
  if (!candidate.ingredients?.length) warnings.push("We couldn't find the ingredients — add them below.");
  if (!candidate.steps?.length) warnings.push("We couldn't find the method — add steps or keep it as a link.");
  const parsed = RecipeDraft.safeParse(candidate);
  if (!parsed.success) return { draft: null, warnings: ["The recipe looked incomplete."] };
  return { draft: parsed.data, warnings };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))) as Partial<T>;
}

export class LocalAIProvider implements AIProvider {
  readonly name = "local";
  readonly supportsVision = false;

  async extractRecipe(input: RecipeInput): Promise<ExtractionResult> {
    if (input.kind === "image") {
      throw new AIUnavailableError("Reading screenshots needs an AI model. Add ANTHROPIC_API_KEY, or paste the caption text instead.");
    }
    if (input.kind === "text") {
      return finalize(parseRecipeText(input.text), { sourceUrl: input.sourceUrl, sourcePlatform: input.platform ?? "text" });
    }
    const ld = extractJsonLdRecipe(input.html);
    const meta = extractMeta(input.html);
    const base: Partial<RecipeDraft> = {
      sourceUrl: input.url,
      sourcePlatform: input.platform,
      imageUrl: meta.image,
      sourceCreator: meta.siteName,
    };
    if (ld?.title && ld.ingredients?.length) {
      return finalize(ld, { ...base, nutritionIsEstimate: ld.nutritionIsEstimate ?? true });
    }
    // Social posts: the caption is in og:description.
    const caption = meta.description ?? "";
    const fromCaption = parseRecipeText([meta.title ?? "", caption].join("\n"));
    const creator = input.platform === "instagram" ? meta.title?.match(/^(.*?)\s+(?:on Instagram|\(@)/)?.[1] ?? meta.title?.match(/@[\w.]+/)?.[0] : undefined;
    const title = cleanSocialTitle(fromCaption.title, meta.title);
    return finalize({ ...fromCaption, title }, { ...base, sourceCreator: creator ?? base.sourceCreator, description: caption.slice(0, 300) || undefined });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return embedText(text);
  }

  async interpretFeedback(input: FeedbackInput) {
    return interpretFeedback(input.comment, input.reaction);
  }

  async parsePreferenceStatement(text: string) {
    return parsePreferenceStatement(text);
  }
}

function cleanSocialTitle(fromCaption: string | undefined, metaTitle: string | undefined): string | undefined {
  const raw = fromCaption ?? metaTitle;
  if (!raw) return undefined;
  return raw
    .replace(/\s+on (Instagram|TikTok).*$/i, "")
    .replace(/^.*?:\s*["“]/, "")
    .replace(/["”]$/, "")
    .replace(/\s*\|.*$/, "")
    .slice(0, 120)
    .trim();
}
