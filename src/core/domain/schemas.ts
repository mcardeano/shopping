/**
 * Validation schemas for everything that crosses a trust boundary:
 * AI outputs, API request bodies, JSON stored in the database.
 */
import { z } from "zod";
import { SHOPPING_CATEGORIES } from "./categories";

export const SourcePlatform = z.enum(["instagram", "tiktok", "website", "manual", "image", "text", "generated"]);
export type SourcePlatform = z.infer<typeof SourcePlatform>;

export const Reaction = z.enum(["loved", "good", "not_for_me"]);
export type Reaction = z.infer<typeof Reaction>;

export const Difficulty = z.enum(["easy", "medium", "hard"]);

export const IngredientLineDraft = z.object({
  rawText: z.string().min(1).max(300),
  name: z.string().min(1).max(120),
  amount: z.number().positive().max(100000).optional(),
  unit: z.string().max(20).optional(),
  preparation: z.string().max(200).optional(),
  optional: z.boolean().default(false),
});
export type IngredientLineDraft = z.infer<typeof IngredientLineDraft>;

/** A structured recipe that has not been saved yet (import result or manual entry). */
export const RecipeDraft = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  sourceUrl: z.string().url().max(2000).optional(),
  sourcePlatform: SourcePlatform.optional(),
  sourceCreator: z.string().max(120).optional(),
  imageUrl: z.string().max(2_000_000).optional(), // http(s) URL or data: URL for uploaded screenshots
  servings: z.number().int().min(1).max(50).optional(),
  prepTimeMinutes: z.number().int().min(0).max(2000).optional(),
  cookTimeMinutes: z.number().int().min(0).max(2000).optional(),
  totalTimeMinutes: z.number().int().min(0).max(4000).optional(),
  caloriesPerServing: z.number().int().min(0).max(5000).optional(),
  proteinGrams: z.number().int().min(0).max(500).optional(),
  carbsGrams: z.number().int().min(0).max(1000).optional(),
  fatGrams: z.number().int().min(0).max(500).optional(),
  nutritionIsEstimate: z.boolean().default(true),
  cuisine: z.string().max(60).optional(),
  mealType: z.string().max(40).optional(),
  techniques: z.array(z.string().max(40)).max(12).default([]),
  flavors: z.array(z.string().max(40)).max(12).default([]),
  dietary: z.array(z.string().max(40)).max(12).default([]),
  tags: z.array(z.string().max(40)).max(20).default([]),
  difficulty: Difficulty.optional(),
  ingredients: z.array(IngredientLineDraft).max(80).default([]),
  steps: z.array(z.string().min(1).max(2000)).max(60).default([]),
  notes: z.string().max(4000).optional(),
});
export type RecipeDraft = z.infer<typeof RecipeDraft>;

/** What the AI returns when extracting a recipe — deliberately loose, then normalized. */
export const RecipeExtraction = z.object({
  isRecipe: z.boolean(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  creator: z.string().nullable(),
  servings: z.number().nullable(),
  prepTimeMinutes: z.number().nullable(),
  cookTimeMinutes: z.number().nullable(),
  totalTimeMinutes: z.number().nullable(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
  cuisine: z.string().nullable(),
  mealType: z.string().nullable(),
  tags: z.array(z.string()),
  caloriesPerServing: z.number().nullable(),
  proteinGrams: z.number().nullable(),
  carbsGrams: z.number().nullable(),
  fatGrams: z.number().nullable(),
});
export type RecipeExtraction = z.infer<typeof RecipeExtraction>;

// ── Taste ────────────────────────────────────────────────────────────────────

export const TasteEntityType = z.enum(["ingredient", "cuisine", "recipe", "technique", "texture", "flavor", "meal_type", "attribute", "habit"]);
export type TasteEntityType = z.infer<typeof TasteEntityType>;

export const PreferenceSource = z.enum(["explicit", "saved_recipe", "cooked_recipe", "purchase", "feedback", "search", "recommendation_rejection", "seed"]);
export type PreferenceSource = z.infer<typeof PreferenceSource>;

export const HouseholdRole = z.enum(["self", "partner", "child", "other"]);
export type HouseholdRole = z.infer<typeof HouseholdRole>;

export const TasteSignal = z.object({
  entityType: TasteEntityType,
  value: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  /** -1 (strong dislike) … 1 (strong like). */
  score: z.number().min(-1).max(1),
});
export type TasteSignal = z.infer<typeof TasteSignal>;

/** Structured interpretation of free-text recipe feedback. The original text is always kept alongside. */
export const TasteSignals = z.object({
  sentiment: z.enum(["positive", "mixed", "negative", "neutral"]),
  signals: z.array(TasteSignal).max(20),
  adjustments: z
    .array(z.object({ attribute: z.string().max(60), direction: z.enum(["increase", "decrease"]) }))
    .max(10),
  household: z.array(z.object({ member: z.enum(["partner", "kids", "child", "everyone"]), reaction: Reaction })).max(6),
});
export type TasteSignals = z.infer<typeof TasteSignals>;

/** Result of parsing a plain-English preference statement on the Taste screen. */
export const PreferenceStatement = z.object({
  member: z.enum(["self", "partner", "kids"]).default("self"),
  preferences: z.array(TasteSignal).min(0).max(10),
});
export type PreferenceStatement = z.infer<typeof PreferenceStatement>;

// ── Shopping ────────────────────────────────────────────────────────────────

export const ShoppingCategorySchema = z.enum(SHOPPING_CATEGORIES);

export const ItemStatus = z.enum(["need_to_buy", "check_at_home", "probably_have", "purchased"]);
export type ItemStatus = z.infer<typeof ItemStatus>;

export const ItemSourceType = z.enum(["manual", "recipe", "meal_plan", "pantry_prediction", "repeat_purchase"]);
export type ItemSourceType = z.infer<typeof ItemSourceType>;

export const ParsedShoppingItem = z.object({
  rawText: z.string().min(1).max(200),
  name: z.string().min(1).max(120),
  quantity: z.number().positive().max(10000).optional(),
  unit: z.string().max(20).optional(),
  note: z.string().max(200).optional(),
  /** "another yogurt" / "more bananas": add to what's already on the list. */
  increment: z.boolean().default(false),
});
export type ParsedShoppingItem = z.infer<typeof ParsedShoppingItem>;

export const ShoppingAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add_items"), items: z.array(ParsedShoppingItem).min(1).max(40) }),
  z.object({ type: z.literal("add_recipe"), recipeQuery: z.string().min(1).max(200) }),
  z.object({ type: z.literal("find_recipes"), using: z.array(z.string()).max(10) }),
  z.object({ type: z.literal("show_list") }),
]);
export type ShoppingAction = z.infer<typeof ShoppingAction>;

// ── API request bodies ──────────────────────────────────────────────────────

export const QuickAddBody = z.object({ text: z.string().trim().min(1).max(500) });

export const UpdateShoppingItemBody = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    quantity: z.number().positive().max(10000).nullable(),
    unit: z.string().max(20).nullable(),
    note: z.string().max(200).nullable(),
    category: ShoppingCategorySchema,
    status: ItemStatus,
    checked: z.boolean(),
    preferredRetailProductId: z.string().uuid().nullable(),
  })
  .partial();

export const FeedbackBody = z.object({
  reaction: Reaction.optional(),
  comment: z.string().trim().max(2000).optional(),
  memberId: z.string().uuid().optional(),
});

export const RecommendBody = z.object({
  query: z.string().max(500).default(""),
  mood: z.string().max(40).optional(),
  maxMinutes: z.number().int().min(5).max(600).optional(),
  useUp: z.string().max(300).optional(),
  exclude: z.array(z.string().uuid()).max(100).default([]),
  limit: z.number().int().min(1).max(12).default(3),
});
export type RecommendBody = z.infer<typeof RecommendBody>;

export const PlanWeekBody = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().min(1).max(7),
  brief: z.string().max(500).default(""),
});

export const ImportBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("url"), url: z.string().trim().url().max(2000) }),
  z.object({ type: z.literal("text"), text: z.string().trim().min(10).max(20000) }),
  z.object({
    type: z.literal("image"),
    imageBase64: z.string().min(100).max(15_000_000),
    mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  }),
]);
export type ImportBody = z.infer<typeof ImportBody>;

export const TasteStatementBody = z.object({ text: z.string().trim().min(2).max(500) });

export const UpdatePreferenceBody = z.object({
  status: z.enum(["active", "confirmed", "dismissed"]).optional(),
  label: z.string().trim().min(1).max(80).optional(),
  score: z.number().min(-1).max(1).optional(),
});
