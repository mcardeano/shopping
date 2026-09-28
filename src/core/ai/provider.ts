/**
 * AIProvider — the only way product code talks to "AI".
 * UI never calls a model; services call an AIProvider, and every model output is
 * validated with Zod before it touches the database.
 */
import type { PreferenceStatement, Reaction, RecipeDraft, TasteSignals } from "../domain/schemas";

export type RecipeInput =
  | { kind: "text"; text: string; sourceUrl?: string; platform?: RecipeDraft["sourcePlatform"] }
  | { kind: "html"; html: string; url: string; platform: RecipeDraft["sourcePlatform"] }
  | { kind: "image"; base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" };

export type ExtractionResult = { draft: RecipeDraft | null; warnings: string[] };

export type FeedbackInput = { comment: string; reaction?: Reaction | null; recipeTitle?: string };

export interface AIProvider {
  readonly name: string;
  /** True when this provider can read images (screenshots, photos). */
  readonly supportsVision: boolean;
  extractRecipe(input: RecipeInput): Promise<ExtractionResult>;
  generateEmbedding(text: string): Promise<number[]>;
  interpretFeedback(input: FeedbackInput): Promise<TasteSignals>;
  parsePreferenceStatement(text: string): Promise<PreferenceStatement>;
}

export class AIUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIUnavailableError";
  }
}
