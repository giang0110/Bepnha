-- Read-only planner inputs and aggregate rollout state. Never select member body profiles,
-- household/user identifiers, tokens, or plan contents into the diagnostic result.
begin transaction read only;
set local statement_timeout = '15s';

with active_meals as (
  select identity.id as meal_id, version.id as meal_version_id
  from public.meal_options as identity
  join public.meal_option_versions as version on version.id = identity.current_version_id
  where identity.status = 'published' and identity.retired_at is null
    and version.publication_status = 'published'
), referenced_facts as (
  select distinct ingredient.food_fact_version_id
  from active_meals as meal
  join public.meal_option_recipes as component
    on component.meal_option_version_id = meal.meal_version_id
  join public.recipe_ingredients as ingredient
    on ingredient.recipe_version_id = component.recipe_version_id
), missing_policies as (
  select fact.version_number as fact_version, food.code as food_code
  from referenced_facts as reference
  join public.food_fact_versions as fact on fact.id = reference.food_fact_version_id
  join public.foods as food on food.id = fact.food_id
  where not exists (
    select 1 from public.food_quantity_policy_versions as policy
    where policy.food_fact_version_id = fact.id and policy.publication_status = 'published'
  )
), current_books as (
  select region.code as region_code, book.id, book.version_number, book.purchase_contract_version
  from public.price_regions as region
  join public.price_books as book on book.id = region.current_price_book_id
  where book.region_id = region.id and book.publication_status = 'published'
    and book.retired_at is null
), current_revisions as (
  select revision.engine_version, revision.household_setup_version,
    household.version as current_household_version, household.nutrition_setup_version
  from public.meal_plans as plan
  join public.meal_plan_revisions as revision on revision.id = plan.current_revision_id
  join public.households as household on household.id = plan.household_id
)
select jsonb_pretty(jsonb_build_object(
  'catalogServicePrivileges', (
    select jsonb_object_agg(table_name, jsonb_build_object(
      'select', has_table_privilege('service_role', 'public.' || table_name, 'SELECT'),
      'insert', has_table_privilege('service_role', 'public.' || table_name, 'INSERT')
    )) from unnest(array[
      'allergens', 'nutrients', 'food_fact_versions', 'food_fact_unit_conversions',
      'food_fact_allergen_assessments', 'food_fact_nutrients', 'food_fact_dietary_tags'
    ]) as table_name
  ),
  -- These are the same non-body metadata columns used by catalog:resolve. They allow a
  -- publication plan to be reviewed offline without exporting the database credential.
  'catalogReferenceRows', jsonb_build_object(
    'units', (select coalesce(jsonb_agg(row), '[]'::jsonb) from (select id, code, dimension from public.units order by code, id) as row),
    'food_categories', (select coalesce(jsonb_agg(row), '[]'::jsonb) from (select id, code, parent_id from public.food_categories order by code, id) as row),
    'allergens', (select coalesce(jsonb_agg(row), '[]'::jsonb) from (select id, code from public.allergens order by code, id) as row),
    'dietary_tags', (select coalesce(jsonb_agg(row), '[]'::jsonb) from (select id, code from public.dietary_tags order by code, id) as row),
    'nutrients', (select coalesce(jsonb_agg(row), '[]'::jsonb) from (select id, code, required_for_publication from public.nutrients order by code, id) as row),
    'price_regions', (select coalesce(jsonb_agg(row), '[]'::jsonb) from (select id, code, is_launch_default from public.price_regions order by code, id) as row),
    'recipe_tags', (select coalesce(jsonb_agg(row), '[]'::jsonb) from (select id, code, tag_kind from public.recipe_tags order by code, id) as row),
    'foods', (select coalesce(jsonb_agg(row), '[]'::jsonb) from (select id, code, name_vi, base_dimension, base_unit_id, status, revision from public.foods order by code, id) as row),
    'food_fact_versions', (select coalesce(jsonb_agg(row), '[]'::jsonb) from (select id, food_id, version_number, revision, publication_status from public.food_fact_versions order by food_id, version_number, id) as row),
    'recipes', (select coalesce(jsonb_agg(row), '[]'::jsonb) from (select id, code, name_vi, status, revision from public.recipes order by code, id) as row),
    'recipe_versions', (select coalesce(jsonb_agg(row), '[]'::jsonb) from (select id, recipe_id, version_number, revision, publication_status from public.recipe_versions order by recipe_id, version_number, id) as row),
    'price_books', (select coalesce(jsonb_agg(row), '[]'::jsonb) from (select id, region_id, version_number, revision, publication_status from public.price_books order by region_id, version_number, id) as row),
    'meal_options', (select coalesce(jsonb_agg(row), '[]'::jsonb) from (select id, code, name_vi, status, revision from public.meal_options order by code, id) as row),
    'meal_option_versions', (select coalesce(jsonb_agg(row), '[]'::jsonb) from (select id, meal_option_id, version_number, revision, publication_status from public.meal_option_versions order by meal_option_id, version_number, id) as row),
    'food_quantity_policy_versions', (select coalesce(jsonb_agg(row), '[]'::jsonb) from (select id, food_fact_version_id, version_number, revision, publication_status from public.food_quantity_policy_versions order by food_fact_version_id, version_number, id) as row)
  ),
  'activePublishedMealCount', (select count(*) from active_meals),
  'referencedFoodFactCount', (select count(*) from referenced_facts),
  'publishedQuantityPolicyCount', (
    select count(*) from public.food_quantity_policy_versions where publication_status = 'published'
  ),
  'referencedFactsMissingPolicyCount', (select count(*) from missing_policies),
  'referencedFactsMissingPolicies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'foodCode', food_code, 'factVersion', fact_version
    ) order by food_code, fact_version) from missing_policies
  ), '[]'::jsonb),
  'currentPlanEngineCounts', coalesce((
    select jsonb_object_agg(engine_version, amount) from (
      select engine_version, count(*) as amount from current_revisions group by engine_version
    ) as counts
  ), '{}'::jsonb),
  'savedWeeksUsingOlderHouseholdSetup', (
    select count(*) from current_revisions where household_setup_version < current_household_version
  ),
  'legacyWeeksWithNutritionSetup', (
    select count(*) from current_revisions
    where engine_version <> 'planner-engine-v6' and nutrition_setup_version is not null
  ),
  'currentPriceBooks', coalesce((
    select jsonb_agg(jsonb_build_object(
      'regionCode', book.region_code,
      'bookVersion', book.version_number,
      'purchaseContractVersion', book.purchase_contract_version,
      'priceCount', (select count(*) from public.food_prices where price_book_id = book.id),
      'fixedPackPriceCount', (
        select count(*) from public.food_prices as price
        left join public.food_price_purchase_terms as terms on terms.food_price_id = price.id
          and terms.price_book_id = book.id
        where price.price_book_id = book.id
          and (book.purchase_contract_version is null or terms.purchase_mode = 'fixed_pack')
      ),
      'looseSalePriceCount', (
        select count(*) from public.food_prices as price
        join public.food_price_purchase_terms as terms on terms.food_price_id = price.id
          and terms.price_book_id = book.id
        where price.price_book_id = book.id and terms.purchase_mode in ('loose_mass', 'loose_count')
      ),
      'missingRequiredPurchaseTerms', (
        select count(*) from public.food_prices as price
        where price.price_book_id = book.id and book.purchase_contract_version = 'purchase-v2'
          and not exists (
            select 1 from public.food_price_purchase_terms as terms
            where terms.food_price_id = price.id and terms.price_book_id = book.id
              and terms.version = 'purchase-v2'
          )
      )
    ) order by book.region_code) from current_books as book
  ), '[]'::jsonb)
));

commit;
