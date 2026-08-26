begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email)
values ('91000000-0000-0000-0000-000000000001', 'planner-owner@example.test');
insert into public.households (
  id, owner_user_id, weekly_plan_budget_vnd, max_elapsed_minutes, onboarding_completed_at
)
values (
  '92000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001', 700000, 30, now()
);
insert into public.household_member_groups (household_id, member_kind, age_band, member_count)
values ('92000000-0000-0000-0000-000000000001', 'adult', 'adult', 2);

insert into public.meal_options (id, code, name_vi)
select
  ('93000000-0000-0000-0000-' || lpad(day_number::text, 12, '0'))::uuid,
  'planner_option_' || day_number,
  'Bữa ' || day_number
from generate_series(1, 8) as day_number;
insert into public.meal_option_versions (
  id, meal_option_id, version_number, yield_adult_equivalent,
  active_minutes, elapsed_minutes, created_by
)
select
  ('94000000-0000-0000-0000-' || lpad(day_number::text, 12, '0'))::uuid,
  ('93000000-0000-0000-0000-' || lpad(day_number::text, 12, '0'))::uuid,
  1, 2, 20, 30, '91000000-0000-0000-0000-000000000001'
from generate_series(1, 8) as day_number;
select private.begin_catalog_transition();
update public.meal_option_versions
set publication_status = 'published', content_hash = repeat('d', 64), published_at = now();
update public.meal_options as meal_option
set status = 'published', current_version_id = version.id
from public.meal_option_versions as version
where version.meal_option_id = meal_option.id;
select private.end_catalog_transition();

select throws_ok(
  $$
    select public.persist_meal_plan_revision(
      '91000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001', date '2026-08-31', 0, null,
      '95000000-0000-0000-0000-000000000001',
      jsonb_build_object(
        'revisionKind', 'generation', 'householdSetupVersion', 1,
        'engineVersion', 'planner-engine-v1', 'portionConfigVersion', 'portion-v1',
        'priceFreshnessConfigVersion', 'price-freshness-v1',
        'plannerConfigVersion', 'planner-v1', 'calculationDate', '2026-08-26',
        'catalogFingerprint', repeat('a', 64), 'inputFingerprint', repeat('b', 64),
        'calculationFingerprint', repeat('c', 64), 'budgetVnd', 700000,
        'totalEstimatedCostVnd', 700000, 'budgetStatus', 'within', 'overageVnd', 0,
        'warnings', '[]'::jsonb, 'inputSnapshot', '{}'::jsonb,
        'calculationSnapshot', jsonb_build_object(
          'purchaseBasket', jsonb_build_object(
            'lines', jsonb_build_array(jsonb_build_object('lineCostVnd', 700000)),
            'totalEstimatedCostVnd', 700000
          )
        )
      ),
      (select jsonb_agg(jsonb_build_object(
        'dayIndex', day_number - 1, 'mealSlot', 'primary',
        'mealOptionId', ('93000000-0000-0000-0000-' || lpad(day_number::text, 12, '0'))::uuid,
        'mealOptionVersionId', ('94000000-0000-0000-0000-' || lpad(day_number::text, 12, '0'))::uuid,
        'adultEquivalent', '2', 'scaleFactor', '1',
        'snapshot', jsonb_build_object('label', 'day-' || day_number)
      ) order by day_number) from generate_series(1, 6) as day_number)
    )
  $$,
  null,
  null,
  'six items cannot create a ready weekly revision'
);
select is((select count(*)::integer from public.meal_plans), 0, 'failed persistence rolls back atomically');

select lives_ok(
  $$
    select public.persist_meal_plan_revision(
      '91000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001', date '2026-08-31', 0, null,
      '95000000-0000-0000-0000-000000000001',
      jsonb_build_object(
        'revisionKind', 'generation', 'householdSetupVersion', 1,
        'engineVersion', 'planner-engine-v1', 'portionConfigVersion', 'portion-v1',
        'priceFreshnessConfigVersion', 'price-freshness-v1',
        'plannerConfigVersion', 'planner-v1', 'calculationDate', '2026-08-26',
        'catalogFingerprint', repeat('a', 64), 'inputFingerprint', repeat('b', 64),
        'calculationFingerprint', repeat('c', 64), 'budgetVnd', 700000,
        'totalEstimatedCostVnd', 700000, 'budgetStatus', 'within', 'overageVnd', 0,
        'warnings', '[]'::jsonb, 'inputSnapshot', '{}'::jsonb,
        'calculationSnapshot', jsonb_build_object(
          'purchaseBasket', jsonb_build_object(
            'lines', jsonb_build_array(jsonb_build_object('lineCostVnd', 700000)),
            'totalEstimatedCostVnd', 700000
          )
        )
      ),
      (select jsonb_agg(jsonb_build_object(
        'dayIndex', day_number - 1, 'mealSlot', 'primary',
        'mealOptionId', ('93000000-0000-0000-0000-' || lpad(day_number::text, 12, '0'))::uuid,
        'mealOptionVersionId', ('94000000-0000-0000-0000-' || lpad(day_number::text, 12, '0'))::uuid,
        'adultEquivalent', '2', 'scaleFactor', '1',
        'snapshot', jsonb_build_object('label', 'day-' || day_number)
      ) order by day_number) from generate_series(1, 7) as day_number)
    )
  $$,
  'seven distinct primary slots persist atomically'
);
select is((select count(*)::integer from public.meal_plan_items), 7, 'ready revision has exactly seven items');
select is(
  (select total_estimated_cost_vnd from public.meal_plans),
  (select total_estimated_cost_vnd from public.meal_plan_revisions),
  'stable plan and current revision totals match'
);
select is(
  (select total_estimated_cost_vnd from public.meal_plans),
  700000::bigint,
  'persisted total equals basket line sum and snapshot total'
);

select lives_ok(
  $$
    select public.persist_meal_plan_revision(
      '91000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001', date '2026-08-31', 1,
      (select current_revision_id from public.meal_plans),
      '95000000-0000-0000-0000-000000000002',
      jsonb_build_object(
        'revisionKind', 'replacement', 'replacedDayIndex', 3, 'householdSetupVersion', 1,
        'engineVersion', 'planner-engine-v1', 'portionConfigVersion', 'portion-v1',
        'priceFreshnessConfigVersion', 'price-freshness-v1',
        'plannerConfigVersion', 'planner-v1', 'calculationDate', '2026-08-26',
        'catalogFingerprint', repeat('a', 64), 'inputFingerprint', repeat('b', 64),
        'calculationFingerprint', repeat('e', 64), 'budgetVnd', 700000,
        'totalEstimatedCostVnd', 710000, 'budgetStatus', 'over', 'overageVnd', 10000,
        'warnings', jsonb_build_array(jsonb_build_object('code', 'PLAN_OVER_BUDGET')),
        'inputSnapshot', '{}'::jsonb,
        'calculationSnapshot', jsonb_build_object(
          'purchaseBasket', jsonb_build_object(
            'lines', jsonb_build_array(jsonb_build_object('lineCostVnd', 710000)),
            'totalEstimatedCostVnd', 710000
          )
        )
      ),
      (select jsonb_agg(jsonb_build_object(
        'dayIndex', day_number - 1, 'mealSlot', 'primary',
        'mealOptionId', ('93000000-0000-0000-0000-' || lpad((case when day_number = 4 then 8 else day_number end)::text, 12, '0'))::uuid,
        'mealOptionVersionId', ('94000000-0000-0000-0000-' || lpad((case when day_number = 4 then 8 else day_number end)::text, 12, '0'))::uuid,
        'adultEquivalent', '2', 'scaleFactor', '1',
        'snapshot', jsonb_build_object('label', 'day-' || day_number)
      ) order by day_number) from generate_series(1, 7) as day_number)
    )
  $$,
  'replacement persists one new immutable full revision'
);
select is((select count(*)::integer from public.meal_plan_revisions), 2, 'replacement appends one revision');
select is(
  (
    select count(*)::integer
    from public.meal_plan_items as old_item
    join public.meal_plan_revisions as old_revision on old_revision.id = old_item.meal_plan_revision_id
    join public.meal_plan_items as new_item on new_item.day_index = old_item.day_index
    join public.meal_plan_revisions as new_revision on new_revision.id = new_item.meal_plan_revision_id
    where old_revision.revision_number = 1
      and new_revision.revision_number = 2
      and old_item.day_index <> 3
      and old_item.meal_option_id = new_item.meal_option_id
      and old_item.meal_option_version_id = new_item.meal_option_version_id
  ),
  6,
  'replacement preserves the other six exact option identities and versions'
);
select throws_ok(
  $$ update public.meal_plan_revisions set total_estimated_cost_vnd = 1 where revision_number = 1 $$,
  null,
  null,
  'sealed historical revisions are immutable'
);

select * from finish();
rollback;
