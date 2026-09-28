/**
 * Domain read models. Plain serializable objects (no Date instances) so they can
 * cross the server/client boundary and be reused unchanged by a React Native client.
 */
import type { ShoppingCategory } from "./categories";
import type { HouseholdRole, ItemSourceType, ItemStatus, PreferenceSource, Reaction, SourcePlatform, TasteEntityType, TasteSignals } from "./schemas";

export type ISODate = string;

export type HouseholdMember = {
  id: string;
  name: string;
  role: HouseholdRole;
  userId: string | null;
};

export type RecipeIngredient = {
  id: string;
  position: number;
  rawText: string;
  ingredientId: string | null;
  normalizedName: string;
  amount: number | null;
  unit: string | null;
  preparation: string | null;
  optional: boolean;
};

export type Recipe = {
  id: string;
  householdId: string;
  userId: string;
  title: string;
  description: string | null;
  sourceUrl: string | null;
  sourcePlatform: SourcePlatform | null;
  sourceCreator: string | null;
  imageUrl: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  caloriesPerServing: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  nutritionIsEstimate: boolean;
  cuisine: string | null;
  mealType: string | null;
  techniques: string[];
  flavors: string[];
  dietary: string[];
  tags: string[];
  difficulty: "easy" | "medium" | "hard" | null;
  rating: Reaction | null;
  isFavorite: boolean;
  timesCooked: number;
  lastCookedAt: ISODate | null;
  openCount: number;
  notes: string | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  ingredients: RecipeIngredient[];
  steps: string[];
  /** Household reactions summarised from feedback, e.g. { kids: "loved" }. */
  household: HouseholdReaction[];
};

export type HouseholdReaction = { memberId: string; memberName: string; role: HouseholdRole; reaction: Reaction };

export type RecipeFeedback = {
  id: string;
  recipeId: string;
  memberId: string | null;
  memberName: string | null;
  reaction: Reaction | null;
  comment: string | null;
  signals: TasteSignals | null;
  createdAt: ISODate;
};

export type TastePreference = {
  id: string;
  memberId: string | null;
  entityType: TasteEntityType;
  value: string;
  label: string;
  score: number;
  source: PreferenceSource;
  confidence: number;
  evidenceCount: number;
  status: "active" | "confirmed" | "dismissed";
  originalText: string | null;
  updatedAt: ISODate;
};

export type ShoppingItemSource = {
  id: string;
  type: ItemSourceType;
  sourceId: string | null;
  label: string | null;
  quantity: number | null;
  unit: string | null;
};

export type ShoppingListItem = {
  id: string;
  rawText: string;
  normalizedName: string;
  displayName: string;
  ingredientId: string | null;
  shoppingProductId: string | null;
  preferredRetailProductId: string | null;
  category: ShoppingCategory;
  note: string | null;
  status: ItemStatus;
  statusOverridden: boolean;
  checked: boolean;
  checkedAt: ISODate | null;
  createdAt: ISODate;
  sources: ShoppingItemSource[];
  /** Pre-formatted merged quantity, e.g. "6 tbsp" or "2". Null when unknown. */
  quantityLabel: string | null;
  /** Short provenance line: "Meal plan", "Added by you", "Usually buy weekly". */
  sourceLabel: string;
  pantryProbability: number | null;
};

export type MealPlanItem = {
  id: string;
  day: ISODate; // yyyy-mm-dd
  mealType: string;
  recipeId: string;
  locked: boolean;
  reason: string | null;
  servings: number | null;
};

export type MealPlan = {
  id: string | null;
  weekStart: ISODate;
  brief: string | null;
  items: MealPlanItem[];
};

export type PantryStatus = "probably_have" | "check_at_home" | "need_to_buy";

export type PantryEstimate = {
  name: string;
  probability: number;
  status: PantryStatus;
  lastPurchasedAt: ISODate | null;
  typicalIntervalDays: number | null;
  basis: string;
};

export type Recommendation = {
  recipeId: string;
  reason: string;
  /** Internal only — never rendered. */
  score: number;
  matchedPantry: string[];
};

export type ReplenishmentSuggestion = {
  name: string;
  display: string;
  category: ShoppingCategory;
  reason: string;
  intervalDays: number;
  daysSinceLast: number;
};
