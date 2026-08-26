begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', table_name, table_name || ' exists')
from unnest(array[
  'meal_options',
  'meal_option_versions',
  'meal_option_recipes',
  'meal_option_version_tags',
  'meal_plans',
  'meal_plan_revisions',
  'meal_plan_items'
]) as expected(table_name);

select has_check('public', 'food_prices', 'food_prices_purchase_increment_whole');
select has_function('public', 'publish_meal_option_version', array['uuid', 'text', 'uuid', 'integer']);
select has_function('public', 'retire_meal_option', array['uuid', 'uuid', 'integer']);
select has_function('public', 'get_meal_option_aggregate_for_publication', array['uuid']);
select has_function('public', 'get_published_meal_option_calculation_input', array['uuid']);
select has_function('public', 'get_planner_generation_input', array['uuid', 'date', 'date']);
select has_function('public', 'get_plan_replacement_input', array['uuid']);
select has_function(
  'public',
  'persist_meal_plan_revision',
  array['uuid', 'uuid', 'date', 'integer', 'uuid', 'uuid', 'jsonb', 'jsonb']
);

select is(
  (
    select count(*)::integer
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any(array[
        'meal_options', 'meal_option_versions', 'meal_option_recipes',
        'meal_option_version_tags', 'meal_plans', 'meal_plan_revisions', 'meal_plan_items'
      ])
      and relation.relrowsecurity
  ),
  7,
  'RLS is enabled on every Phase 3 public table'
);

select is(
  has_table_privilege('authenticated', 'public.meal_plans', 'INSERT,UPDATE,DELETE'),
  false,
  'authenticated cannot directly mutate stable plans'
);
select is(
  has_table_privilege('service_role', 'public.meal_plan_revisions', 'INSERT,UPDATE,DELETE'),
  false,
  'service role persists revisions only through the narrow RPC'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)',
    'EXECUTE'
  ),
  false,
  'browser roles cannot execute plan persistence'
);
select is(
  has_function_privilege(
    'service_role',
    'public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)',
    'EXECUTE'
  ),
  true,
  'service role can execute only the restricted persistence entry point'
);

select ok(
  (
    select prosecdef and array_to_string(proconfig, ',') like '%search_path=%'
    from pg_proc
    where oid = 'public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)'::regprocedure
  ),
  'persistence is security definer with fixed search path'
);

select * from finish();
rollback;
