begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email)
values
  ('25000000-0000-0000-0000-000000000001', 'pantry-a@example.test'),
  ('25000000-0000-0000-0000-000000000002', 'pantry-b@example.test');

insert into public.households (
  id,
  owner_user_id,
  weekly_plan_budget_vnd,
  max_elapsed_minutes
) values
  (
    '35000000-0000-0000-0000-000000000001',
    '25000000-0000-0000-0000-000000000001',
    1000000,
    30
  ),
  (
    '35000000-0000-0000-0000-000000000002',
    '25000000-0000-0000-0000-000000000002',
    1000000,
    30
  );

insert into public.foods (
  id,
  code,
  name_vi,
  base_dimension,
  base_unit_id
) values (
  '75000000-0000-0000-0000-000000000001',
  'pantry_test_rice',
  'Gạo kiểm thử pantry',
  'mass',
  '70010000-0000-0000-0000-000000000001'
);

insert into public.food_fact_versions (
  id,
  food_id,
  version_number,
  category_id,
  edible_fraction,
  provenance,
  created_by
) values (
  '75100000-0000-0000-0000-000000000001',
  '75000000-0000-0000-0000-000000000001',
  1,
  '70020000-0000-0000-0000-000000000013',
  1,
  'phase 5 pantry RLS fixture',
  '25000000-0000-0000-0000-000000000001'
);

insert into public.food_fact_unit_conversions (
  food_fact_version_id,
  unit_id,
  base_quantity_per_unit,
  gross_grams_per_unit,
  display_step,
  provenance
) values
  (
    '75100000-0000-0000-0000-000000000001',
    '70010000-0000-0000-0000-000000000001',
    1,
    1,
    1,
    'phase 5 pantry base unit fixture'
  ),
  (
    '75100000-0000-0000-0000-000000000001',
    '70010000-0000-0000-0000-000000000002',
    1000,
    1000,
    0.001,
    'phase 5 pantry kg fixture'
  );

select is(
  has_table_privilege('authenticated', 'public.pantry_items', 'SELECT'),
  true,
  'authenticated can select pantry rows subject to owner RLS'
);
select is(
  has_table_privilege('authenticated', 'public.pantry_items', 'INSERT,UPDATE,DELETE'),
  false,
  'authenticated cannot mutate pantry rows directly'
);
select is(
  has_function_privilege('authenticated', 'public.get_pantry(uuid)', 'EXECUTE'),
  true,
  'authenticated can read own pantry through the narrow RPC'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.upsert_pantry_item(uuid,uuid,uuid,uuid,numeric,integer)',
    'EXECUTE'
  ),
  true,
  'authenticated can upsert own pantry through the narrow RPC'
);
select is(
  has_function_privilege('authenticated', 'public.delete_pantry_item(uuid,integer)', 'EXECUTE'),
  true,
  'authenticated can delete own pantry through the narrow RPC'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pantry_items'
  ),
  1,
  'pantry_items exposes one owner-scoped SELECT policy only'
);

select set_config('request.jwt.claim.sub', '25000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"25000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select public.upsert_pantry_item(
      '35000000-0000-0000-0000-000000000001',
      '75000000-0000-0000-0000-000000000001',
      '75100000-0000-0000-0000-000000000001',
      '70010000-0000-0000-0000-000000000002',
      0,
      0
    )
  $$,
  'owner can insert an explicit zero-quantity pantry item at expected version zero'
);
select is(
  (
    select version
    from public.pantry_items
    where household_id = '35000000-0000-0000-0000-000000000001'
      and food_id = '75000000-0000-0000-0000-000000000001'
  ),
  1,
  'new pantry item starts at version one'
);
select is(
  (
    select base_quantity::text
    from public.pantry_items
    where household_id = '35000000-0000-0000-0000-000000000001'
      and food_id = '75000000-0000-0000-0000-000000000001'
  ),
  '0.000000000000',
  'zero quantity derives zero base quantity without deleting the row'
);

select lives_ok(
  $$
    select public.upsert_pantry_item(
      '35000000-0000-0000-0000-000000000001',
      '75000000-0000-0000-0000-000000000001',
      '75100000-0000-0000-0000-000000000001',
      '70010000-0000-0000-0000-000000000002',
      0.25,
      1
    )
  $$,
  'owner can update pantry at the exact optimistic version'
);
select is(
  (
    select version
    from public.pantry_items
    where household_id = '35000000-0000-0000-0000-000000000001'
      and food_id = '75000000-0000-0000-0000-000000000001'
  ),
  2,
  'successful update increments pantry version exactly once'
);
select is(
  (
    select base_quantity::text
    from public.pantry_items
    where household_id = '35000000-0000-0000-0000-000000000001'
      and food_id = '75000000-0000-0000-0000-000000000001'
  ),
  '250.000000000000',
  'pinned kg conversion deterministically derives canonical base quantity'
);
select throws_ok(
  $$
    select public.upsert_pantry_item(
      '35000000-0000-0000-0000-000000000001',
      '75000000-0000-0000-0000-000000000001',
      '75100000-0000-0000-0000-000000000001',
      '70010000-0000-0000-0000-000000000002',
      0.5,
      1
    )
  $$,
  'P0001',
  'STALE_PANTRY_VERSION',
  'stale pantry optimistic version fails closed'
);

reset role;
select set_config('request.jwt.claim.sub', '25000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"25000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.pantry_items),
  0,
  'RLS hides owner A pantry rows from owner B'
);
select throws_ok(
  $$ select * from public.get_pantry('35000000-0000-0000-0000-000000000001') $$,
  '42501',
  'PANTRY_HOUSEHOLD_FORBIDDEN',
  'owner B cannot read owner A pantry through the RPC'
);
select throws_ok(
  $$
    select public.upsert_pantry_item(
      '35000000-0000-0000-0000-000000000001',
      '75000000-0000-0000-0000-000000000001',
      '75100000-0000-0000-0000-000000000001',
      '70010000-0000-0000-0000-000000000002',
      1,
      2
    )
  $$,
  '42501',
  'PANTRY_HOUSEHOLD_FORBIDDEN',
  'owner B cannot mutate owner A pantry through the RPC'
);
select throws_ok(
  $$
    select public.delete_pantry_item(
      (
        select id
        from public.pantry_items
        where household_id = '35000000-0000-0000-0000-000000000001'
      ),
      2
    )
  $$,
  null,
  null,
  'owner B cannot delete owner A pantry item'
);

reset role;
select set_config('request.jwt.claim.sub', '25000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"25000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select public.delete_pantry_item(
      (
        select id
        from public.pantry_items
        where household_id = '35000000-0000-0000-0000-000000000001'
          and food_id = '75000000-0000-0000-0000-000000000001'
      ),
      1
    )
  $$,
  'P0001',
  'STALE_PANTRY_VERSION',
  'delete requires the exact optimistic version'
);
select lives_ok(
  $$
    select public.delete_pantry_item(
      (
        select id
        from public.pantry_items
        where household_id = '35000000-0000-0000-0000-000000000001'
          and food_id = '75000000-0000-0000-0000-000000000001'
      ),
      2
    )
  $$,
  'owner can delete own pantry item at the exact version'
);
select is(
  (select count(*)::integer from public.pantry_items),
  0,
  'successful delete removes only the owned current pantry row'
);

select * from finish();
rollback;
