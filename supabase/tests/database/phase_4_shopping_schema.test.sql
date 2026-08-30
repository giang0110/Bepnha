begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', table_name, table_name || ' exists')
from unnest(array[
  'shopping_lists',
  'shopping_list_items',
  'shopping_list_item_sources',
  'shopping_item_check_states'
]) as expected(table_name);

select has_function('public', 'get_shopping_list', array['uuid', 'uuid']);
select has_function('public', 'set_shopping_item_checked', array['uuid', 'boolean']);
select has_function('private', 'is_canonical_decimal_text', array['text', 'boolean']);
select has_function('private', 'assert_shopping_source_row', array[]::text[]);
select has_function('private', 'assert_revision_shopping_row', array['uuid']);

select is(
  (
    select count(*)::integer
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any(array[
        'shopping_lists',
        'shopping_list_items',
        'shopping_list_item_sources',
        'shopping_item_check_states'
      ])
      and relation.relrowsecurity
  ),
  4,
  'RLS is enabled on every Phase 4 public table'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.shopping_lists'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like 'UNIQUE (meal_plan_revision_id)%'
  ),
  'one shopping list is allowed per exact revision'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.shopping_list_items'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like 'UNIQUE (shopping_list_id, food_id)%'
  ),
  'one stable food line is allowed per list'
);

select is(
  has_table_privilege('authenticated', 'public.shopping_list_items', 'INSERT,UPDATE,DELETE'),
  false,
  'authenticated cannot mutate authoritative shopping lines directly'
);
select is(
  has_table_privilege('authenticated', 'public.shopping_item_check_states', 'INSERT,UPDATE,DELETE'),
  false,
  'authenticated cannot mutate check rows directly'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.get_shopping_list(uuid,uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated can call owner-scoped shopping read RPC'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.set_shopping_item_checked(uuid,boolean)',
    'EXECUTE'
  ),
  true,
  'authenticated can call the narrow check-state RPC'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)',
    'EXECUTE'
  ),
  false,
  'browser roles still cannot execute trusted plan persistence'
);

select * from finish();
rollback;
