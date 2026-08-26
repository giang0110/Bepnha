begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, raw_app_meta_data)
values
  ('81000000-0000-0000-0000-000000000001', 'planner-a@example.test', '{}'),
  ('81000000-0000-0000-0000-000000000002', 'planner-b@example.test', '{}');
insert into public.households (
  id, owner_user_id, weekly_plan_budget_vnd, max_elapsed_minutes
)
values
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 700000, 30),
  ('82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000002', 700000, 30);
insert into public.household_member_groups (household_id, member_kind, age_band, member_count)
values
  ('82000000-0000-0000-0000-000000000001', 'adult', 'adult', 1),
  ('82000000-0000-0000-0000-000000000002', 'adult', 'adult', 1);
update public.households
set onboarding_completed_at = now()
where id in (
  '82000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000002'
);

select private.begin_plan_transition();
insert into public.meal_plans (
  id, household_id, week_start, timezone, status, version, calculation_fingerprint,
  total_estimated_cost_vnd, budget_status
)
values (
  '83000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  date '2026-08-31', 'Asia/Ho_Chi_Minh', 'ready', 1, repeat('a', 64), 700000, 'within'
);
insert into public.meal_plan_revisions (
  id, meal_plan_id, revision_number, revision_kind, idempotency_key,
  household_setup_version, engine_version, portion_config_version,
  price_freshness_config_version, planner_config_version, calculation_date,
  catalog_fingerprint, input_fingerprint, calculation_fingerprint,
  input_snapshot, calculation_snapshot, budget_vnd, total_estimated_cost_vnd,
  overage_vnd, budget_status, warnings, state, sealed_at
)
values (
  '84000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001', 1, 'generation',
  '85000000-0000-0000-0000-000000000001', 1, 'planner-engine-v1',
  'portion-v1', 'price-freshness-v1', 'planner-v1', date '2026-08-26',
  repeat('b', 64), repeat('c', 64), repeat('a', 64), '{}'::jsonb,
  '{"purchaseBasket":{"lines":[{"lineCostVnd":700000}],"totalEstimatedCostVnd":700000}}'::jsonb,
  700000, 700000, 0, 'within', '[]'::jsonb, 'ready', now()
);
update public.meal_plans
set current_revision_id = '84000000-0000-0000-0000-000000000001'
where id = '83000000-0000-0000-0000-000000000001';
select private.end_plan_transition();

set local role anon;
select throws_ok($$ select * from public.meal_plans $$, null, null, 'anon has no plan table grant');
select throws_ok(
  $$ select public.get_plan_replacement_input('83000000-0000-0000-0000-000000000001') $$,
  null,
  null,
  'anon cannot call replacement input loader'
);

reset role;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.meal_plans), 1, 'owner A reads its plan');
select is((select count(*)::integer from public.meal_plan_revisions), 1, 'owner A reads its revision');
select throws_ok(
  $$ insert into public.meal_plans (household_id, week_start, timezone) values ('82000000-0000-0000-0000-000000000001', date '2026-09-07', 'Asia/Ho_Chi_Minh') $$,
  null,
  null,
  'direct authenticated plan writes are forbidden'
);
select throws_ok(
  $$ select public.persist_meal_plan_revision('81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', date '2026-09-07', 0, null, gen_random_uuid(), '{}'::jsonb, '[]'::jsonb) $$,
  null,
  null,
  'authenticated cannot execute trusted persistence'
);

reset role;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.meal_plans), 0, 'owner B cannot read owner A plan');
select is((select count(*)::integer from public.meal_plan_revisions), 0, 'owner B cannot read owner A revision');
select is(
  public.get_plan_replacement_input('83000000-0000-0000-0000-000000000001'),
  null,
  'cross-user replacement loader reveals no plan'
);

select * from finish();
rollback;
