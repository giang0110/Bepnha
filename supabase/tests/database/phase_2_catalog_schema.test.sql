begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_table('public', table_name, table_name || ' exists')
from unnest(array[
  'units',
  'food_categories',
  'allergens',
  'dietary_tags',
  'nutrients',
  'price_regions',
  'foods',
  'food_fact_versions',
  'food_fact_unit_conversions',
  'food_fact_allergen_assessments',
  'food_fact_dietary_tags',
  'food_fact_nutrients',
  'household_rule_catalog_targets',
  'recipes',
  'recipe_versions',
  'recipe_ingredients',
  'recipe_steps',
  'recipe_step_ingredients',
  'recipe_tags',
  'recipe_version_tags',
  'price_books',
  'food_prices',
  'admin_audit_log'
]) as expected(table_name);

select is((select count(*)::integer from public.units), 7, 'seven canonical units are seeded');
select is((select count(*)::integer from public.allergens), 10, 'ten allergens are seeded');
select is((select count(*)::integer from public.nutrients), 6, 'six required nutrients are seeded');
select is((select count(*)::integer from public.recipe_tags), 17, 'seventeen inert recipe tags are seeded');
select is(
  (select count(*)::integer from public.household_rule_catalog_targets),
  18,
  'all eighteen Phase 1 hard options have catalog mappings'
);
select is(
  (
    select mapping_kind
    from public.household_rule_catalog_targets
    where rule_code = 'allergen_other'
  ),
  'unsupported',
  'allergen_other remains explicitly unsupported'
);
select is(
  (
    select count(*)::integer
    from public.household_rule_options as option
    left join public.household_rule_catalog_targets as target on target.rule_code = option.code
    where option.rule_kind <> 'soft_preference'
      and target.rule_code is null
  ),
  0,
  'no hard rule is unmapped'
);
select is(
  (
    select count(*)::integer
    from public.household_rule_options as option
    join public.household_rule_catalog_targets as target on target.rule_code = option.code
    where option.rule_kind = 'soft_preference'
  ),
  0,
  'no soft preference has a hard-rule mapping'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'households'
      and column_name = 'price_region_id'
      and is_nullable = 'NO'
  ),
  1,
  'households have a required database-managed price region'
);

select is(
  (
    select count(*)::integer
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any(array[
        'units', 'food_categories', 'allergens', 'dietary_tags', 'nutrients',
        'price_regions', 'foods', 'food_fact_versions', 'food_fact_unit_conversions',
        'food_fact_allergen_assessments', 'food_fact_dietary_tags',
        'food_fact_nutrients', 'household_rule_catalog_targets', 'recipes',
        'recipe_versions', 'recipe_ingredients', 'recipe_steps',
        'recipe_step_ingredients', 'recipe_tags', 'recipe_version_tags',
        'price_books', 'food_prices', 'admin_audit_log'
      ])
      and relation.relrowsecurity
  ),
  23,
  'RLS is enabled on every Phase 2 public table'
);

select has_function('public', 'publish_food_fact_version', array['uuid', 'text', 'uuid', 'integer']);
select has_function('public', 'publish_recipe_version', array['uuid', 'text', 'uuid', 'integer']);
select has_function('public', 'publish_price_book', array['uuid', 'text', 'uuid', 'integer']);
select has_function('public', 'retire_catalog_identity', array['text', 'uuid', 'uuid', 'integer']);
select has_function('public', 'get_current_price_book', array['uuid']);
select has_function('public', 'get_published_recipe_calculation_input', array['uuid', 'uuid']);
select has_function('public', 'get_catalog_aggregate_for_publication', array['text', 'uuid']);

select is(
  has_function_privilege(
    'authenticated',
    'public.publish_recipe_version(uuid,text,uuid,integer)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot publish catalog versions'
);
select is(
  has_function_privilege(
    'service_role',
    'public.publish_recipe_version(uuid,text,uuid,integer)',
    'EXECUTE'
  ),
  true,
  'service role can execute the restricted recipe publication RPC'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.get_published_recipe_calculation_input(uuid,uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated can load an exact published calculation input'
);
select is(
  has_function_privilege(
    'anon',
    'public.get_published_recipe_calculation_input(uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'anon cannot load catalog calculation input'
);

select is(
  has_table_privilege('authenticated', 'public.foods', 'SELECT'),
  true,
  'authenticated has published reference read access'
);
select is(
  has_table_privilege('authenticated', 'public.foods', 'INSERT,UPDATE,DELETE'),
  false,
  'authenticated cannot mutate stable catalog identities'
);
select is(
  has_table_privilege('authenticated', 'public.admin_audit_log', 'SELECT'),
  false,
  'authenticated cannot read catalog audit records'
);
select is(
  has_column_privilege('service_role', 'public.food_fact_versions', 'publication_status', 'UPDATE'),
  false,
  'service role cannot directly change publication status'
);
select is(
  has_column_privilege('service_role', 'public.foods', 'current_fact_version_id', 'UPDATE'),
  false,
  'service role cannot directly change current fact pointers'
);

select ok(
  (
    select bool_and(prosecdef and array_to_string(proconfig, ',') like '%search_path=%')
    from pg_proc
    where oid in (
      'public.publish_food_fact_version(uuid,text,uuid,integer)'::regprocedure,
      'public.publish_recipe_version(uuid,text,uuid,integer)'::regprocedure,
      'public.publish_price_book(uuid,text,uuid,integer)'::regprocedure,
      'public.retire_catalog_identity(text,uuid,uuid,integer)'::regprocedure
    )
  ),
  'trusted mutation RPCs are security definer with fixed search paths'
);
select ok(
  (
    select bool_and(not prosecdef and array_to_string(proconfig, ',') like '%search_path=%')
    from pg_proc
    where oid in (
      'public.get_current_price_book(uuid)'::regprocedure,
      'public.get_published_recipe_calculation_input(uuid,uuid)'::regprocedure
    )
  ),
  'authenticated read RPCs are security invoker with fixed search paths'
);

select * from finish();
rollback;
