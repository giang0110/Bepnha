begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

insert into auth.users (id, email)
values
  ('20000000-0000-0000-0000-000000000001', 'household-a@example.test'),
  ('20000000-0000-0000-0000-000000000002', 'household-b@example.test');

set local role anon;

select throws_ok(
  $$ select * from public.household_rule_options $$,
  null,
  null,
  'anon cannot select canonical options'
);
select throws_ok(
  $$ select * from public.households $$,
  null,
  null,
  'anon cannot select households'
);

reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    insert into public.households (
      id,
      owner_user_id,
      weekly_plan_budget_vnd,
      max_elapsed_minutes
    ) values (
      '30000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      1000000,
      30
    )
  $$,
  'A can directly create one incomplete owned household'
);

select lives_ok(
  $$
    insert into public.household_member_groups (
      id,
      household_id,
      member_kind,
      age_band,
      member_count
    ) values (
      '40000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      'adult',
      'adult',
      2
    )
  $$,
  'A can directly add a valid grouped member'
);

select lives_ok(
  $$
    update public.households
    set onboarding_completed_at = now()
    where id = '30000000-0000-0000-0000-000000000001'
  $$,
  'A can complete onboarding after valid groups exist'
);

select lives_ok(
  $$
    insert into public.household_food_rules (household_id, rule_code)
    values ('30000000-0000-0000-0000-000000000001', 'allergen_peanut')
  $$,
  'A can directly add a non-conflicting hard rule'
);

select lives_ok(
  $$
    update public.household_member_groups
    set member_count = 3
    where id = '40000000-0000-0000-0000-000000000001'
  $$,
  'A can directly update a member while the completed household stays valid'
);

select lives_ok(
  $$
    delete from public.household_food_rules
    where household_id = '30000000-0000-0000-0000-000000000001'
      and rule_code = 'allergen_peanut'
  $$,
  'A can directly remove a valid rule'
);

select throws_ok(
  $$
    insert into public.households (owner_user_id, weekly_plan_budget_vnd, max_elapsed_minutes)
    values ('20000000-0000-0000-0000-000000000001', 900000, 30)
  $$,
  null,
  null,
  'A cannot bypass one-household-per-owner'
);

select throws_ok(
  $$
    update public.households
    set owner_user_id = '20000000-0000-0000-0000-000000000002'
    where id = '30000000-0000-0000-0000-000000000001'
  $$,
  null,
  null,
  'A cannot reassign household ownership'
);

select throws_ok(
  $$
    insert into public.household_member_groups (
      household_id,
      member_kind,
      age_band,
      member_count
    ) values (
      '30000000-0000-0000-0000-000000000001',
      'elderly',
      'elderly',
      18
    )
  $$,
  null,
  null,
  'direct writes cannot take a completed household above 20 members'
);

select is(
  (
    select count(*)::integer
    from public.household_member_groups
    where household_id = '30000000-0000-0000-0000-000000000001'
  ),
  1,
  'failed total mutation persists no extra member row'
);

select throws_ok(
  $$
    delete from public.household_member_groups
    where id = '40000000-0000-0000-0000-000000000001'
  $$,
  null,
  null,
  'direct writes cannot delete the final completed-household member'
);

select is(
  (
    select member_count::integer
    from public.household_member_groups
    where id = '40000000-0000-0000-0000-000000000001'
  ),
  3,
  'failed final-member deletion rolls back atomically'
);

select throws_ok(
  $$
    insert into public.household_food_rules (household_id, rule_code)
    values
      ('30000000-0000-0000-0000-000000000001', 'exclude_pork'),
      ('30000000-0000-0000-0000-000000000001', 'prefer_pork')
  $$,
  null,
  null,
  'direct Data API write rejects a hard/soft same-target conflict'
);

select is(
  (
    select count(*)::integer
    from public.household_food_rules
    where household_id = '30000000-0000-0000-0000-000000000001'
      and rule_code in ('exclude_pork', 'prefer_pork')
  ),
  0,
  'the conflicting multi-row statement persists neither rule'
);

reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is((select count(*)::integer from public.households), 0, 'B cannot read A household');
select is((select count(*)::integer from public.household_member_groups), 0, 'B cannot read A groups');
select is((select count(*)::integer from public.household_food_rules), 0, 'B cannot read A rules');

select lives_ok(
  $$
    insert into public.households (
      id,
      owner_user_id,
      weekly_plan_budget_vnd,
      max_elapsed_minutes
    ) values (
      '30000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000002',
      800000,
      45
    )
  $$,
  'B can create its own incomplete household'
);

select throws_ok(
  $$
    insert into public.household_member_groups (
      household_id,
      member_kind,
      age_band,
      member_count
    ) values (
      '30000000-0000-0000-0000-000000000001',
      'child',
      '4_6',
      1
    )
  $$,
  null,
  null,
  'B cannot insert a child group into A household'
);

select is(
  (select version from public.households where id = '30000000-0000-0000-0000-000000000002'),
  1,
  'B incomplete household begins at version 1'
);

select throws_ok(
  $$
    update public.households
    set onboarding_completed_at = now()
    where id = '30000000-0000-0000-0000-000000000002'
  $$,
  null,
  null,
  'direct household update cannot complete onboarding with zero members'
);

select is(
  (
    select onboarding_completed_at is null
    from public.households
    where id = '30000000-0000-0000-0000-000000000002'
  ),
  true,
  'failed completion leaves onboarding timestamp null'
);

select is(
  (select version from public.households where id = '30000000-0000-0000-0000-000000000002'),
  1,
  'failed completion also rolls back version increment'
);

reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select public.save_household_setup(
      (select version from public.households where id = '30000000-0000-0000-0000-000000000001'),
      123456,
      60::smallint,
      '[{"memberKind":"adult","ageBand":"adult","memberCount":20},{"memberKind":"elderly","ageBand":"elderly","memberCount":1}]'::jsonb,
      array['prefer_soup']::text[]
    )
  $$,
  null,
  null,
  'RPC invalid member state reaches authoritative trigger and fails atomically'
);

select is(
  (
    select row(weekly_plan_budget_vnd, max_elapsed_minutes, version)::text
    from public.households
    where id = '30000000-0000-0000-0000-000000000001'
  ),
  '(1000000,30,2)',
  'member-trigger failure rolls back parent budget, time, and version'
);

select is(
  (
    select jsonb_agg(
      jsonb_build_object(
        'kind', member_kind,
        'band', age_band,
        'count', member_count
      ) order by member_kind, age_band
    )
    from public.household_member_groups
    where household_id = '30000000-0000-0000-0000-000000000001'
  ),
  '[{"band":"adult","kind":"adult","count":3}]'::jsonb,
  'member-trigger failure restores the prior group snapshot'
);

select throws_ok(
  $$
    select public.save_household_setup(
      (select version from public.households where id = '30000000-0000-0000-0000-000000000001'),
      654321,
      90::smallint,
      '[{"memberKind":"adult","ageBand":"adult","memberCount":2}]'::jsonb,
      array['exclude_beef', 'prefer_beef']::text[]
    )
  $$,
  null,
  null,
  'RPC hard/soft conflict reaches authoritative trigger and fails atomically'
);

select is(
  (
    select row(weekly_plan_budget_vnd, max_elapsed_minutes, version)::text
    from public.households
    where id = '30000000-0000-0000-0000-000000000001'
  ),
  '(1000000,30,2)',
  'rule-trigger failure rolls back all parent changes'
);

select is(
  (
    select count(*)::integer
    from public.household_food_rules
    where household_id = '30000000-0000-0000-0000-000000000001'
  ),
  0,
  'rule-trigger failure restores the prior rule snapshot'
);

select throws_ok(
  $$
    select public.save_household_setup(
      999,
      1000000,
      30::smallint,
      '[{"memberKind":"adult","ageBand":"adult","memberCount":2}]'::jsonb,
      array[]::text[]
    )
  $$,
  null,
  null,
  'stale RPC versions cannot overwrite the household'
);

select * from finish();
rollback;
