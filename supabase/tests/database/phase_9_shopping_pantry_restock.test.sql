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
-- Phần dư sau khi đi chợ đi vào tủ bếp.
--
-- Dòng đi chợ của fixture cần 700g, mua một gói 1000g, nên dư đúng 300g. Con số đó là điều đang
-- được kiểm: vào tủ bếp phải là 300, không phải 1000.
-- ---------------------------------------------------------------------------

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
        'planner-engine-v4'
      ),
      pg_temp.plan_items(false)
    )
  $$,
  'a revision with a shopping list persists'
);

insert into auth.users (id, email)
values ('91000000-0000-0000-0000-000000000002', 'restock-intruder@example.test');

-- `persist_meal_plan_revision` sinh revision id của riêng nó; tham số thứ sáu chỉ là idempotency
-- key. Đọc id thật ra thay vì đoán, nếu không cả bài test chỉ chứng minh được là hàm biết từ chối
-- một revision không tồn tại.
create view pg_temp.ctx as
select
  list.meal_plan_revision_id as revision_id,
  item.id as item_id
from public.shopping_lists as list
join public.shopping_list_items as item on item.shopping_list_id = list.id;

create view pg_temp.restock_pantry as
select pantry.quantity, pantry.base_quantity
from public.pantry_items as pantry
where pantry.household_id = '92000000-0000-0000-0000-000000000001'
  and pantry.food_id = '96000000-0000-0000-0000-000000000001';

-- Hai view này chỉ là tiện ích của bài test và thuộc sở hữu của superuser; phần kiểm tra chạy dưới
-- role `authenticated` nên phải cấp quyền đọc, nếu không cái hỏng là bài test chứ không phải schema.
grant select on pg_temp.ctx to authenticated;
grant select on pg_temp.restock_pantry to authenticated;

select is(
  (select count(*)::integer from pg_temp.ctx),
  1,
  'the fixture produced exactly one shopping line to reason about'
);

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

-- Chưa tick gì: không món nào được mua, nên tủ bếp không được đổi.
select is(
  (
    select public.apply_shopping_to_pantry(revision_id) ->> 'transferredLineCount'
    from pg_temp.ctx
  ),
  '0',
  'nothing ticked transfers nothing'
);
select is(
  (select count(*)::integer from pg_temp.restock_pantry),
  0,
  'and leaves the pantry untouched'
);

reset role;
insert into public.shopping_item_check_states (shopping_list_item_id, checked_at)
select item_id, now() from pg_temp.ctx;
set local role authenticated;

-- Tick sau khi đã bấm xong một lần: chốt theo từng món phải cho món này đi tiếp.
select is(
  (
    select public.apply_shopping_to_pantry(revision_id) ->> 'transferredLineCount'
    from pg_temp.ctx
  ),
  '1',
  'a line ticked after an earlier finish still reaches the pantry'
);

-- Điều quan trọng nhất của cả tính năng: phần DƯ vào tủ bếp, không phải cả gói vừa mua.
select is(
  (select base_quantity from pg_temp.restock_pantry),
  300::numeric(30, 12),
  'the pantry gains the 300g left over, not the 1000g bought'
);

select is(
  (select transferred_base_quantity from public.shopping_pantry_transfer_lines),
  '300',
  'and the evidence line records the exact base quantity moved'
);

-- Bấm lần nữa: đây là trường hợp hỏng tồn kho nếu chốt chống trùng sai.
select is(
  (
    select public.apply_shopping_to_pantry(revision_id) ->> 'transferredLineCount'
    from pg_temp.ctx
  ),
  '0',
  'pressing finish again transfers nothing further'
);
select is(
  (select base_quantity from pg_temp.restock_pantry),
  300::numeric(30, 12),
  'so the pantry is not doubled'
);
select is(
  (
    select public.apply_shopping_to_pantry(revision_id) ->> 'totalTransferredLineCount'
    from pg_temp.ctx
  ),
  '1',
  'and the running total still names the one line that moved'
);

reset role;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$select public.apply_shopping_to_pantry((select revision_id from pg_temp.ctx))$$,
  '42501',
  'SHOPPING_LIST_OWNERSHIP_REQUIRED',
  'another household cannot stock its pantry from this trip'
);
select is(
  (select count(*)::integer from public.shopping_pantry_transfers),
  0,
  'and cannot even read that the trip happened'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.apply_shopping_to_pantry(uuid)', 'execute'),
  'anonymous callers cannot reach the transfer at all'
);
select ok(
  has_function_privilege('authenticated', 'public.apply_shopping_to_pantry(uuid)', 'execute'),
  'signed-in callers can, subject to the ownership check above'
);

select * from finish();
rollback;
