begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'pantry_items', 'pantry_items exists');
select has_function('public', 'get_pantry', array['uuid']);
select has_function(
  'public',
  'upsert_pantry_item',
  array['uuid', 'uuid', 'uuid', 'uuid', 'numeric', 'integer']
);
select has_function('public', 'delete_pantry_item', array['uuid', 'integer']);

select is(
  (
    select relrowsecurity
    from pg_class
    where oid = to_regclass('public.pantry_items')
  ),
  true,
  'RLS is enabled on pantry_items'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.pantry_items')
      and contype = 'u'
      and pg_get_constraintdef(oid) like 'UNIQUE (household_id, food_id)%'
  ),
  'one current pantry row exists per household and stable food'
);

select * from finish();
rollback;
