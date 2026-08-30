create function private.is_canonical_decimal_text(p_value text, p_allow_zero boolean)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select p_value ~ '^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$'
    and (p_allow_zero or p_value <> '0');
$$;

revoke all on function private.is_canonical_decimal_text(text, boolean)
from public, anon, authenticated, service_role;

alter table public.food_prices
add constraint food_prices_price_book_id_id_key unique (price_book_id, id);

alter table public.meal_plan_items
add constraint meal_plan_items_revision_id_id_key unique (meal_plan_revision_id, id);

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null,
  meal_plan_revision_id uuid not null unique,
  snapshot_version text not null check (snapshot_version = 'shopping-list-v1'),
  grocery_category_config_version text not null
    check (grocery_category_config_version = 'grocery-category-v1'),
  calculation_fingerprint text not null
    check (calculation_fingerprint ~ '^[0-9a-f]{64}$'),
  estimated_purchase_cost_vnd bigint not null
    check (estimated_purchase_cost_vnd between 0 and 9007199254740991),
  warnings jsonb not null check (jsonb_typeof(warnings) = 'array'),
  created_at timestamptz not null default now(),
  unique (id, meal_plan_revision_id),
  constraint shopping_lists_revision_fkey
    foreign key (meal_plan_id, meal_plan_revision_id)
    references public.meal_plan_revisions (meal_plan_id, id) on delete cascade
);

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null,
  meal_plan_revision_id uuid not null,
  food_id uuid not null,
  base_unit_id uuid not null,
  required_base_quantity text not null
    check (private.is_canonical_decimal_text(required_base_quantity, false)),
  package_base_quantity text not null
    check (private.is_canonical_decimal_text(package_base_quantity, false)),
  purchase_increment text not null
    check (private.is_canonical_decimal_text(purchase_increment, false)),
  purchase_package_count text not null
    check (private.is_canonical_decimal_text(purchase_package_count, false)),
  purchase_base_quantity text not null
    check (private.is_canonical_decimal_text(purchase_base_quantity, false)),
  leftover_base_quantity text not null
    check (private.is_canonical_decimal_text(leftover_base_quantity, true)),
  package_price_vnd bigint not null
    check (package_price_vnd between 1 and 9007199254740991),
  line_cost_vnd bigint not null
    check (line_cost_vnd between 0 and 9007199254740991),
  food_price_id uuid not null,
  price_book_id uuid not null,
  price_food_fact_version_id uuid not null,
  observed_at date not null,
  freshness text not null check (freshness in ('current', 'stale_usable')),
  grocery_category_code text not null check (
    grocery_category_code in (
      'fresh_produce', 'meat_seafood', 'eggs_tofu_dairy',
      'staples', 'seasonings', 'other'
    )
  ),
  created_at timestamptz not null default now(),
  unique (shopping_list_id, food_id),
  unique (shopping_list_id, id),
  constraint shopping_list_items_list_context_fkey
    foreign key (shopping_list_id, meal_plan_revision_id)
    references public.shopping_lists (id, meal_plan_revision_id) on delete cascade,
  constraint shopping_list_items_food_base_unit_fkey
    foreign key (food_id, base_unit_id)
    references public.foods (id, base_unit_id) on delete restrict,
  constraint shopping_list_items_price_fact_fkey
    foreign key (food_id, price_food_fact_version_id)
    references public.food_fact_versions (food_id, id) on delete restrict,
  constraint shopping_list_items_price_fkey
    foreign key (price_book_id, food_price_id)
    references public.food_prices (price_book_id, id) on delete restrict,
  check (purchase_package_count::numeric = trunc(purchase_package_count::numeric)),
  check (mod(purchase_package_count::numeric, purchase_increment::numeric) = 0),
  check (
    purchase_base_quantity::numeric
      = package_base_quantity::numeric * purchase_package_count::numeric
  ),
  check (purchase_base_quantity::numeric >= required_base_quantity::numeric),
  check (
    leftover_base_quantity::numeric
      = purchase_base_quantity::numeric - required_base_quantity::numeric
  ),
  check (
    line_cost_vnd::numeric
      = package_price_vnd::numeric * purchase_package_count::numeric
  )
);

create index shopping_list_items_list_idx
on public.shopping_list_items (shopping_list_id);

create table public.shopping_list_item_sources (
  shopping_list_item_id uuid not null,
  shopping_list_id uuid not null,
  meal_plan_revision_id uuid not null,
  meal_plan_item_id uuid not null,
  meal_option_recipe_id uuid not null references public.meal_option_recipes (id) on delete restrict,
  recipe_version_id uuid not null,
  recipe_ingredient_id uuid not null,
  food_id uuid not null,
  food_fact_version_id uuid not null,
  base_unit_id uuid not null,
  required_base_quantity text not null
    check (private.is_canonical_decimal_text(required_base_quantity, false)),
  created_at timestamptz not null default now(),
  primary key (
    shopping_list_item_id,
    meal_plan_item_id,
    meal_option_recipe_id,
    recipe_ingredient_id
  ),
  constraint shopping_sources_item_fkey
    foreign key (shopping_list_id, shopping_list_item_id)
    references public.shopping_list_items (shopping_list_id, id) on delete cascade,
  constraint shopping_sources_list_context_fkey
    foreign key (shopping_list_id, meal_plan_revision_id)
    references public.shopping_lists (id, meal_plan_revision_id) on delete cascade,
  constraint shopping_sources_plan_item_fkey
    foreign key (meal_plan_revision_id, meal_plan_item_id)
    references public.meal_plan_items (meal_plan_revision_id, id) on delete cascade,
  constraint shopping_sources_recipe_ingredient_fkey
    foreign key (recipe_version_id, recipe_ingredient_id)
    references public.recipe_ingredients (recipe_version_id, id) on delete restrict,
  constraint shopping_sources_food_fact_fkey
    foreign key (food_id, food_fact_version_id)
    references public.food_fact_versions (food_id, id) on delete restrict,
  constraint shopping_sources_food_base_unit_fkey
    foreign key (food_id, base_unit_id)
    references public.foods (id, base_unit_id) on delete restrict
);

create index shopping_sources_list_idx
on public.shopping_list_item_sources (shopping_list_id, shopping_list_item_id);

create table public.shopping_item_check_states (
  shopping_list_item_id uuid primary key
    references public.shopping_list_items (id) on delete cascade,
  checked_at timestamptz not null
);

create function private.assert_shopping_source_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.shopping_list_items;
  v_plan_item public.meal_plan_items;
  v_component public.meal_option_recipes;
  v_ingredient public.recipe_ingredients;
  v_food public.foods;
begin
  select * into v_line
  from public.shopping_list_items
  where id = new.shopping_list_item_id
    and shopping_list_id = new.shopping_list_id
    and meal_plan_revision_id = new.meal_plan_revision_id;
  if not found then
    raise exception using errcode = '23503', message = 'SHOPPING_SOURCE_LINE_CONTEXT_MISMATCH';
  end if;

  select * into v_plan_item
  from public.meal_plan_items
  where id = new.meal_plan_item_id
    and meal_plan_revision_id = new.meal_plan_revision_id;
  if not found then
    raise exception using errcode = '23503', message = 'SHOPPING_SOURCE_PLAN_ITEM_MISMATCH';
  end if;

  select * into v_component
  from public.meal_option_recipes
  where id = new.meal_option_recipe_id;
  if not found
    or v_component.meal_option_version_id <> v_plan_item.meal_option_version_id then
    raise exception using errcode = '23503', message = 'SHOPPING_SOURCE_COMPONENT_MISMATCH';
  end if;
  if v_component.recipe_version_id <> new.recipe_version_id then
    raise exception using errcode = '23503', message = 'SHOPPING_SOURCE_RECIPE_VERSION_MISMATCH';
  end if;

  select * into v_ingredient
  from public.recipe_ingredients
  where id = new.recipe_ingredient_id
    and recipe_version_id = new.recipe_version_id;
  if not found
    or v_ingredient.food_id <> new.food_id
    or v_ingredient.food_fact_version_id <> new.food_fact_version_id then
    raise exception using errcode = '23503', message = 'SHOPPING_SOURCE_INGREDIENT_LINEAGE_MISMATCH';
  end if;

  if v_line.food_id <> new.food_id or v_line.base_unit_id <> new.base_unit_id then
    raise exception using errcode = '23503', message = 'SHOPPING_SOURCE_LINE_FOOD_MISMATCH';
  end if;

  select * into v_food from public.foods where id = new.food_id;
  if not found or v_food.base_unit_id <> new.base_unit_id then
    raise exception using errcode = '23503', message = 'SHOPPING_SOURCE_CANONICAL_UNIT_MISMATCH';
  end if;

  return new;
end;
$$;

revoke all on function private.assert_shopping_source_row()
from public, anon, authenticated, service_role;

create trigger shopping_sources_assert_lineage
before insert or update on public.shopping_list_item_sources
for each row execute function private.assert_shopping_source_row();

create trigger shopping_lists_protect_history
before insert or update or delete on public.shopping_lists
for each row execute function private.protect_plan_history();
create trigger shopping_list_items_protect_history
before insert or update or delete on public.shopping_list_items
for each row execute function private.protect_plan_history();
create trigger shopping_sources_protect_history
before insert or update or delete on public.shopping_list_item_sources
for each row execute function private.protect_plan_history();

create function private.assert_revision_shopping_row(p_revision_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.meal_plan_revisions;
  v_list public.shopping_lists;
  v_snapshot jsonb;
  v_basket jsonb;
  v_line jsonb;
  v_basket_line jsonb;
  v_source jsonb;
  v_fact jsonb;
  v_db_line public.shopping_list_items;
  v_plan_item public.meal_plan_items;
  v_source_count integer;
  v_source_sum numeric;
  v_db_cost bigint;
  v_snapshot_foods text[];
  v_sorted_foods text[];
begin
  select * into v_revision
  from public.meal_plan_revisions
  where id = p_revision_id;
  if not found then
    raise exception using errcode = '23514', message = 'SHOPPING_REVISION_REQUIRED';
  end if;
  if v_revision.engine_version <> 'planner-engine-v2'
    or v_revision.input_snapshot ->> 'engineVersion' <> 'planner-engine-v2' then
    raise exception using errcode = '23514', message = 'SHOPPING_ENGINE_VERSION_MISMATCH';
  end if;

  v_snapshot := v_revision.calculation_snapshot -> 'shoppingList';
  v_basket := v_revision.calculation_snapshot -> 'purchaseBasket';
  if jsonb_typeof(v_snapshot) <> 'object'
    or v_snapshot ->> 'version' <> 'shopping-list-v1'
    or v_snapshot ->> 'groceryCategoryConfigVersion' <> 'grocery-category-v1'
    or jsonb_typeof(v_snapshot -> 'lines') <> 'array'
    or jsonb_typeof(v_snapshot -> 'warnings') <> 'array'
    or jsonb_typeof(v_basket -> 'lines') <> 'array' then
    raise exception using errcode = '23514', message = 'INVALID_SHOPPING_SNAPSHOT';
  end if;

  select * into v_list
  from public.shopping_lists
  where meal_plan_revision_id = p_revision_id
    and meal_plan_id = v_revision.meal_plan_id;
  if not found then
    raise exception using errcode = '23514', message = 'SHOPPING_LIST_REQUIRED';
  end if;
  if v_list.snapshot_version <> v_snapshot ->> 'version'
    or v_list.grocery_category_config_version <> v_snapshot ->> 'groceryCategoryConfigVersion'
    or v_list.calculation_fingerprint <> v_revision.calculation_fingerprint
    or v_list.estimated_purchase_cost_vnd <> v_revision.total_estimated_cost_vnd
    or v_list.estimated_purchase_cost_vnd
      <> (v_snapshot ->> 'totalEstimatedCostVnd')::bigint
    or v_list.warnings <> v_snapshot -> 'warnings' then
    raise exception using errcode = '23514', message = 'SHOPPING_LIST_SUMMARY_MISMATCH';
  end if;

  select array_agg(line ->> 'foodId' order by ordinality),
         array_agg(line ->> 'foodId' order by line ->> 'foodId')
  into v_snapshot_foods, v_sorted_foods
  from jsonb_array_elements(v_snapshot -> 'lines') with ordinality as rows(line, ordinality);
  if coalesce(array_length(v_snapshot_foods, 1), 0) = 0
    or v_snapshot_foods is distinct from v_sorted_foods
    or cardinality(v_snapshot_foods) <> (
      select count(distinct food_id)::integer
      from public.shopping_list_items where shopping_list_id = v_list.id
    )
    or cardinality(v_snapshot_foods) <> (
      select count(*)::integer
      from public.shopping_list_items where shopping_list_id = v_list.id
    ) then
    raise exception using errcode = '23514', message = 'SHOPPING_LINE_SET_MISMATCH';
  end if;

  select coalesce(sum(line_cost_vnd), 0) into v_db_cost
  from public.shopping_list_items where shopping_list_id = v_list.id;
  if v_db_cost <> v_list.estimated_purchase_cost_vnd then
    raise exception using errcode = '23514', message = 'SHOPPING_COST_MISMATCH';
  end if;

  for v_line in select value from jsonb_array_elements(v_snapshot -> 'lines')
  loop
    select * into v_db_line
    from public.shopping_list_items
    where shopping_list_id = v_list.id
      and food_id = (v_line ->> 'foodId')::uuid;
    if not found then
      raise exception using errcode = '23514', message = 'SHOPPING_LINE_MISSING';
    end if;

    select value into v_basket_line
    from jsonb_array_elements(v_basket -> 'lines')
    where value ->> 'foodId' = v_line ->> 'foodId';
    if not found then
      raise exception using errcode = '23514', message = 'SHOPPING_BASKET_LINE_MISSING';
    end if;

    if v_line ->> 'baseUnitId' is distinct from v_basket_line ->> 'baseUnitId'
      or v_line ->> 'requiredBaseQuantity' is distinct from v_basket_line ->> 'requiredBaseQuantity'
      or v_line ->> 'packageBaseQuantity' is distinct from v_basket_line ->> 'packageBaseQuantity'
      or v_line ->> 'purchaseIncrement' is distinct from v_basket_line ->> 'purchaseIncrement'
      or v_line ->> 'purchasePackageCount' is distinct from v_basket_line ->> 'purchasePackageCount'
      or v_line ->> 'purchaseBaseQuantity' is distinct from v_basket_line ->> 'purchaseBaseQuantity'
      or v_line ->> 'leftoverBaseQuantity' is distinct from v_basket_line ->> 'leftoverBaseQuantity'
      or v_line ->> 'packagePriceVnd' is distinct from v_basket_line ->> 'packagePriceVnd'
      or v_line ->> 'lineCostVnd' is distinct from v_basket_line ->> 'lineCostVnd'
      or v_line ->> 'foodPriceId' is distinct from v_basket_line ->> 'foodPriceId'
      or v_line ->> 'priceBookId' is distinct from v_basket_line ->> 'priceBookId'
      or v_line ->> 'priceFoodFactVersionId' is distinct from v_basket_line ->> 'priceFoodFactVersionId'
      or v_line ->> 'observedAt' is distinct from v_basket_line ->> 'observedAt'
      or v_line ->> 'freshness' is distinct from v_basket_line ->> 'freshness' then
      raise exception using errcode = '23514', message = 'SHOPPING_BASKET_PROJECTION_MISMATCH';
    end if;

    if v_db_line.base_unit_id::text <> v_line ->> 'baseUnitId'
      or v_db_line.required_base_quantity <> v_line ->> 'requiredBaseQuantity'
      or v_db_line.package_base_quantity <> v_line ->> 'packageBaseQuantity'
      or v_db_line.purchase_increment <> v_line ->> 'purchaseIncrement'
      or v_db_line.purchase_package_count <> v_line ->> 'purchasePackageCount'
      or v_db_line.purchase_base_quantity <> v_line ->> 'purchaseBaseQuantity'
      or v_db_line.leftover_base_quantity <> v_line ->> 'leftoverBaseQuantity'
      or v_db_line.package_price_vnd <> (v_line ->> 'packagePriceVnd')::bigint
      or v_db_line.line_cost_vnd <> (v_line ->> 'lineCostVnd')::bigint
      or v_db_line.food_price_id::text <> v_line ->> 'foodPriceId'
      or v_db_line.price_book_id::text <> v_line ->> 'priceBookId'
      or v_db_line.price_food_fact_version_id::text <> v_line ->> 'priceFoodFactVersionId'
      or v_db_line.observed_at::text <> v_line ->> 'observedAt'
      or v_db_line.freshness <> v_line ->> 'freshness'
      or v_db_line.grocery_category_code <> v_line ->> 'groceryCategoryCode' then
      raise exception using errcode = '23514', message = 'SHOPPING_RELATIONAL_LINE_MISMATCH';
    end if;

    if not exists (
      select 1 from public.food_prices as price
      where price.id = v_db_line.food_price_id
        and price.price_book_id = v_db_line.price_book_id
        and price.food_id = v_db_line.food_id
        and price.food_fact_version_id = v_db_line.price_food_fact_version_id
        and price.base_unit_id = v_db_line.base_unit_id
        and price.package_base_quantity = v_db_line.package_base_quantity::numeric
        and price.purchase_increment = v_db_line.purchase_increment::numeric
        and price.package_price_vnd = v_db_line.package_price_vnd
        and price.observed_at = v_db_line.observed_at
    ) then
      raise exception using errcode = '23514', message = 'SHOPPING_PRICE_PROVENANCE_MISMATCH';
    end if;

    if jsonb_typeof(v_line -> 'sources') <> 'array'
      or jsonb_array_length(v_line -> 'sources') = 0
      or jsonb_typeof(v_line -> 'factRefs') <> 'array' then
      raise exception using errcode = '23514', message = 'SHOPPING_SOURCE_EVIDENCE_REQUIRED';
    end if;

    select count(*)::integer, coalesce(sum(required_base_quantity::numeric), 0)
    into v_source_count, v_source_sum
    from public.shopping_list_item_sources
    where shopping_list_item_id = v_db_line.id;
    if v_source_count <> jsonb_array_length(v_line -> 'sources')
      or v_source_sum <> v_db_line.required_base_quantity::numeric then
      raise exception using errcode = '23514', message = 'SHOPPING_SOURCE_SUM_MISMATCH';
    end if;

    for v_source in select value from jsonb_array_elements(v_line -> 'sources')
    loop
      select * into v_plan_item
      from public.meal_plan_items
      where meal_plan_revision_id = p_revision_id
        and day_index = (v_source ->> 'dayIndex')::smallint
        and meal_slot = 'primary';
      if not found
        or v_plan_item.meal_option_id::text <> v_source ->> 'mealOptionId'
        or v_plan_item.meal_option_version_id::text <> v_source ->> 'mealOptionVersionId'
        or not exists (
          select 1 from public.shopping_list_item_sources as source
          where source.shopping_list_item_id = v_db_line.id
            and source.meal_plan_item_id = v_plan_item.id
            and source.meal_option_recipe_id::text = v_source ->> 'mealOptionRecipeId'
            and source.recipe_version_id::text = v_source ->> 'recipeVersionId'
            and source.recipe_ingredient_id::text = v_source ->> 'recipeIngredientId'
            and source.food_id::text = v_source ->> 'foodId'
            and source.food_fact_version_id::text = v_source ->> 'foodFactVersionId'
            and source.base_unit_id::text = v_source ->> 'baseUnitId'
            and source.required_base_quantity = v_source ->> 'requiredBaseQuantity'
        ) then
        raise exception using errcode = '23514', message = 'SHOPPING_SOURCE_SNAPSHOT_MISMATCH';
      end if;
    end loop;

    if (
      select count(distinct food_fact_version_id)::integer
      from public.shopping_list_item_sources
      where shopping_list_item_id = v_db_line.id
    ) <> jsonb_array_length(v_line -> 'factRefs') then
      raise exception using errcode = '23514', message = 'SHOPPING_FACT_REF_SET_MISMATCH';
    end if;

    for v_fact in select value from jsonb_array_elements(v_line -> 'factRefs')
    loop
      if not exists (
        select 1
        from public.food_fact_versions as fact
        where fact.id = (v_fact ->> 'foodFactVersionId')::uuid
          and fact.food_id = v_db_line.food_id
          and fact.content_hash = v_fact ->> 'contentHash'
          and exists (
            select 1 from public.shopping_list_item_sources as source
            where source.shopping_list_item_id = v_db_line.id
              and source.food_fact_version_id = fact.id
          )
      ) then
        raise exception using errcode = '23514', message = 'SHOPPING_FACT_REF_MISMATCH';
      end if;
    end loop;
  end loop;

  if (v_basket ->> 'totalEstimatedCostVnd')::bigint <> v_revision.total_estimated_cost_vnd
    or (v_snapshot ->> 'totalEstimatedCostVnd')::bigint <> v_revision.total_estimated_cost_vnd then
    raise exception using errcode = '23514', message = 'SHOPPING_TOTAL_MISMATCH';
  end if;
end;
$$;

revoke all on function private.assert_revision_shopping_row(uuid)
from public, anon, authenticated, service_role;

create or replace function private.assert_plan_summary_row(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.meal_plans;
  v_revision public.meal_plan_revisions;
  v_line_sum bigint;
begin
  select * into v_plan from public.meal_plans where id = p_plan_id;
  if not found or v_plan.current_revision_id is null then
    raise exception using errcode = '23514', message = 'PLAN_CURRENT_REVISION_REQUIRED';
  end if;
  select * into v_revision from public.meal_plan_revisions
  where id = v_plan.current_revision_id and meal_plan_id = v_plan.id and state = 'ready';
  if not found then raise exception using errcode = '23514', message = 'PLAN_READY_REVISION_REQUIRED'; end if;
  select coalesce(sum((line ->> 'lineCostVnd')::bigint), 0) into v_line_sum
  from jsonb_array_elements(v_revision.calculation_snapshot #> '{purchaseBasket,lines}') as line;
  if v_plan.calculation_fingerprint <> v_revision.calculation_fingerprint
    or v_plan.total_estimated_cost_vnd <> v_revision.total_estimated_cost_vnd
    or v_plan.budget_status <> v_revision.budget_status
    or v_line_sum <> v_revision.total_estimated_cost_vnd
    or (v_revision.calculation_snapshot #>> '{purchaseBasket,totalEstimatedCostVnd}')::bigint
      <> v_revision.total_estimated_cost_vnd then
    raise exception using errcode = '23514', message = 'PLAN_SUMMARY_MISMATCH';
  end if;
  if v_revision.engine_version = 'planner-engine-v2' then
    perform private.assert_revision_shopping_row(v_revision.id);
  end if;
end;
$$;

create or replace function public.persist_meal_plan_revision(
  p_actor_user_id uuid,
  p_household_id uuid,
  p_week_start date,
  p_expected_plan_version integer,
  p_expected_current_revision_id uuid,
  p_idempotency_key uuid,
  p_revision jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household public.households;
  v_plan public.meal_plans;
  v_revision_id uuid := gen_random_uuid();
  v_revision_number integer;
  v_revision_kind public.meal_plan_revision_kind;
  v_replaced_day smallint;
  v_budget bigint;
  v_total bigint;
  v_overage bigint;
  v_budget_status public.meal_plan_budget_status;
  v_fingerprint text;
  v_line_sum bigint;
  v_existing public.meal_plan_revisions;
  v_changed_days integer;
  v_shopping jsonb;
  v_line jsonb;
  v_source jsonb;
  v_list_id uuid;
  v_item_id uuid;
  v_meal_plan_item_id uuid;
begin
  select * into v_household from public.households
  where id = p_household_id and owner_user_id = p_actor_user_id
    and onboarding_completed_at is not null for share;
  if not found then raise exception using errcode = '42501', message = 'HOUSEHOLD_OWNERSHIP_REQUIRED'; end if;
  if extract(isodow from p_week_start) <> 1 then
    raise exception using errcode = '22023', message = 'WEEK_START_MUST_BE_MONDAY';
  end if;
  if jsonb_typeof(p_revision) <> 'object' or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) <> 7 then
    raise exception using errcode = '22023', message = 'INVALID_PLAN_PAYLOAD';
  end if;
  if (
    select count(*) <> 7
      or count(distinct (item ->> 'dayIndex')::integer) <> 7
      or min((item ->> 'dayIndex')::integer) <> 0
      or max((item ->> 'dayIndex')::integer) <> 6
      or count(distinct item ->> 'mealOptionId') <> 7
      or bool_or(item ->> 'mealSlot' <> 'primary')
    from jsonb_array_elements(p_items) as item
  ) then
    raise exception using errcode = '23514', message = 'PLAN_REQUIRES_SEVEN_DISTINCT_PRIMARY_ITEMS';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as item
    left join public.meal_option_versions as version
      on version.id = (item ->> 'mealOptionVersionId')::uuid
      and version.meal_option_id = (item ->> 'mealOptionId')::uuid
      and version.publication_status = 'published'
    where version.id is null
  ) then
    raise exception using errcode = '23503', message = 'INVALID_MEAL_OPTION_VERSION_PIN';
  end if;

  v_revision_kind := (p_revision ->> 'revisionKind')::public.meal_plan_revision_kind;
  v_replaced_day := nullif(p_revision ->> 'replacedDayIndex', '')::smallint;
  v_budget := (p_revision ->> 'budgetVnd')::bigint;
  v_total := (p_revision ->> 'totalEstimatedCostVnd')::bigint;
  v_overage := (p_revision ->> 'overageVnd')::bigint;
  v_budget_status := (p_revision ->> 'budgetStatus')::public.meal_plan_budget_status;
  v_fingerprint := p_revision ->> 'calculationFingerprint';
  v_shopping := p_revision #> '{calculationSnapshot,shoppingList}';
  if v_fingerprint !~ '^[0-9a-f]{64}$'
    or (p_revision ->> 'catalogFingerprint') !~ '^[0-9a-f]{64}$'
    or (p_revision ->> 'inputFingerprint') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_revision -> 'warnings') <> 'array'
    or jsonb_typeof(p_revision -> 'inputSnapshot') <> 'object'
    or jsonb_typeof(p_revision -> 'calculationSnapshot') <> 'object'
    or (p_revision ->> 'householdSetupVersion')::integer <> v_household.version
    or p_revision ->> 'engineVersion' <> 'planner-engine-v2'
    or p_revision #>> '{inputSnapshot,engineVersion}' <> 'planner-engine-v2'
    or p_revision ->> 'engineVersion' is distinct from p_revision #>> '{inputSnapshot,engineVersion}'
    or p_revision ->> 'portionConfigVersion' <> 'portion-v1'
    or p_revision ->> 'priceFreshnessConfigVersion' <> 'price-freshness-v1'
    or p_revision ->> 'plannerConfigVersion' <> 'planner-v1'
    or jsonb_typeof(v_shopping) <> 'object'
    or v_shopping ->> 'version' <> 'shopping-list-v1'
    or v_shopping ->> 'groceryCategoryConfigVersion' <> 'grocery-category-v1'
    or jsonb_typeof(v_shopping -> 'lines') <> 'array'
    or jsonb_array_length(v_shopping -> 'lines') < 1
    or jsonb_typeof(v_shopping -> 'warnings') <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_REVISION_METADATA';
  end if;

  select coalesce(sum((line ->> 'lineCostVnd')::bigint), 0) into v_line_sum
  from jsonb_array_elements(p_revision #> '{calculationSnapshot,purchaseBasket,lines}') as line;
  if v_line_sum <> v_total
    or (p_revision #>> '{calculationSnapshot,purchaseBasket,totalEstimatedCostVnd}')::bigint <> v_total
    or (v_shopping ->> 'totalEstimatedCostVnd')::bigint <> v_total
    or (v_budget_status = 'within' and (v_total > v_budget or v_overage <> 0))
    or (v_budget_status = 'over' and (v_total <= v_budget or v_overage <> v_total - v_budget)) then
    raise exception using errcode = '23514', message = 'PLAN_COST_INVARIANT_VIOLATION';
  end if;

  perform private.begin_plan_transition();
  select * into v_plan from public.meal_plans
  where household_id = p_household_id and week_start = p_week_start for update;
  if found then
    select * into v_existing from public.meal_plan_revisions
    where meal_plan_id = v_plan.id and idempotency_key = p_idempotency_key;
    if found then
      perform private.end_plan_transition();
      return jsonb_build_object(
        'planId', v_plan.id, 'revisionId', v_existing.id,
        'planVersion', v_plan.version, 'idempotent', true
      );
    end if;
    if v_plan.version <> p_expected_plan_version
      or v_plan.current_revision_id is distinct from p_expected_current_revision_id then
      raise exception using errcode = 'P0001', message = 'STALE_PLAN_VERSION';
    end if;
    if v_revision_kind = 'generation' then
      raise exception using errcode = '22023', message = 'REGENERATION_KIND_REQUIRED';
    end if;
  else
    if p_expected_plan_version <> 0 or p_expected_current_revision_id is not null
      or v_revision_kind <> 'generation' then
      raise exception using errcode = 'P0001', message = 'STALE_PLAN_VERSION';
    end if;
    insert into public.meal_plans (household_id, week_start, timezone)
    values (p_household_id, p_week_start, v_household.timezone)
    returning * into v_plan;
  end if;

  v_revision_number := v_plan.version + 1;
  insert into public.meal_plan_revisions (
    id, meal_plan_id, revision_number, parent_revision_id, revision_kind,
    replaced_day_index, idempotency_key, household_setup_version, engine_version,
    portion_config_version, price_freshness_config_version, planner_config_version,
    calculation_date, catalog_fingerprint, input_fingerprint, calculation_fingerprint,
    input_snapshot, calculation_snapshot, budget_vnd, total_estimated_cost_vnd,
    overage_vnd, budget_status, warnings
  ) values (
    v_revision_id, v_plan.id, v_revision_number, v_plan.current_revision_id, v_revision_kind,
    v_replaced_day, p_idempotency_key, (p_revision ->> 'householdSetupVersion')::integer,
    p_revision ->> 'engineVersion', p_revision ->> 'portionConfigVersion',
    p_revision ->> 'priceFreshnessConfigVersion', p_revision ->> 'plannerConfigVersion',
    (p_revision ->> 'calculationDate')::date, p_revision ->> 'catalogFingerprint',
    p_revision ->> 'inputFingerprint', v_fingerprint, p_revision -> 'inputSnapshot',
    jsonb_set(p_revision -> 'calculationSnapshot', '{items}', p_items, true),
    v_budget, v_total, v_overage, v_budget_status, p_revision -> 'warnings'
  );

  insert into public.meal_plan_items (
    meal_plan_revision_id, day_index, meal_slot, meal_option_id, meal_option_version_id,
    adult_equivalent, scale_factor, calculation_snapshot
  )
  select
    v_revision_id, (item ->> 'dayIndex')::smallint, item ->> 'mealSlot',
    (item ->> 'mealOptionId')::uuid, (item ->> 'mealOptionVersionId')::uuid,
    (item ->> 'adultEquivalent')::numeric, (item ->> 'scaleFactor')::numeric,
    item -> 'snapshot'
  from jsonb_array_elements(p_items) as item;

  if v_revision_kind = 'replacement' then
    if v_replaced_day is null or v_plan.current_revision_id is null then
      raise exception using errcode = '23514', message = 'INVALID_REPLACEMENT_PARENT';
    end if;
    select count(*) into v_changed_days
    from public.meal_plan_items as old_item
    join public.meal_plan_items as new_item on new_item.meal_plan_revision_id = v_revision_id
      and new_item.day_index = old_item.day_index
    where old_item.meal_plan_revision_id = v_plan.current_revision_id
      and (
        old_item.meal_option_id is distinct from new_item.meal_option_id
        or old_item.meal_option_version_id is distinct from new_item.meal_option_version_id
      );
    if v_changed_days <> 1 or not exists (
      select 1 from public.meal_plan_items as old_item
      join public.meal_plan_items as new_item on new_item.meal_plan_revision_id = v_revision_id
        and new_item.day_index = old_item.day_index
      where old_item.meal_plan_revision_id = v_plan.current_revision_id
        and old_item.day_index = v_replaced_day
        and old_item.meal_option_id is distinct from new_item.meal_option_id
    ) then
      raise exception using errcode = '23514', message = 'REPLACEMENT_MUST_CHANGE_EXACTLY_ONE_DAY';
    end if;
  end if;

  insert into public.shopping_lists (
    meal_plan_id, meal_plan_revision_id, snapshot_version,
    grocery_category_config_version, calculation_fingerprint,
    estimated_purchase_cost_vnd, warnings
  ) values (
    v_plan.id, v_revision_id, v_shopping ->> 'version',
    v_shopping ->> 'groceryCategoryConfigVersion', v_fingerprint,
    (v_shopping ->> 'totalEstimatedCostVnd')::bigint, v_shopping -> 'warnings'
  ) returning id into v_list_id;

  for v_line in select value from jsonb_array_elements(v_shopping -> 'lines')
  loop
    insert into public.shopping_list_items (
      shopping_list_id, meal_plan_revision_id, food_id, base_unit_id,
      required_base_quantity, package_base_quantity, purchase_increment,
      purchase_package_count, purchase_base_quantity, leftover_base_quantity,
      package_price_vnd, line_cost_vnd, food_price_id, price_book_id,
      price_food_fact_version_id, observed_at, freshness, grocery_category_code
    ) values (
      v_list_id, v_revision_id, (v_line ->> 'foodId')::uuid,
      (v_line ->> 'baseUnitId')::uuid, v_line ->> 'requiredBaseQuantity',
      v_line ->> 'packageBaseQuantity', v_line ->> 'purchaseIncrement',
      v_line ->> 'purchasePackageCount', v_line ->> 'purchaseBaseQuantity',
      v_line ->> 'leftoverBaseQuantity', (v_line ->> 'packagePriceVnd')::bigint,
      (v_line ->> 'lineCostVnd')::bigint, (v_line ->> 'foodPriceId')::uuid,
      (v_line ->> 'priceBookId')::uuid, (v_line ->> 'priceFoodFactVersionId')::uuid,
      (v_line ->> 'observedAt')::date, v_line ->> 'freshness',
      v_line ->> 'groceryCategoryCode'
    ) returning id into v_item_id;

    for v_source in select value from jsonb_array_elements(v_line -> 'sources')
    loop
      select id into v_meal_plan_item_id
      from public.meal_plan_items
      where meal_plan_revision_id = v_revision_id
        and day_index = (v_source ->> 'dayIndex')::smallint
        and meal_slot = 'primary';
      if not found then
        raise exception using errcode = '23503', message = 'SHOPPING_SOURCE_PLAN_ITEM_MISMATCH';
      end if;
      insert into public.shopping_list_item_sources (
        shopping_list_item_id, shopping_list_id, meal_plan_revision_id,
        meal_plan_item_id, meal_option_recipe_id, recipe_version_id,
        recipe_ingredient_id, food_id, food_fact_version_id, base_unit_id,
        required_base_quantity
      ) values (
        v_item_id, v_list_id, v_revision_id, v_meal_plan_item_id,
        (v_source ->> 'mealOptionRecipeId')::uuid,
        (v_source ->> 'recipeVersionId')::uuid,
        (v_source ->> 'recipeIngredientId')::uuid,
        (v_source ->> 'foodId')::uuid,
        (v_source ->> 'foodFactVersionId')::uuid,
        (v_source ->> 'baseUnitId')::uuid,
        v_source ->> 'requiredBaseQuantity'
      );
    end loop;
  end loop;

  perform private.assert_revision_shopping_row(v_revision_id);

  if v_plan.current_revision_id is not null then
    insert into public.shopping_item_check_states (shopping_list_item_id, checked_at)
    select new_item.id, old_state.checked_at
    from public.shopping_list_items as new_item
    join public.shopping_lists as old_list
      on old_list.meal_plan_revision_id = v_plan.current_revision_id
    join public.shopping_list_items as old_item
      on old_item.shopping_list_id = old_list.id
      and old_item.food_id = new_item.food_id
      and old_item.base_unit_id = new_item.base_unit_id
      and old_item.required_base_quantity = new_item.required_base_quantity
    join public.shopping_item_check_states as old_state
      on old_state.shopping_list_item_id = old_item.id
    where new_item.shopping_list_id = v_list_id;
  end if;

  update public.meal_plan_revisions
  set state = 'ready', sealed_at = now()
  where id = v_revision_id;
  update public.meal_plans
  set current_revision_id = v_revision_id, version = v_revision_number,
      calculation_fingerprint = v_fingerprint, total_estimated_cost_vnd = v_total,
      budget_status = v_budget_status, updated_at = now()
  where id = v_plan.id returning * into v_plan;
  perform private.assert_plan_summary_row(v_plan.id);
  perform private.end_plan_transition();
  return jsonb_build_object(
    'planId', v_plan.id, 'revisionId', v_revision_id,
    'planVersion', v_plan.version, 'idempotent', false
  );
exception when others then
  perform private.end_plan_transition();
  raise;
end;
$$;

create function public.get_shopping_list(
  p_plan_id uuid,
  p_revision_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_plan public.meal_plans;
  v_revision public.meal_plan_revisions;
  v_list public.shopping_lists;
begin
  select * into v_plan from public.meal_plans where id = p_plan_id;
  if not found then return null; end if;

  select * into v_revision
  from public.meal_plan_revisions
  where meal_plan_id = v_plan.id
    and id = coalesce(p_revision_id, v_plan.current_revision_id);
  if not found then return null; end if;

  select * into v_list
  from public.shopping_lists
  where meal_plan_id = v_plan.id and meal_plan_revision_id = v_revision.id;
  if not found then
    return jsonb_build_object(
      'status', 'legacy_unavailable',
      'code', 'SHOPPING_LIST_NOT_AVAILABLE_FOR_LEGACY_REVISION',
      'planId', v_plan.id,
      'revisionId', v_revision.id,
      'weekStart', v_plan.week_start
    );
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'planId', v_plan.id,
    'revisionId', v_revision.id,
    'weekStart', v_plan.week_start,
    'calculationFingerprint', v_list.calculation_fingerprint,
    'budgetVnd', v_revision.budget_vnd,
    'budgetStatus', v_revision.budget_status,
    'overageVnd', v_revision.overage_vnd,
    'totalEstimatedCostVnd', v_list.estimated_purchase_cost_vnd,
    'warnings', v_list.warnings,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'shoppingListItemId', item.id,
          'foodId', item.food_id,
          'foodNameVi', food.name_vi,
          'baseUnitId', item.base_unit_id,
          'requiredBaseQuantity', item.required_base_quantity,
          'packageBaseQuantity', item.package_base_quantity,
          'purchaseIncrement', item.purchase_increment,
          'purchasePackageCount', item.purchase_package_count,
          'purchaseBaseQuantity', item.purchase_base_quantity,
          'leftoverBaseQuantity', item.leftover_base_quantity,
          'packagePriceVnd', item.package_price_vnd,
          'lineCostVnd', item.line_cost_vnd,
          'foodPriceId', item.food_price_id,
          'priceBookId', item.price_book_id,
          'priceFoodFactVersionId', item.price_food_fact_version_id,
          'observedAt', item.observed_at,
          'freshness', item.freshness,
          'groceryCategoryCode', item.grocery_category_code,
          'checked', check_state.shopping_list_item_id is not null,
          'checkedAt', check_state.checked_at,
          'sources', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'dayIndex', plan_item.day_index,
                'mealPlanItemId', source.meal_plan_item_id,
                'mealOptionId', plan_item.meal_option_id,
                'mealOptionVersionId', plan_item.meal_option_version_id,
                'mealOptionNameVi', meal_option.name_vi,
                'mealOptionRecipeId', source.meal_option_recipe_id,
                'recipeVersionId', source.recipe_version_id,
                'recipeIngredientId', source.recipe_ingredient_id,
                'foodFactVersionId', source.food_fact_version_id,
                'baseUnitId', source.base_unit_id,
                'requiredBaseQuantity', source.required_base_quantity
              ) order by plan_item.day_index, source.meal_option_recipe_id,
                         source.recipe_ingredient_id, source.food_fact_version_id
            )
            from public.shopping_list_item_sources as source
            join public.meal_plan_items as plan_item on plan_item.id = source.meal_plan_item_id
            join public.meal_options as meal_option on meal_option.id = plan_item.meal_option_id
            where source.shopping_list_item_id = item.id
          ), '[]'::jsonb)
        ) order by item.food_id
      )
      from public.shopping_list_items as item
      join public.foods as food on food.id = item.food_id
      left join public.shopping_item_check_states as check_state
        on check_state.shopping_list_item_id = item.id
      where item.shopping_list_id = v_list.id
    ), '[]'::jsonb)
  );
end;
$$;

create function public.set_shopping_item_checked(
  p_shopping_list_item_id uuid,
  p_checked boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_checked_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if not exists (
    select 1
    from public.shopping_list_items as item
    join public.shopping_lists as list on list.id = item.shopping_list_id
    join public.meal_plans as plan on plan.id = list.meal_plan_id
    join public.households as household on household.id = plan.household_id
    where item.id = p_shopping_list_item_id
      and household.owner_user_id = (select auth.uid())
  ) then
    raise exception using errcode = '42501', message = 'SHOPPING_ITEM_OWNERSHIP_REQUIRED';
  end if;

  if p_checked then
    insert into public.shopping_item_check_states (shopping_list_item_id, checked_at)
    values (p_shopping_list_item_id, now())
    on conflict (shopping_list_item_id)
    do update set checked_at = public.shopping_item_check_states.checked_at
    returning checked_at into v_checked_at;
  else
    delete from public.shopping_item_check_states
    where shopping_list_item_id = p_shopping_list_item_id;
    v_checked_at := null;
  end if;

  return jsonb_build_object(
    'shoppingListItemId', p_shopping_list_item_id,
    'checked', p_checked,
    'checkedAt', v_checked_at
  );
end;
$$;

alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.shopping_list_item_sources enable row level security;
alter table public.shopping_item_check_states enable row level security;

create policy shopping_lists_owner_read
on public.shopping_lists for select to authenticated using (
  exists (
    select 1 from public.meal_plans as plan
    join public.households as household on household.id = plan.household_id
    where plan.id = meal_plan_id and household.owner_user_id = (select auth.uid())
  )
);

create policy shopping_list_items_owner_read
on public.shopping_list_items for select to authenticated using (
  exists (
    select 1 from public.shopping_lists as list
    join public.meal_plans as plan on plan.id = list.meal_plan_id
    join public.households as household on household.id = plan.household_id
    where list.id = shopping_list_id and household.owner_user_id = (select auth.uid())
  )
);

create policy shopping_sources_owner_read
on public.shopping_list_item_sources for select to authenticated using (
  exists (
    select 1 from public.shopping_lists as list
    join public.meal_plans as plan on plan.id = list.meal_plan_id
    join public.households as household on household.id = plan.household_id
    where list.id = shopping_list_id and household.owner_user_id = (select auth.uid())
  )
);

create policy shopping_check_states_owner_read
on public.shopping_item_check_states for select to authenticated using (
  exists (
    select 1 from public.shopping_list_items as item
    join public.shopping_lists as list on list.id = item.shopping_list_id
    join public.meal_plans as plan on plan.id = list.meal_plan_id
    join public.households as household on household.id = plan.household_id
    where item.id = shopping_list_item_id
      and household.owner_user_id = (select auth.uid())
  )
);

revoke all on table public.shopping_lists from public, anon, authenticated, service_role;
revoke all on table public.shopping_list_items from public, anon, authenticated, service_role;
revoke all on table public.shopping_list_item_sources from public, anon, authenticated, service_role;
revoke all on table public.shopping_item_check_states from public, anon, authenticated, service_role;

grant select on table public.shopping_lists to authenticated, service_role;
grant select on table public.shopping_list_items to authenticated, service_role;
grant select on table public.shopping_list_item_sources to authenticated, service_role;
grant select on table public.shopping_item_check_states to authenticated, service_role;

revoke all on function public.get_shopping_list(uuid, uuid)
from public, anon;
revoke all on function public.set_shopping_item_checked(uuid, boolean)
from public, anon;
revoke all on function public.persist_meal_plan_revision(uuid, uuid, date, integer, uuid, uuid, jsonb, jsonb)
from public, anon, authenticated;

grant execute on function public.get_shopping_list(uuid, uuid)
to authenticated, service_role;
grant execute on function public.set_shopping_item_checked(uuid, boolean)
to authenticated, service_role;
grant execute on function public.persist_meal_plan_revision(uuid, uuid, date, integer, uuid, uuid, jsonb, jsonb)
to service_role;
