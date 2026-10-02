begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_audit_log'
      and policyname = 'admin_audit_log_no_direct_access'
      and permissive = 'RESTRICTIVE'
      and cmd = 'ALL'
      and roles = array['public']::name[]
      and qual = 'false'
      and with_check = 'false'
  ),
  1,
  'admin audit log keeps the restrictive deny-all public policy'
);

select is(
  (
    select count(*)::integer
    from pg_proc as function
    join pg_namespace as namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.oid in (
        'public.apply_shopping_to_pantry(uuid)'::regprocedure,
        'public.save_household_setup_v2(integer,bigint,integer,jsonb,text[],jsonb,jsonb,integer)'::regprocedure,
        'public.delete_pantry_item(uuid,integer)'::regprocedure,
        'public.set_meal_option_rating(uuid,uuid,text)'::regprocedure,
        'public.set_shopping_item_checked(uuid,boolean)'::regprocedure,
        'public.upsert_pantry_item(uuid,uuid,uuid,uuid,numeric,integer)'::regprocedure
      )
      and has_function_privilege('anon', function.oid, 'EXECUTE')
  ),
  0,
  'anon cannot execute any intended privileged mutation RPC'
);

select is(
  (
    select count(*)::integer
    from pg_proc as function
    join pg_namespace as namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.oid in (
        'public.apply_shopping_to_pantry(uuid)'::regprocedure,
        'public.save_household_setup_v2(integer,bigint,integer,jsonb,text[],jsonb,jsonb,integer)'::regprocedure,
        'public.delete_pantry_item(uuid,integer)'::regprocedure,
        'public.set_meal_option_rating(uuid,uuid,text)'::regprocedure,
        'public.set_shopping_item_checked(uuid,boolean)'::regprocedure,
        'public.upsert_pantry_item(uuid,uuid,uuid,uuid,numeric,integer)'::regprocedure
      )
      and function.prosecdef
      and has_function_privilege('authenticated', function.oid, 'EXECUTE')
  ),
  6,
  'authenticated can execute exactly the six intended privileged mutation RPCs'
);

select is(
  (
    select count(*)::integer
    from pg_proc as function
    join pg_namespace as namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.prosecdef
      and has_function_privilege('authenticated', function.oid, 'EXECUTE')
  ),
  6,
  'no additional public SECURITY DEFINER function is exposed to authenticated users'
);

select is(
  (
    select count(*)::integer
    from pg_proc as function
    where function.oid in (
        'public.apply_shopping_to_pantry(uuid)'::regprocedure,
        'public.save_household_setup_v2(integer,bigint,integer,jsonb,text[],jsonb,jsonb,integer)'::regprocedure,
        'public.delete_pantry_item(uuid,integer)'::regprocedure,
        'public.set_meal_option_rating(uuid,uuid,text)'::regprocedure,
        'public.set_shopping_item_checked(uuid,boolean)'::regprocedure,
        'public.upsert_pantry_item(uuid,uuid,uuid,uuid,numeric,integer)'::regprocedure
      )
      and array_position(function.proconfig, 'search_path=""') is not null
  ),
  6,
  'all intended privileged mutation RPCs pin an empty search_path'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.get_pantry(uuid)'::regprocedure
  ),
  false,
  'pantry read RPC remains SECURITY INVOKER'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.get_published_meal_option_calculation_input(uuid)'::regprocedure
  ),
  false,
  'published meal-option calculation read RPC remains SECURITY INVOKER'
);

select is(
  has_table_privilege(
    'authenticated',
    'public.admin_audit_log',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  false,
  'authenticated still has no direct audit-log table privileges'
);

select ok(to_regclass('public.admin_audit_log_actor_user_id_idx') is not null,
  'audit-log actor FK index exists');
select ok(to_regclass('public.food_categories_parent_id_idx') is not null,
  'food-category parent FK index exists');
select ok(to_regclass('public.food_fact_allergen_assessments_allergen_id_idx') is not null,
  'food-fact allergen reverse FK index exists');
select ok(to_regclass('public.food_fact_dietary_tags_dietary_tag_id_idx') is not null,
  'food-fact dietary-tag reverse FK index exists');
select ok(to_regclass('public.food_fact_nutrients_nutrient_id_idx') is not null,
  'food-fact nutrient reverse FK index exists');
select ok(to_regclass('public.food_fact_unit_conversions_unit_id_idx') is not null,
  'food-fact unit-conversion reverse FK index exists');
select ok(to_regclass('public.food_fact_versions_category_id_idx') is not null,
  'food-fact category FK index exists');
select ok(to_regclass('public.household_food_rules_rule_code_idx') is not null,
  'household food-rule catalog-code FK index exists');
select ok(to_regclass('public.household_rule_catalog_targets_allergen_id_idx') is not null,
  'household rule allergen-target FK index exists');
select ok(to_regclass('public.household_rule_catalog_targets_category_id_idx') is not null,
  'household rule category-target FK index exists');
select ok(to_regclass('public.household_rule_catalog_targets_dietary_tag_id_idx') is not null,
  'household rule dietary-tag-target FK index exists');
select ok(to_regclass('public.recipe_version_tags_recipe_tag_id_idx') is not null,
  'recipe-version tag reverse FK index exists');
select ok(to_regclass('public.recipe_ingredients_unit_id_idx') is not null,
  'recipe ingredient unit FK index exists');
select ok(to_regclass('public.shopping_list_item_sources_meal_option_recipe_id_idx') is not null,
  'shopping-source meal-option-recipe FK index exists');

select * from finish();
rollback;
