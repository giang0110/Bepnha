begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_audit_log'
      and policyname = 'admin_audit_log_no_client_access'
      and cmd = 'ALL'
  ),
  'admin audit log has an explicit deny-all client policy'
);

select is(
  has_function_privilege('anon', 'public.delete_pantry_item(uuid,integer)', 'EXECUTE'),
  false,
  'anon cannot execute delete_pantry_item'
);
select is(
  has_function_privilege('anon', 'public.get_pantry(uuid)', 'EXECUTE'),
  false,
  'anon cannot execute get_pantry'
);
select is(
  has_function_privilege('anon', 'public.get_published_meal_option_calculation_input(uuid)', 'EXECUTE'),
  false,
  'anon cannot execute published meal option calculation input'
);
select is(
  has_function_privilege('anon', 'public.set_shopping_item_checked(uuid,boolean)', 'EXECUTE'),
  false,
  'anon cannot execute set_shopping_item_checked'
);
select is(
  has_function_privilege('anon', 'public.upsert_pantry_item(uuid,uuid,uuid,uuid,numeric,integer)', 'EXECUTE'),
  false,
  'anon cannot execute upsert_pantry_item'
);

select is(
  has_function_privilege('authenticated', 'public.delete_pantry_item(uuid,integer)', 'EXECUTE'),
  true,
  'authenticated can execute delete_pantry_item'
);
select is(
  has_function_privilege('authenticated', 'public.get_pantry(uuid)', 'EXECUTE'),
  true,
  'authenticated can execute get_pantry'
);
select is(
  has_function_privilege('authenticated', 'public.get_published_meal_option_calculation_input(uuid)', 'EXECUTE'),
  true,
  'authenticated can execute published meal option calculation input'
);
select is(
  has_function_privilege('authenticated', 'public.set_shopping_item_checked(uuid,boolean)', 'EXECUTE'),
  true,
  'authenticated can execute set_shopping_item_checked'
);
select is(
  has_function_privilege('authenticated', 'public.upsert_pantry_item(uuid,uuid,uuid,uuid,numeric,integer)', 'EXECUTE'),
  true,
  'authenticated can execute upsert_pantry_item'
);

select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'delete_pantry_item',
        'get_pantry',
        'get_published_meal_option_calculation_input',
        'set_shopping_item_checked',
        'upsert_pantry_item'
      )
      and p.prosecdef
      and array_position(p.proconfig, 'search_path=""') is not null
  ),
  5,
  'all intended SECURITY DEFINER RPCs pin an empty search_path'
);

select is(
  has_table_privilege('authenticated', 'public.admin_audit_log', 'SELECT'),
  false,
  'authenticated still has no direct SELECT privilege on the audit log'
);

select * from finish();
rollback;
