begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_audit_log'
      and policyname = 'admin_audit_log_no_direct_access'
      and cmd = 'ALL'
      and roles = array['public']::name[]
  ),
  1,
  'admin audit log has an explicit deny-all public policy'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.get_pantry(uuid)'::regprocedure
  ),
  false,
  'pantry read RPC runs as security invoker'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.get_published_meal_option_calculation_input(uuid)'::regprocedure
  ),
  false,
  'published meal-option read RPC runs as security invoker'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.get_meal_option_aggregate_for_publication(uuid)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot execute the draft-capable meal-option aggregate helper'
);

select is(
  has_function_privilege(
    'anon',
    'public.get_meal_option_aggregate_for_publication(uuid)',
    'EXECUTE'
  ),
  false,
  'anon cannot execute the meal-option aggregate helper'
);

select ok(
  (
    select bool_and(prosecdef and array_to_string(proconfig, ',') like '%search_path=%')
    from pg_proc
    where oid in (
      'public.upsert_pantry_item(uuid,uuid,uuid,uuid,numeric,integer)'::regprocedure,
      'public.delete_pantry_item(uuid,integer)'::regprocedure,
      'public.set_shopping_item_checked(uuid,boolean)'::regprocedure
    )
  ),
  'narrow authenticated mutation RPCs remain security definer with fixed search paths'
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
  3,
  'only three public security-definer functions are callable by authenticated users'
);

select is(
  (
    select count(*)::integer
    from pg_proc as function
    join pg_namespace as namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.prosecdef
      and has_function_privilege('authenticated', function.oid, 'EXECUTE')
      and function.oid in (
        'public.upsert_pantry_item(uuid,uuid,uuid,uuid,numeric,integer)'::regprocedure,
        'public.delete_pantry_item(uuid,integer)'::regprocedure,
        'public.set_shopping_item_checked(uuid,boolean)'::regprocedure
      )
  ),
  3,
  'the authenticated security-definer allowlist contains only the three narrow mutation RPCs'
);

select is(
  (
    select count(*)::integer
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'recipe_step_ingredients'
      and indexname = 'recipe_step_ingredients_step_fk_idx'
  ),
  1,
  'recipe step foreign-key index exists'
);

select is(
  (
    select count(*)::integer
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'recipe_step_ingredients'
      and indexname = 'recipe_step_ingredients_ingredient_fk_idx'
  ),
  1,
  'recipe ingredient foreign-key index exists'
);

select is(
  has_table_privilege('authenticated', 'public.admin_audit_log', 'SELECT,INSERT,UPDATE,DELETE'),
  false,
  'authenticated still has no direct audit-log table privileges'
);

select is(
  (select count(*)::integer from pg_indexes
   where schemaname='public' and tablename='meal_option_recipes'
     and indexname='meal_option_recipes_recipe_version_fk_idx'),
  1,
  'meal-option recipe reverse FK index exists'
);

select is(
  (select count(*)::integer from pg_indexes
   where schemaname='public' and tablename='meal_option_version_tags'
     and indexname='meal_option_version_tags_recipe_tag_idx'),
  1,
  'meal-option tag reverse FK index exists'
);

select is(
  (select count(*)::integer from pg_indexes
   where schemaname='public' and tablename='recipe_ingredients'
     and indexname='recipe_ingredients_food_fact_fk_idx'),
  1,
  'recipe ingredient food-fact reverse FK index exists'
);

select is(
  (select count(*)::integer from pg_indexes
   where schemaname='public' and tablename='food_prices'
     and indexname='food_prices_food_fact_fk_idx'),
  1,
  'food price food-fact reverse FK index exists'
);

select * from finish();
rollback;
