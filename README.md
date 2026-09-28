# Larder — your food memory

A mobile-first prototype of an AI recipe memory, meal planner and grocery copilot.

> **Discover → Save → Understand → Remember → Recommend → Plan → Shop**

Larder remembers what you save, cook and buy. It also remembers what your household likes and what's probably already at home. It uses that memory to answer *"What should I cook?"*, plan the week, and keep one shopping list that you can add to in plain English.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

No setup needed. The app runs on an **embedded Postgres (PGlite)** with the same migrations, pgvector and Row Level Security as Supabase. The database lives in `./.data` and is created on first start with a **demo household**:

- Tap **"Explore with a demo household"** on the sign-in screen, or sign in as `demo@larder.app` / `larder-demo`.
- Or create your own account. You can start with the 25 sample recipes, with no history attached.

```bash
npm test             # unit tests + end-to-end scenario against an in-memory database
npm run typecheck
npm run build && npm start
npm run db:reset     # wipe the local database (recreated on next start)
```

Optional: set `ANTHROPIC_API_KEY` (see `.env.example`) to use Claude for:

- reading screenshots;
- extracting recipes from messy pages;
- interpreting feedback and preferences.

Without a key, everything else works through the built-in rule-based provider.

## Try the core flow

1. **Home** → ask *"Something Asian with salmon under 30 minutes"*. You get three picks, each with a one-sentence reason.
2. Open **Miso-Glazed Salmon Rice Bowl** → **Add to plan** → Thursday.
3. Open **Chicken Shawarma Bowl** → **Add to plan** → Friday.
4. **Shopping** now shows:
   - salmon, cucumber (merged from both recipes), chicken thighs, Greek yogurt and so on under *Need to buy*;
   - soy sauce and olive oil under *Probably already at home*;
   - garlic and miso under *Check at home*.
5. Type *"Dishwasher tablets, bananas and toothpaste"* into the list. The three items appear, sorted into their aisles and marked *Added by you*.
6. Remove Friday from the plan. The shawarma ingredients disappear, but everything you added by hand stays.

Other things to try:

- "we're out of olive oil" or "add everything for the salmon recipe" in the Home box.
- In the list: "Get another Greek yogurt", then "Greek yoghurt" (merged, ×2).
- Library searches: *things I saved but haven't cooked*, *recipes my kids liked*, *similar to the Korean beef bowl*.
- *Plan my week* → 4 dinners, *"quick meals, make Friday more indulgent"*.
- **Your Taste** (tap the avatar) → *"I don't really like blue cheese"*.

## Architecture

```
src/
  core/        framework-agnostic domain — portable to React Native as-is
    domain/      types + Zod schemas (every AI output and API body is validated)
    catalog/     ingredient & non-food product catalogue (aliases, aisles, pantry priors, macros)
    text/        quantity/unit parsing and arithmetic
    services/    pure logic: normalization, recipe parsing, enrichment, embeddings,
                 shopping intent, list consolidation, pantry probability,
                 taste inference, recommendation scoring, meal planning, search
    ai/          AIProvider interface + LocalAIProvider
    grocery/     GroceryProvider interface, mock retailer, product matching, retailer links
  server/      Node-only: db drivers, repositories (SQL), services that orchestrate core
               logic, auth, storage, Anthropic provider, seeds
  app/         Next.js App Router: screens + thin JSON API routes (/api/*)
  components/  RecipeCard, RecipeGrid, RecipeImage, IngredientRow, FilterChip (Chip),
               PreferenceChip, MealPlanCard, RecommendationCard, ShoppingListItem,
               QuickAddInput, BottomNavigation, AIInput, EmptyState, RatingPrompt, SourceBadge…
supabase/migrations/   the schema (Postgres + pgvector + RLS), used by both PGlite and Supabase
tests/                 core unit tests + end-to-end scenario test
```

**Why Next.js rather than Expo, for now.** A web prototype was much faster to build and to verify end to end in this environment. The mobile-first layout, the JSON API (`/api/*`) and the pure `src/core` modules are designed so a React Native / Expo client can reuse the domain code and talk to the same API. The web app is an installable PWA with a Web Share Target, so *Share → Larder* from Instagram works on Android today. A native share extension would call the same `/add?url=…&text=…` entry point.

### The four memories

| Memory | Where |
| --- | --- |
| **Recipe memory** | `recipes`, `recipe_ingredients`, `recipe_steps`, `recipe_imports` (pending → processing → needs_review → complete/failed), `recipe_interactions`, `recipe_feedback` (original text + validated signals) |
| **Taste memory** | `taste_preferences`: `source` separates *explicit* from *inferred*; dismissed inferences are remembered and never come back. Recomputed by `server/services/taste.ts` from saves, opens, cooks, favourites, ratings, feedback, rejections and household reactions. |
| **Purchase memory** | `purchases` / `purchase_items`. Checking an item off the list records a purchase, so shopping itself teaches repurchase intervals and preferred brands. |
| **Pantry probability** | `core/services/pantry.ts`. Logistic decay from the last purchase against the learned (or typical) repurchase interval, blended with catalogue priors. Explicit "have it / need it" corrections override it; perishables used in recent cooking are discounted. The result is *probably have / check at home / need to buy*. |

### Shopping list model

Each `shopping_list_item` has one or more `shopping_list_item_sources` rows: manual, recipe, meal plan, pantry prediction or repeat purchase. **Quantities live on the sources.**

- Removing a recipe or re-planning only deletes that recipe's sources.
- An item is removed only when no sources are left, so a manual item can never disappear because of a plan change.
- Quantities from different sources merge by dimension (`2 + 1 + 3 tbsp → 6 tbsp`).
- Duplicates are caught by canonical name, spelling and brand (*Fage yogurt → Greek yogurt*), and generic words merge into a specific item already on the list (*yogurt for breakfast*).
- Ingredients and non-food products are separate concepts (`ingredients` vs `shopping_products`).

### Recommendations

Scoring is interpretable, with no hidden ML (`core/services/recommendation.ts`):

`0.30 taste · 0.20 pantry · 0.15 history · 0.15 request · 0.10 time · 0.05 nutrition · 0.05 novelty`

- Household, recency and rejection adjustments are applied on top.
- Hard filters cover time, calories, exclusions and cuisine.
- A light diversity pass makes sure you don't get three salmon bowls.
- Each pick's reason is built from the factors that actually drove its score, for example *"You've loved three similar salmon recipes, and you probably already have rice and soy sauce."* Scores are never shown.

The **meal planner** optimises the whole week (greedy fill, then local search). It rewards shared perishable ingredients (less waste) and penalises repeated proteins or cuisines. It also handles day-specific requests (*Friday more indulgent*), day ranges, protein coverage and locked meals.

### Semantic search

Each recipe gets a rich descriptive text, which is embedded into `recipes.embedding vector(256)` and searched with pgvector. The default embedder is local (`core/services/embedding.ts`): feature hashing plus a culinary concept lexicon, with negation handling (*"comforting but not heavy"*). It runs offline and deterministically.

Natural-language library queries are split into structured filters (source, date, cooked, kids liked, time, cuisine, ingredients, *similar to …*) plus semantic ranking of whatever is left. A hosted embedding model can be dropped in behind `AIProvider.generateEmbedding`; that needs a migration to its vector size.

### Provider seams

| Interface | Implementations now | Later |
| --- | --- | --- |
| `AIProvider` | `LocalAIProvider` (rules), `AnthropicAIProvider` (Claude, Zod-validated structured outputs, local fallback on refusal/error) | other models |
| Recipe import | schema.org JSON-LD, OpenGraph/social captions, pasted text, screenshots (vision) | share extensions, video |
| `GroceryProvider` | `MockGroceryProvider` + a realistic local catalogue; public retailer search links (Continente, Auchan, Tesco, Instacart) | official retailer APIs / basket creation |
| Auth | local email+password (scrypt, signed cookie), Supabase Auth (GoTrue REST) | |
| `StorageProvider` | local disk (`.data/uploads`) | Supabase Storage |
| Database | PGlite (embedded) or any Postgres via `DATABASE_URL` | |

### Privacy

- Every user query runs inside a transaction as the `authenticated` role, with Supabase-style JWT claims (`auth.uid()`). Row Level Security therefore applies on both drivers.
- Policies scope every row to the caller's household. Reference data is read-only.
- The scenario test confirms that a second household sees nothing.
- Inferred preferences are visible, confirmable and removable, and *Delete my data* wipes a household.

## Using Supabase

1. Create a project and enable the `vector` extension.
2. Run `supabase/migrations/*.sql`, for example with `supabase db push`.
3. Set `DATABASE_URL` to the pooled connection string and `SESSION_SECRET`.
4. For Supabase Auth, set `AUTH_PROVIDER=supabase`, `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

Reference data is seeded on boot. The demo account only exists in local mode.

*The Supabase path uses the same SQL and RLS as the tested local path, but it has not been run against a live Supabase project in this environment.*

## Known limitations

- **Seed photography:** seed recipes use generated "plate" covers built from their real ingredients, because stock-photo hosts weren't reachable while this was built. Add URLs in `src/seed/images.ts`. Imported recipes keep their original images.
- **Social imports:** Instagram and TikTok often block automated page reads. When that happens the app asks for the caption text instead, and still keeps the link.
- **Rule-based understanding:** without an API key, screenshots can't be read, and language understanding is rule-based. It is good at everyday phrasing, but less flexible than a model.
- **No real baskets yet:** supermarket basket creation is not implemented (no official APIs are assumed). Export and deep links cover the hand-off.
- **Household taste:** household members' preferences are inferred only from reactions recorded in feedback.
