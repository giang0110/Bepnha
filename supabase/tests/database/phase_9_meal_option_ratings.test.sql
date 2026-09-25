begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email)
values ('91000000-0000-0000-0000-000000000001', 'planner-owner@example.test');
insert into public.households (
  id, owner_user_id, weekly_plan_budget_vnd, max_elapsed_minutes
)
values (
  '92000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001', 700000, 30
);
insert into public.household_member_groups (household_id, member_kind, age_band, member_count)
values ('92000000-0000-0000-0000-000000000001', 'adult', 'adult', 2);
update public.households
set onboarding_completed_at = now()
where id = '92000000-0000-0000-0000-000000000001';

-- Minimal immutable catalog lineage used by the engine-v2 shopping projection.
insert into public.foods (id, code, name_vi, base_dimension, base_unit_id)
select
  '96000000-0000-0000-0000-000000000001',
  'planner_food',
  'Thực phẩm planner',
  'mass',
  id
from public.units where code = 'g';

insert into public.food_fact_versions (
  id, food_id, version_number, category_id, edible_fraction, provenance, created_by
)
select
  '96000000-0000-0000-0000-000000000002',
  '96000000-0000-0000-0000-000000000001',
  1,
  id,
  1,
  'Planner persistence fixture',
  '91000000-0000-0000-0000-000000000001'
from public.food_categories where code = 'staple';

insert into public.food_fact_unit_conversions (
  food_fact_version_id, unit_id, base_quantity_per_unit, gross_grams_per_unit,
  display_step, provenance
)
select
  '96000000-0000-0000-0000-000000000002', id, 1, 1, 1,
  'Planner persistence fixture'
from public.units where code = 'g';

insert into public.recipes (id, code, name_vi)
values ('96000000-0000-0000-0000-000000000003', 'planner_recipe', 'Món planner');
insert into public.recipe_versions (
  id, recipe_id, version_number, yield_adult_equivalent, active_minutes,
  elapsed_minutes, created_by
)
values (
  '96000000-0000-0000-0000-000000000004',
  '96000000-0000-0000-0000-000000000003',
  1, 2, 10, 20,
  '91000000-0000-0000-0000-000000000001'
);
insert into public.recipe_ingredients (
  id, recipe_version_id, food_id, food_fact_version_id, quantity, unit_id, sort_order
)
select
  '96000000-0000-0000-0000-000000000005',
  '96000000-0000-0000-0000-000000000004',
  '96000000-0000-0000-0000-000000000001',
  '96000000-0000-0000-0000-000000000002',
  100, id, 1
from public.units where code = 'g';

insert into public.price_books (
  id, region_id, version_number, effective_from, created_by
)
select
  '96000000-0000-0000-0000-000000000006', id, 1, date '2026-08-01',
  '91000000-0000-0000-0000-000000000001'
from public.price_regions where code = 'vn_baseline';

select private.begin_catalog_transition();
update public.food_fact_versions
set publication_status = 'published',
    content_hash = repeat('f', 64),
    assessment_completed_at = now(),
    published_at = now()
where id = '96000000-0000-0000-0000-000000000002';
update public.foods
set status = 'published', current_fact_version_id = '96000000-0000-0000-0000-000000000002'
where id = '96000000-0000-0000-0000-000000000001';
update public.recipe_versions
set publication_status = 'published', content_hash = repeat('e', 64), published_at = now()
where id = '96000000-0000-0000-0000-000000000004';
update public.recipes
set status = 'published', current_version_id = '96000000-0000-0000-0000-000000000004'
where id = '96000000-0000-0000-0000-000000000003';
select private.end_catalog_transition();

insert into public.food_prices (
  id, price_book_id, food_id, food_fact_version_id, package_quantity, package_unit_id,
  package_base_quantity, base_unit_id, package_price_vnd, purchase_increment,
  observed_at, source_reference
)
select
  '96000000-0000-0000-0000-000000000007',
  '96000000-0000-0000-0000-000000000006',
  '96000000-0000-0000-0000-000000000001',
  '96000000-0000-0000-0000-000000000002',
  1000, id, 1000, id, 700000, 1, date '2026-08-01', 'Planner generation price'
from public.units where code = 'g';

select private.begin_catalog_transition();
update public.price_books
set publication_status = 'published', content_hash = repeat('a', 64), published_at = now()
where id = '96000000-0000-0000-0000-000000000006';
select private.end_catalog_transition();

insert into public.price_books (
  id, region_id, version_number, effective_from, created_by
)
select
  '96000000-0000-0000-0000-000000000008', id, 2, date '2026-08-02',
  '91000000-0000-0000-0000-000000000001'
from public.price_regions where code = 'vn_baseline';
insert into public.food_prices (
  id, price_book_id, food_id, food_fact_version_id, package_quantity, package_unit_id,
  package_base_quantity, base_unit_id, package_price_vnd, purchase_increment,
  observed_at, source_reference
)
select
  '96000000-0000-0000-0000-000000000009',
  '96000000-0000-0000-0000-000000000008',
  '96000000-0000-0000-0000-000000000001',
  '96000000-0000-0000-0000-000000000002',
  1000, id, 1000, id, 710000, 1, date '2026-08-02', 'Planner replacement price'
from public.units where code = 'g';

select private.begin_catalog_transition();
update public.price_books
set publication_status = 'published', content_hash = repeat('b', 64), published_at = now()
where id = '96000000-0000-0000-0000-000000000008';
select private.end_catalog_transition();

insert into public.meal_options (id, code, name_vi)
select
  ('93000000-0000-0000-0000-' || lpad(day_number::text, 12, '0'))::uuid,
  'planner_option_' || day_number,
  'Bữa ' || day_number
from generate_series(1, 14) as day_number;
insert into public.meal_option_versions (
  id, meal_option_id, version_number, yield_adult_equivalent,
  active_minutes, elapsed_minutes, created_by
)
select
  ('94000000-0000-0000-0000-' || lpad(day_number::text, 12, '0'))::uuid,
  ('93000000-0000-0000-0000-' || lpad(day_number::text, 12, '0'))::uuid,
  1, 2, 20, 30, '91000000-0000-0000-0000-000000000001'
from generate_series(1, 14) as day_number;
insert into public.meal_option_recipes (
  id, meal_option_version_id, recipe_id, recipe_version_id,
  quantity_multiplier, meal_role, sort_order
)
select
  ('97000000-0000-0000-0000-' || lpad(day_number::text, 12, '0'))::uuid,
  ('94000000-0000-0000-0000-' || lpad(day_number::text, 12, '0'))::uuid,
  '96000000-0000-0000-0000-000000000003',
  '96000000-0000-0000-0000-000000000004',
  1, 'main', 1
from generate_series(1, 14) as day_number;
select private.begin_catalog_transition();
update public.meal_option_versions
set publication_status = 'published', content_hash = repeat('d', 64), published_at = now();
update public.meal_options as meal_option
set status = 'published', current_version_id = version.id
from public.meal_option_versions as version
where version.meal_option_id = meal_option.id;
select private.end_catalog_transition();

create function pg_temp.plan_items(p_replacement boolean)
returns jsonb
language sql
stable
as $$
  select jsonb_agg(
    jsonb_build_object(
      'dayIndex', day_number - 1,
      'mealSlot', 'primary',
      'mealOptionId',
        ('93000000-0000-0000-0000-' || lpad(option_number::text, 12, '0'))::uuid,
      'mealOptionVersionId',
        ('94000000-0000-0000-0000-' || lpad(option_number::text, 12, '0'))::uuid,
      'adultEquivalent', '2',
      'scaleFactor', '1',
      'snapshot', jsonb_build_object('label', 'day-' || day_number)
    ) order by day_number
  )
  from (
    select day_number,
      case when p_replacement then day_number + 7 else day_number end as option_number
    from generate_series(1, 7) as day_number
  ) as days;
$$;

create function pg_temp.shopping_line(
  p_food_price_id uuid,
  p_price_book_id uuid,
  p_package_price_vnd bigint,
  p_observed_at date,
  p_replacement boolean
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'foodId', '96000000-0000-0000-0000-000000000001',
    'baseUnitId', (select id from public.units where code = 'g'),
    'requiredBaseQuantity', '700',
    'packageBaseQuantity', '1000',
    'purchaseIncrement', '1',
    'purchasePackageCount', '1',
    'purchaseBaseQuantity', '1000',
    'leftoverBaseQuantity', '300',
    'packagePriceVnd', p_package_price_vnd,
    'lineCostVnd', p_package_price_vnd,
    'foodPriceId', p_food_price_id,
    'priceBookId', p_price_book_id,
    'priceFoodFactVersionId', '96000000-0000-0000-0000-000000000002',
    'observedAt', p_observed_at,
    'freshness', 'current',
    'groceryCategoryCode', 'staples',
    'factRefs', jsonb_build_array(jsonb_build_object(
      'foodFactVersionId', '96000000-0000-0000-0000-000000000002',
      'contentHash', repeat('f', 64)
    )),
    'sources', (
      select jsonb_agg(
        jsonb_build_object(
          'dayIndex', day_number - 1,
          'mealOptionId',
            ('93000000-0000-0000-0000-' || lpad(option_number::text, 12, '0'))::uuid,
          'mealOptionVersionId',
            ('94000000-0000-0000-0000-' || lpad(option_number::text, 12, '0'))::uuid,
          'mealOptionRecipeId',
            ('97000000-0000-0000-0000-' || lpad(option_number::text, 12, '0'))::uuid,
          'recipeVersionId', '96000000-0000-0000-0000-000000000004',
          'recipeIngredientId', '96000000-0000-0000-0000-000000000005',
          'foodId', '96000000-0000-0000-0000-000000000001',
          'foodFactVersionId', '96000000-0000-0000-0000-000000000002',
          'baseUnitId', (select id from public.units where code = 'g'),
          'requiredBaseQuantity', '100'
        ) order by day_number
      )
      from (
        select day_number,
          case when p_replacement then day_number + 7 else day_number end as option_number
        from generate_series(1, 7) as day_number
      ) as days
    )
  );
$$;

create function pg_temp.revision_payload(
  p_revision_kind text,
  p_replaced_day_index integer,
  p_fingerprint text,
  p_total bigint,
  p_price_id uuid,
  p_price_book_id uuid,
  p_observed_at date,
  p_replacement boolean,
  p_engine_version text
)
returns jsonb
language sql
stable
as $$
  with shopping as (
    select pg_temp.shopping_line(
      p_price_id, p_price_book_id, p_total, p_observed_at, p_replacement
    ) as line
  )
  select jsonb_build_object(
    'revisionKind', p_revision_kind,
    'replacedDayIndex', p_replaced_day_index,
    'householdSetupVersion',
      (select version from public.households where id = '92000000-0000-0000-0000-000000000001'),
    'engineVersion', p_engine_version,
    'portionConfigVersion', 'portion-v1',
    'priceFreshnessConfigVersion', 'price-freshness-v1',
    'plannerConfigVersion', 'planner-v1',
    'calculationDate', '2026-08-26',
    'catalogFingerprint', repeat('a', 64),
    'inputFingerprint', repeat('b', 64),
    'calculationFingerprint', p_fingerprint,
    'budgetVnd', 700000,
    'totalEstimatedCostVnd', p_total,
    'budgetStatus', case when p_total <= 700000 then 'within' else 'over' end,
    'overageVnd', greatest(p_total - 700000, 0),
    'warnings', case when p_total <= 700000 then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('code', 'PLAN_OVER_BUDGET')) end,
    'inputSnapshot', jsonb_build_object('engineVersion', p_engine_version),
    'calculationSnapshot', jsonb_build_object(
      'purchaseBasket', jsonb_build_object(
        'lines', jsonb_build_array(line - 'groceryCategoryCode' - 'factRefs' - 'sources'),
        'warnings', '[]'::jsonb,
        'totalEstimatedCostVnd', p_total
      ),
      'shoppingList', jsonb_build_object(
        'version', 'shopping-list-v1',
        'groceryCategoryConfigVersion', 'grocery-category-v1',
        'lines', jsonb_build_array(line),
        'totalEstimatedCostVnd', p_total,
        'warnings', '[]'::jsonb
      )
    )
  )
  from shopping;
$$;

-- ---------------------------------------------------------------------------
-- Đánh giá món ăn, và guard engine version v5.
-- ---------------------------------------------------------------------------

-- Đây là guard sẽ làm hỏng hẳn việc tạo kế hoạch nếu code v5 lên production trước migration này:
-- `persist_meal_plan_revision` từ chối engine version nó không biết, và từ chối ở đây không phải là
-- kế hoạch kém đi, mà là không có kế hoạch nào cả.
select lives_ok(
  $$
    select public.persist_meal_plan_revision(
      '91000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001', date '2026-08-31', 0, null,
      '95000000-0000-0000-0000-000000000001',
      pg_temp.revision_payload(
        'generation', null, repeat('c', 64), 700000,
        '96000000-0000-0000-0000-000000000007',
        '96000000-0000-0000-0000-000000000006', date '2026-08-01', false,
        'planner-engine-v5'
      ),
      pg_temp.plan_items(false)
    )
  $$,
  'a planner-engine-v5 revision persists'
);

insert into auth.users (id, email)
values ('91000000-0000-0000-0000-000000000002', 'rating-intruder@example.test');
insert into public.households (
  id, owner_user_id, weekly_plan_budget_vnd, max_elapsed_minutes
)
values (
  '92000000-0000-0000-0000-000000000002',
  '91000000-0000-0000-0000-000000000002', 700000, 30
);

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  public.get_meal_option_ratings('92000000-0000-0000-0000-000000000001'),
  '{"liked": [], "disliked": []}'::jsonb,
  'a household that has rated nothing reads as two empty lists, not as null'
);

select lives_ok(
  $$
    select public.set_meal_option_rating(
      '92000000-0000-0000-0000-000000000001',
      '93000000-0000-0000-0000-000000000001',
      'liked'
    )
  $$,
  'the household can say it liked a meal'
);
select lives_ok(
  $$
    select public.set_meal_option_rating(
      '92000000-0000-0000-0000-000000000001',
      '93000000-0000-0000-0000-000000000002',
      'disliked'
    )
  $$,
  'and that it disliked another'
);

select is(
  public.get_meal_option_ratings('92000000-0000-0000-0000-000000000001'),
  jsonb_build_object(
    'liked', jsonb_build_array('93000000-0000-0000-0000-000000000001'),
    'disliked', jsonb_build_array('93000000-0000-0000-0000-000000000002')
  ),
  'both come back grouped the way the planner asks for them'
);

-- Đổi ý: ghi đè chứ không tạo hàng thứ hai.
select lives_ok(
  $$
    select public.set_meal_option_rating(
      '92000000-0000-0000-0000-000000000001',
      '93000000-0000-0000-0000-000000000001',
      'disliked'
    )
  $$,
  'a household may change its mind about a meal'
);
select is(
  (
    select count(*)::integer
    from public.meal_option_ratings
    where household_id = '92000000-0000-0000-0000-000000000001'
      and meal_option_id = '93000000-0000-0000-0000-000000000001'
  ),
  1,
  'and that leaves one opinion, not two'
);

-- Quay lại "bình thường" là xoá hàng, không phải lưu một sự im lặng.
select lives_ok(
  $$
    select public.set_meal_option_rating(
      '92000000-0000-0000-0000-000000000001',
      '93000000-0000-0000-0000-000000000001',
      null
    )
  $$,
  'clearing a rating is allowed'
);
select is(
  (
    select count(*)::integer
    from public.meal_option_ratings
    where household_id = '92000000-0000-0000-0000-000000000001'
      and meal_option_id = '93000000-0000-0000-0000-000000000001'
  ),
  0,
  'and removes the row rather than recording an opinion of no opinion'
);

select throws_ok(
  $$
    select public.set_meal_option_rating(
      '92000000-0000-0000-0000-000000000001',
      '93000000-0000-0000-0000-000000000003',
      'delicious'
    )
  $$,
  '22023',
  'MEAL_RATING_INVALID',
  'a rating outside the two the engine understands is refused, not coerced'
);

select throws_ok(
  $$
    select public.set_meal_option_rating(
      '92000000-0000-0000-0000-000000000002',
      '93000000-0000-0000-0000-000000000003',
      'liked'
    )
  $$,
  '42501',
  'MEAL_RATING_HOUSEHOLD_FORBIDDEN',
  'and one household cannot rate on behalf of another'
);

reset role;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  public.get_meal_option_ratings('92000000-0000-0000-0000-000000000001'),
  '{"liked": [], "disliked": []}'::jsonb,
  'another household reads the first household taste as empty, not as an error'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.set_meal_option_rating(uuid,uuid,text)', 'execute'),
  'anonymous callers cannot rate anything'
);
select ok(
  not has_function_privilege('anon', 'public.get_meal_option_ratings(uuid)', 'execute'),
  'nor read anyone taste'
);

select * from finish();
rollback;
