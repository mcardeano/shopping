import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AIProvider, ExtractionResult, FeedbackInput, RecipeInput } from "@/core/ai/provider";
import { LocalAIProvider } from "@/core/ai/local";
import { PreferenceStatement, RecipeDraft, RecipeExtraction, TasteSignals } from "@/core/domain/schemas";
import { htmlToText, extractJsonLdRecipe, extractMeta, parseIngredientLine } from "@/core/services/recipeParsing";

const EXTRACTION_SYSTEM = `You extract cooking recipes from social media captions, web pages, screenshots and pasted notes.
Return only what the source supports. Keep ingredient lines as written, one per item, including amounts and units (e.g. "2 tbsp soy sauce", "1/2 cucumber, thinly sliced").
Split the method into clear steps. Use null for anything the source doesn't state; you may estimate calories and macros per serving from the ingredients.
If the source is not a recipe, set isRecipe to false.`;

const FEEDBACK_SYSTEM = `You turn a home cook's short feedback about a recipe into structured taste signals.
Only include signals the text supports. entityType is one of ingredient, cuisine, flavor, texture, attribute, habit, meal_type.
Scores run from -1 (strong dislike) to 1 (strong like). Mentions of partners or kids go in "household", not in the cook's own signals.
"Great but I'd use less tahini" is a positive sentiment with a decrease adjustment for tahini_quantity, not a dislike of tahini.`;

const PREFERENCE_SYSTEM = `You turn a plain-English food preference into structured preferences for a meal-planning app.
member is "self" unless the sentence is about a partner or kids. Values are short lowercase keys ("blue cheese", "spicy", "asian", "quick weekday"); labels are short display text.
Negative scores mean avoid. Include only what the sentence says.`;

/**
 * Claude-backed provider. Every response is validated against the same Zod schemas the
 * rest of the app uses; on refusal, parse failure or API error we fall back to the local
 * provider for text-based work so the product keeps working.
 */
export class AnthropicAIProvider implements AIProvider {
  readonly name = "anthropic";
  readonly supportsVision = true;
  private readonly client: Anthropic;
  private readonly local = new LocalAIProvider();

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  }

  async extractRecipe(input: RecipeInput): Promise<ExtractionResult> {
    // Structured pages don't need a model at all.
    if (input.kind === "html") {
      const ld = extractJsonLdRecipe(input.html);
      if (ld?.title && ld.ingredients?.length) return this.local.extractRecipe(input);
    }
    try {
      const content: Anthropic.ContentBlockParam[] = [];
      if (input.kind === "image") {
        content.push({ type: "image", source: { type: "base64", media_type: input.mediaType, data: input.base64 } });
        content.push({ type: "text", text: "Extract the recipe shown in this screenshot." });
      } else if (input.kind === "html") {
        const meta = extractMeta(input.html);
        content.push({
          type: "text",
          text: `Source URL: ${input.url}\nPage title: ${meta.title ?? ""}\nPage description / caption: ${meta.description ?? ""}\n\nPage text:\n${htmlToText(input.html)}`,
        });
      } else {
        content.push({ type: "text", text: input.text });
      }
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: 16000,
        system: EXTRACTION_SYSTEM,
        messages: [{ role: "user", content }],
        output_config: { format: zodOutputFormat(RecipeExtraction) },
      });
      if (response.stop_reason === "refusal" || !response.parsed_output) throw new Error("no structured output");
      const x = response.parsed_output;
      if (!x.isRecipe || !x.title) return { draft: null, warnings: ["That doesn't look like a recipe."] };
      const base =
        input.kind === "html"
          ? { sourceUrl: input.url, sourcePlatform: input.platform, imageUrl: extractMeta(input.html).image }
          : input.kind === "text"
            ? { sourceUrl: input.sourceUrl, sourcePlatform: input.platform ?? ("text" as const) }
            : { sourcePlatform: "image" as const };
      const draft = RecipeDraft.safeParse({
        ...base,
        title: x.title,
        description: x.description ?? undefined,
        sourceCreator: x.creator ?? undefined,
        servings: x.servings != null ? Math.round(x.servings) : undefined,
        prepTimeMinutes: x.prepTimeMinutes ?? undefined,
        cookTimeMinutes: x.cookTimeMinutes ?? undefined,
        totalTimeMinutes: x.totalTimeMinutes ?? undefined,
        caloriesPerServing: x.caloriesPerServing != null ? Math.round(x.caloriesPerServing) : undefined,
        proteinGrams: x.proteinGrams != null ? Math.round(x.proteinGrams) : undefined,
        carbsGrams: x.carbsGrams != null ? Math.round(x.carbsGrams) : undefined,
        fatGrams: x.fatGrams != null ? Math.round(x.fatGrams) : undefined,
        cuisine: x.cuisine ?? undefined,
        mealType: x.mealType?.toLowerCase() ?? undefined,
        tags: x.tags.map((t) => t.toLowerCase()).slice(0, 12),
        ingredients: x.ingredients.map(parseIngredientLine).filter((l) => l !== null),
        steps: x.steps.filter(Boolean),
      });
      if (!draft.success) return { draft: null, warnings: ["The recipe looked incomplete."] };
      const warnings: string[] = [];
      if (!draft.data.ingredients.length) warnings.push("We couldn't find the ingredients — add them below.");
      return { draft: draft.data, warnings };
    } catch (error) {
      if (input.kind === "image") throw error;
      console.warn("[ai] extraction via Claude failed, using local parser:", errorMessage(error));
      return this.local.extractRecipe(input);
    }
  }

  generateEmbedding(text: string): Promise<number[]> {
    // Anthropic doesn't offer embeddings; keep the local embedding (same vector space as stored rows).
    return this.local.generateEmbedding(text);
  }

  async interpretFeedback(input: FeedbackInput): Promise<TasteSignals> {
    return this.structured(
      FEEDBACK_SYSTEM,
      `Recipe: ${input.recipeTitle ?? "unknown"}\nOverall reaction: ${input.reaction ?? "none"}\nFeedback: ${input.comment}`,
      TasteSignals,
      () => this.local.interpretFeedback(input),
    );
  }

  async parsePreferenceStatement(text: string): Promise<PreferenceStatement> {
    return this.structured(PREFERENCE_SYSTEM, text, PreferenceStatement, () => this.local.parsePreferenceStatement(text));
  }

  private async structured<T extends z.ZodType>(system: string, text: string, schema: T, fallback: () => Promise<z.infer<T>>): Promise<z.infer<T>> {
    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: text }],
        output_config: { format: zodOutputFormat(schema) },
      });
      if (response.stop_reason === "refusal" || !response.parsed_output) return fallback();
      const checked = schema.safeParse(response.parsed_output);
      return checked.success ? checked.data : fallback();
    } catch (error) {
      console.warn("[ai] Claude call failed, using local rules:", errorMessage(error));
      return fallback();
    }
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Anthropic.APIError) return `${error.status ?? ""} ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}
