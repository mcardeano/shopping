-- Larder — personal food memory
-- Initial schema. Runs unchanged on Supabase and on the embedded PGlite database
-- (which gets a tiny `auth` stub, see supabase/local/auth_stub.sql).
--
-- Tenancy model: every personal row belongs to a household. A user reaches a
-- household through household_members.user_id. RLS policies only ever compare
-- against auth.uid(); the server never bypasses RLS for user-scoped reads/writes.

create extension if not exists vector;

-- ─────────────────────────────────────────────────────────────────────────────
-- Households
-- ─────────────────────────────────────────────────────────────────────────────

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Home',
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade, -- null for members without an account (kids, partner not signed up)
  name text not null,
  role text not null check (role in ('self', 'partner', 'child', 'other')),
  created_at timestamptz not null default now()
);
create index household_members_user_idx on household_members (user_id);
create index household_members_household_idx on household_members (household_id);

create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  display_name text not null,
  email text,
  created_at timestamptz not null default now()
);

-- Membership check used by every policy. SECURITY DEFINER so it can read
-- household_members without recursing through that table's own policy.
create or replace function is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

-- Creates profile + household + "self" member on first sign-in. Idempotent.
create or replace function bootstrap_user(p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_household uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  select household_id into v_household from profiles where user_id = v_uid;
  if v_household is not null then
    return v_household;
  end if;
  insert into households (name, created_by) values ('Home', v_uid) returning id into v_household;
  insert into household_members (household_id, user_id, name, role) values (v_household, v_uid, 'Me', 'self');
  insert into profiles (user_id, household_id, display_name, email)
    values (v_uid, v_household, coalesce(nullif(p_display_name, ''), 'there'), (select email from auth.users where id = v_uid));
  insert into shopping_lists (household_id, name, is_active) values (v_household, 'Shopping', true);
  return v_household;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Shared reference data (readable by every signed-in user, written by admins)
-- ─────────────────────────────────────────────────────────────────────────────

-- Ingredient: something you cook with. Separate from ShoppingProduct (below).
create table ingredients (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique,
  category text not null,
  default_unit text,
  is_pantry_staple boolean not null default false,
  typical_repurchase_days integer, -- how long a typical pack lasts
  created_at timestamptz not null default now()
);

create table ingredient_aliases (
  alias text primary key,
  ingredient_id uuid not null references ingredients (id) on delete cascade
);

-- ShoppingProduct: a supermarket thing that is not a recipe ingredient
-- (toilet paper, dishwasher tablets, nappies, shampoo...).
create table shopping_products (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique,
  category text not null,
  typical_repurchase_days integer,
  created_at timestamptz not null default now()
);

create table shopping_product_aliases (
  alias text primary key,
  shopping_product_id uuid not null references shopping_products (id) on delete cascade
);

-- RetailProduct: a concrete SKU at a concrete retailer, filled by GroceryProvider implementations.
create table retail_products (
  id uuid primary key default gen_random_uuid(),
  provider text not null,              -- 'mock', 'continente', 'tesco', ...
  external_id text not null,
  name text not null,
  brand text,
  ingredient_id uuid references ingredients (id) on delete set null,
  shopping_product_id uuid references shopping_products (id) on delete set null,
  pack_size numeric,
  pack_unit text,
  price numeric(10, 2),
  currency text not null default 'EUR',
  url text,
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Recipe memory
-- ─────────────────────────────────────────────────────────────────────────────

create table recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade, -- who saved it

  title text not null,
  description text,

  source_url text,                     -- always preserved when known
  source_platform text check (source_platform in ('instagram', 'tiktok', 'website', 'manual', 'image', 'text', 'generated')),
  source_creator text,
  image_url text,

  servings integer,
  prep_time_minutes integer,
  cook_time_minutes integer,
  total_time_minutes integer,

  calories_per_serving integer,
  protein_grams integer,
  carbs_grams integer,
  fat_grams integer,
  nutrition_is_estimate boolean not null default true,

  cuisine text,
  meal_type text,
  techniques text[] not null default '{}',
  flavors text[] not null default '{}',
  dietary text[] not null default '{}',
  tags text[] not null default '{}',
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),

  rating text check (rating in ('loved', 'good', 'not_for_me')), -- latest own reaction
  is_favorite boolean not null default false,
  times_cooked integer not null default 0,
  last_cooked_at timestamptz,
  open_count integer not null default 0,
  notes text,

  semantic_text text,                  -- the rich description that is embedded
  embedding vector(256),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recipes_household_idx on recipes (household_id, created_at desc);

create table recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes (id) on delete cascade,
  position integer not null,
  text text not null
);
create index recipe_steps_recipe_idx on recipe_steps (recipe_id, position);

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes (id) on delete cascade,
  position integer not null,
  raw_text text not null,
  ingredient_id uuid references ingredients (id) on delete set null,
  normalized_name text not null,
  amount numeric,
  unit text,
  preparation text,
  optional boolean not null default false
);
create index recipe_ingredients_recipe_idx on recipe_ingredients (recipe_id, position);
create index recipe_ingredients_name_idx on recipe_ingredients (normalized_name);

create table recipe_imports (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  input_type text not null check (input_type in ('url', 'image', 'text', 'manual', 'share')),
  input_text text,                     -- URL or pasted text (never the image bytes)
  status text not null check (status in ('pending', 'processing', 'needs_review', 'complete', 'failed')),
  draft jsonb,                         -- validated RecipeDraft (Zod) awaiting confirmation
  warnings text[] not null default '{}',
  error text,
  recipe_id uuid references recipes (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table recipe_interactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid references recipes (id) on delete cascade,
  type text not null check (type in ('saved', 'opened', 'cooked', 'favorited', 'unfavorited', 'rejected', 'not_interested', 'planned', 'swapped_out', 'searched')),
  query text,                          -- for 'searched'
  created_at timestamptz not null default now()
);
create index recipe_interactions_idx on recipe_interactions (household_id, created_at desc);

create table recipe_feedback (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  recipe_id uuid not null references recipes (id) on delete cascade,
  author_user_id uuid not null references auth.users (id) on delete cascade,
  household_member_id uuid references household_members (id) on delete cascade, -- whose reaction this is
  reaction text check (reaction in ('loved', 'good', 'not_for_me')),
  comment text,                        -- original free text, always retained
  signals jsonb,                       -- validated TasteSignals (Zod) derived from the comment
  created_at timestamptz not null default now()
);
create index recipe_feedback_recipe_idx on recipe_feedback (recipe_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Taste memory
-- ─────────────────────────────────────────────────────────────────────────────

create table taste_preferences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  household_member_id uuid references household_members (id) on delete cascade, -- null = the user themself
  entity_type text not null check (entity_type in ('ingredient', 'cuisine', 'recipe', 'technique', 'texture', 'flavor', 'meal_type', 'attribute', 'habit')),
  entity_id uuid,
  value text not null,                 -- normalized key, e.g. 'salmon', 'asian', 'high protein'
  label text not null,                 -- display text, e.g. 'Soy & sesame'
  score real not null check (score between -1 and 1), -- negative = avoid
  source text not null check (source in ('explicit', 'saved_recipe', 'cooked_recipe', 'purchase', 'feedback', 'search', 'recommendation_rejection', 'seed')),
  confidence real not null default 0.5 check (confidence between 0 and 1),
  evidence_count integer not null default 1,
  status text not null default 'active' check (status in ('active', 'confirmed', 'dismissed')),
  original_text text,                  -- free text that produced this preference, if any
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, household_member_id, entity_type, value)
);
create unique index taste_preferences_self_unique on taste_preferences (household_id, entity_type, value) where household_member_id is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Meal planning
-- ─────────────────────────────────────────────────────────────────────────────

create table meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  week_start date not null,
  brief text,                          -- the last "anything to consider?" prompt
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, week_start)
);

create table meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references meal_plans (id) on delete cascade,
  day date not null,
  meal_type text not null default 'dinner',
  recipe_id uuid not null references recipes (id) on delete cascade,
  servings integer,
  locked boolean not null default false,
  reason text,
  created_at timestamptz not null default now(),
  unique (meal_plan_id, day, meal_type)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Shopping
-- ─────────────────────────────────────────────────────────────────────────────

create table shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null default 'Shopping',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index shopping_lists_one_active on shopping_lists (household_id) where is_active;

create table shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references shopping_lists (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  raw_text text not null,
  normalized_name text not null,       -- dedupe key
  display_name text not null,
  ingredient_id uuid references ingredients (id) on delete set null,
  shopping_product_id uuid references shopping_products (id) on delete set null,
  preferred_retail_product_id uuid references retail_products (id) on delete set null,
  category text not null default 'Other',
  note text,
  quantity_override numeric,           -- set when the user edits the quantity by hand
  unit_override text,
  status text not null default 'need_to_buy' check (status in ('need_to_buy', 'check_at_home', 'probably_have', 'purchased')),
  status_overridden boolean not null default false, -- the user moved it; don't re-classify
  checked boolean not null default false,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index shopping_list_items_dedupe on shopping_list_items (shopping_list_id, normalized_name);

-- Each reason an item is on the list. Quantities live here, per source, so that
-- removing a recipe/plan only subtracts that recipe's contribution and an item
-- disappears only when it has no sources left. Manual sources are never removed
-- by plan changes.
create table shopping_list_item_sources (
  id uuid primary key default gen_random_uuid(),
  shopping_list_item_id uuid not null references shopping_list_items (id) on delete cascade,
  source_type text not null check (source_type in ('manual', 'recipe', 'meal_plan', 'pantry_prediction', 'repeat_purchase')),
  source_id uuid,                      -- recipe id / meal_plan_item id
  label text,                          -- 'Miso Salmon Bowl', 'for the kids'
  quantity numeric,
  unit text,
  created_at timestamptz not null default now()
);
create index shopping_list_item_sources_item_idx on shopping_list_item_sources (shopping_list_item_id);
create index shopping_list_item_sources_source_idx on shopping_list_item_sources (source_type, source_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Purchase memory & pantry probability
-- ─────────────────────────────────────────────────────────────────────────────

create table purchases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  retailer text not null,
  source text not null check (source in ('shopping_list', 'receipt', 'retailer_import', 'manual', 'seed')),
  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index purchases_household_idx on purchases (household_id, purchased_at desc);

create table purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  retailer text not null,
  raw_name text not null,
  normalized_name text,
  ingredient_id uuid references ingredients (id) on delete set null,
  shopping_product_id uuid references shopping_products (id) on delete set null,
  retail_product_id uuid references retail_products (id) on delete set null,
  brand text,
  quantity numeric,
  package_size numeric,
  package_unit text,
  unit_price numeric(10, 2),
  total_price numeric(10, 2)
);
create index purchase_items_household_name_idx on purchase_items (household_id, normalized_name);

-- Explicit "I have it" / "I'm out" corrections. The strongest pantry signal.
create table pantry_corrections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  normalized_name text not null,
  has_item boolean not null,
  created_at timestamptz not null default now()
);
create index pantry_corrections_idx on pantry_corrections (household_id, normalized_name, created_at desc);

-- Cached output of PantryEstimationService (recomputable at any time).
create table pantry_estimates (
  household_id uuid not null references households (id) on delete cascade,
  normalized_name text not null,
  probability real not null check (probability between 0 and 1),
  last_purchased_at timestamptz,
  typical_interval_days integer,
  basis text not null,
  updated_at timestamptz not null default now(),
  primary key (household_id, normalized_name)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

alter table households enable row level security;
alter table household_members enable row level security;
alter table profiles enable row level security;
alter table ingredients enable row level security;
alter table ingredient_aliases enable row level security;
alter table shopping_products enable row level security;
alter table shopping_product_aliases enable row level security;
alter table retail_products enable row level security;
alter table recipes enable row level security;
alter table recipe_steps enable row level security;
alter table recipe_ingredients enable row level security;
alter table recipe_imports enable row level security;
alter table recipe_interactions enable row level security;
alter table recipe_feedback enable row level security;
alter table taste_preferences enable row level security;
alter table meal_plans enable row level security;
alter table meal_plan_items enable row level security;
alter table shopping_lists enable row level security;
alter table shopping_list_items enable row level security;
alter table shopping_list_item_sources enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table pantry_corrections enable row level security;
alter table pantry_estimates enable row level security;

-- Households & members
create policy households_rw on households for all to authenticated
  using (is_household_member(id)) with check (created_by = auth.uid() or is_household_member(id));
create policy household_members_rw on household_members for all to authenticated
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy profiles_self on profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reference data: read-only for users
create policy ingredients_read on ingredients for select to authenticated using (true);
create policy ingredient_aliases_read on ingredient_aliases for select to authenticated using (true);
create policy shopping_products_read on shopping_products for select to authenticated using (true);
create policy shopping_product_aliases_read on shopping_product_aliases for select to authenticated using (true);
create policy retail_products_read on retail_products for select to authenticated using (true);

-- Household-scoped tables
create policy recipes_rw on recipes for all to authenticated
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy recipe_imports_rw on recipe_imports for all to authenticated
  using (is_household_member(household_id)) with check (is_household_member(household_id) and user_id = auth.uid());
create policy recipe_interactions_rw on recipe_interactions for all to authenticated
  using (is_household_member(household_id)) with check (is_household_member(household_id) and user_id = auth.uid());
create policy recipe_feedback_rw on recipe_feedback for all to authenticated
  using (is_household_member(household_id)) with check (is_household_member(household_id) and author_user_id = auth.uid());
create policy taste_preferences_rw on taste_preferences for all to authenticated
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy meal_plans_rw on meal_plans for all to authenticated
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy shopping_lists_rw on shopping_lists for all to authenticated
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy shopping_list_items_rw on shopping_list_items for all to authenticated
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy purchases_rw on purchases for all to authenticated
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy purchase_items_rw on purchase_items for all to authenticated
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy pantry_corrections_rw on pantry_corrections for all to authenticated
  using (is_household_member(household_id)) with check (is_household_member(household_id));
create policy pantry_estimates_rw on pantry_estimates for all to authenticated
  using (is_household_member(household_id)) with check (is_household_member(household_id));

-- Child tables inherit access from their parent
create policy recipe_steps_rw on recipe_steps for all to authenticated
  using (exists (select 1 from recipes r where r.id = recipe_id and is_household_member(r.household_id)))
  with check (exists (select 1 from recipes r where r.id = recipe_id and is_household_member(r.household_id)));
create policy recipe_ingredients_rw on recipe_ingredients for all to authenticated
  using (exists (select 1 from recipes r where r.id = recipe_id and is_household_member(r.household_id)))
  with check (exists (select 1 from recipes r where r.id = recipe_id and is_household_member(r.household_id)));
create policy meal_plan_items_rw on meal_plan_items for all to authenticated
  using (exists (select 1 from meal_plans p where p.id = meal_plan_id and is_household_member(p.household_id)))
  with check (exists (select 1 from meal_plans p where p.id = meal_plan_id and is_household_member(p.household_id)));
create policy shopping_list_item_sources_rw on shopping_list_item_sources for all to authenticated
  using (exists (select 1 from shopping_list_items i where i.id = shopping_list_item_id and is_household_member(i.household_id)))
  with check (exists (select 1 from shopping_list_items i where i.id = shopping_list_item_id and is_household_member(i.household_id)));

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function is_household_member(uuid) to authenticated;
grant execute on function bootstrap_user(text) to authenticated;
