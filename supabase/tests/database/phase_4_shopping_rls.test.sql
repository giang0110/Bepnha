begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select is(
  has_table_privilege('anon', 'public.shopping_lists', 'SELECT'),
  false,
  'anonymous cannot read shopping lists'
);
select is(
  has_table_privilege('anon', 'public.shopping_list_items', 'SELECT'),
  false,
  'anonymous cannot read shopping items'
);
select is(
  has_table_privilege('anon', 'public.shopping_list_item_sources', 'SELECT'),
  false,
  'anonymous cannot read shopping provenance'
);
select is(
  has_table_privilege('anon', 'public.shopping_item_check_states', 'SELECT'),
  false,
  'anonymous cannot read checked state'
);

select is(
  has_table_privilege('authenticated', 'public.shopping_lists', 'SELECT'),
  true,
  'authenticated receives owner-filtered shopping list reads'
);
select is(
  has_table_privilege('authenticated', 'public.shopping_list_items', 'SELECT'),
  true,
  'authenticated receives owner-filtered shopping item reads'
);
select is(
  has_table_privilege('authenticated', 'public.shopping_list_item_sources', 'SELECT'),
  true,
  'authenticated receives owner-filtered provenance reads'
);
select is(
  has_table_privilege('authenticated', 'public.shopping_item_check_states', 'SELECT'),
  true,
  'authenticated receives owner-filtered check-state reads'
);

select is(
  has_function_privilege('anon', 'public.get_shopping_list(uuid,uuid)', 'EXECUTE'),
  false,
  'anonymous cannot execute shopping read RPC'
);
select is(
  has_function_privilege('anon', 'public.set_shopping_item_checked(uuid,boolean)', 'EXECUTE'),
  false,
  'anonymous cannot execute check-state RPC'
);
select is(
  has_function_privilege('authenticated', 'public.get_shopping_list(uuid,uuid)', 'EXECUTE'),
  true,
  'authenticated can execute owner-scoped read RPC'
);
select is(
  has_function_privilege('authenticated', 'public.set_shopping_item_checked(uuid,boolean)', 'EXECUTE'),
  true,
  'authenticated can execute owner-scoped check RPC'
);

select ok(
  (
    select not prosecdef and array_to_string(proconfig, ',') like '%search_path=%'
    from pg_proc
    where oid = 'public.get_shopping_list(uuid,uuid)'::regprocedure
  ),
  'shopping read is security invoker with fixed search path'
);
select ok(
  (
    select prosecdef and array_to_string(proconfig, ',') like '%search_path=%'
    from pg_proc
    where oid = 'public.set_shopping_item_checked(uuid,boolean)'::regprocedure
  ),
  'check-state RPC is security definer with fixed search path'
);

select * from finish();
rollback;
