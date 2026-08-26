begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, raw_app_meta_data)
values (
  '51000000-0000-0000-0000-000000000001',
  'catalog-admin@example.test',
  '{"role":"admin"}'::jsonb
);

insert into public.foods (id, code, name_vi, base_dimension, base_unit_id)
select
  '52000000-0000-0000-0000-000000000001',
  'gao_trang',
  'Gạo trắng',
  'mass',
  id
from public.units where code = 'g';

insert into public.food_fact_versions (
  id, food_id, version_number, category_id, edible_fraction, provenance, created_by
)
select
  '53000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000001',
  1,
  id,
  1,
  'Test fact',
  '51000000-0000-0000-0000-000000000001'
from public.food_categories where code = 'staple';

select throws_ok(
  $$
    select public.publish_food_fact_version(
      '53000000-0000-0000-0000-000000000001',
      repeat('a', 64),
      '51000000-0000-0000-0000-000000000001',
      1
    )
  $$,
  null,
  null,
  'incomplete food fact publication is rejected atomically'
);
select is(
  (select publication_status from public.food_fact_versions where id = '53000000-0000-0000-0000-000000000001'),
  'draft',
  'failed publication leaves fact draft'
);
select is(
  (select current_fact_version_id is null from public.foods where id = '52000000-0000-0000-0000-000000000001'),
  true,
  'failed publication leaves current pointer unchanged'
);

insert into public.food_fact_unit_conversions (
  food_fact_version_id, unit_id, base_quantity_per_unit, gross_grams_per_unit,
  display_step, provenance
)
select
  '53000000-0000-0000-0000-000000000001',
  id,
  case code when 'kg' then 1000 else 1 end,
  case code when 'kg' then 1000 else 1 end,
  case code when 'kg' then 0.1 else 5 end,
  'Test conversion'
from public.units where code in ('g', 'kg');

insert into public.food_fact_allergen_assessments (
  food_fact_version_id, allergen_id, assessment, provenance
)
select
  '53000000-0000-0000-0000-000000000001', id, 'absent', 'Test assessment'
from public.allergens;

insert into public.food_fact_nutrients (
  food_fact_version_id, nutrient_id, amount_per_100g, provenance
)
select
  '53000000-0000-0000-0000-000000000001',
  id,
  case code when 'energy_kcal' then 350 else 0 end,
  'Test nutrient'
from public.nutrients;

insert into public.food_fact_dietary_tags (food_fact_version_id, dietary_tag_id)
select '53000000-0000-0000-0000-000000000001', id
from public.dietary_tags where code = 'vegetarian';

select lives_ok(
  $$
    select public.publish_food_fact_version(
      '53000000-0000-0000-0000-000000000001',
      repeat('a', 64),
      '51000000-0000-0000-0000-000000000001',
      1
    )
  $$,
  'complete pinned food fact publishes'
);

select throws_ok(
  $$ update public.food_fact_versions set edible_fraction = 0.9 where id = '53000000-0000-0000-0000-000000000001' $$,
  null,
  null,
  'published food facts are immutable even to trusted SQL'
);
select throws_ok(
  $$ delete from public.food_fact_nutrients where food_fact_version_id = '53000000-0000-0000-0000-000000000001' $$,
  null,
  null,
  'published fact children are immutable'
);

insert into public.recipes (id, code, name_vi)
values ('54000000-0000-0000-0000-000000000001', 'com_trang', 'Cơm trắng');
insert into public.recipe_versions (
  id, recipe_id, version_number, yield_adult_equivalent, active_minutes,
  elapsed_minutes, created_by
)
values (
  '55000000-0000-0000-0000-000000000001',
  '54000000-0000-0000-0000-000000000001',
  1, 4, 10, 20,
  '51000000-0000-0000-0000-000000000001'
);

insert into public.recipe_steps (
  id, recipe_version_id, sort_order, instruction_vi, timer_minutes
)
values (
  '57000000-0000-0000-0000-000000000001',
  '55000000-0000-0000-0000-000000000001',
  1,
  'Vo gạo rồi nấu đến khi chín.',
  20
);

select throws_ok(
  $$
    select public.publish_recipe_version(
      '55000000-0000-0000-0000-000000000001',
      repeat('b', 64),
      '51000000-0000-0000-0000-000000000001',
      1
    )
  $$,
  null,
  null,
  'instruction text cannot substitute for missing structured edible ingredients'
);

select throws_ok(
  $$
    insert into public.recipe_ingredients (
      recipe_version_id, food_id, food_fact_version_id, quantity, unit_id, sort_order
    )
    select
      '55000000-0000-0000-0000-000000000001',
      '52000000-0000-0000-0000-000000000001',
      gen_random_uuid(), 500, id, 1
    from public.units where code = 'g'
  $$,
  null,
  null,
  'composite food and fact pinning rejects mismatches'
);

insert into public.recipe_ingredients (
  id, recipe_version_id, food_id, food_fact_version_id, quantity, unit_id, sort_order
)
select
  '56000000-0000-0000-0000-000000000001',
  '55000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000001',
  '53000000-0000-0000-0000-000000000001',
  500, id, 1
from public.units where code = 'g';

select lives_ok(
  $$
    select public.publish_recipe_version(
      '55000000-0000-0000-0000-000000000001',
      repeat('b', 64),
      '51000000-0000-0000-0000-000000000001',
      1
    )
  $$,
  'normal ordered Vietnamese instruction publishes without an action DSL'
);
select throws_ok(
  $$ update public.recipe_steps set instruction_vi = 'Changed' where id = '57000000-0000-0000-0000-000000000001' $$,
  null,
  null,
  'published recipe instructions are immutable historical display content'
);
select throws_ok(
  $$ delete from public.recipe_ingredients where id = '56000000-0000-0000-0000-000000000001' $$,
  null,
  null,
  'published structured ingredients cannot be removed'
);

insert into public.recipe_versions (
  id, recipe_id, version_number, yield_adult_equivalent, active_minutes,
  elapsed_minutes, created_by
)
values (
  '55000000-0000-0000-0000-000000000002',
  '54000000-0000-0000-0000-000000000001',
  2, 4, 10, 20,
  '51000000-0000-0000-0000-000000000001'
);
insert into public.recipe_steps (
  id, recipe_version_id, sort_order, instruction_vi
)
values (
  '57000000-0000-0000-0000-000000000002',
  '55000000-0000-0000-0000-000000000002',
  1,
  'Kiểm tra phiên bản mới.'
);
select throws_ok(
  $$
    insert into public.recipe_step_ingredients (
      recipe_version_id, recipe_step_id, recipe_ingredient_id, reference_order
    ) values (
      '55000000-0000-0000-0000-000000000002',
      '57000000-0000-0000-0000-000000000002',
      '56000000-0000-0000-0000-000000000001',
      1
    )
  $$,
  null,
  null,
  'optional step traceability cannot reference a cross-version ingredient'
);

insert into public.price_books (
  id, region_id, version_number, effective_from, created_by
)
select
  '58000000-0000-0000-0000-000000000001', id, 1, date '2026-08-01',
  '51000000-0000-0000-0000-000000000001'
from public.price_regions where code = 'vn_baseline';

select throws_ok(
  $$
    insert into public.food_prices (
      price_book_id, food_id, food_fact_version_id, package_quantity, package_unit_id,
      package_base_quantity, base_unit_id, package_price_vnd, purchase_increment,
      observed_at, source_reference
    )
    select
      '58000000-0000-0000-0000-000000000001',
      '52000000-0000-0000-0000-000000000001',
      '53000000-0000-0000-0000-000000000001',
      1000, id, 1000, id, 30000, 1, current_date + 1, 'Future price'
    from public.units where code = 'g'
  $$,
  null,
  null,
  'future observed prices are rejected'
);

select throws_ok(
  $$
    insert into public.food_prices (
      price_book_id, food_id, food_fact_version_id, package_quantity, package_unit_id,
      package_base_quantity, base_unit_id, package_price_vnd, purchase_increment,
      observed_at, source_reference
    )
    select
      '58000000-0000-0000-0000-000000000001',
      '52000000-0000-0000-0000-000000000001',
      '53000000-0000-0000-0000-000000000001',
      1, id, 999, id, 30000, 1, date '2026-08-01', 'Bad normalization'
    from public.units where code = 'kg'
  $$,
  null,
  null,
  'price normalization cannot disagree with its pinned fact conversion'
);

insert into public.food_prices (
  price_book_id, food_id, food_fact_version_id, package_quantity, package_unit_id,
  package_base_quantity, base_unit_id, package_price_vnd, purchase_increment,
  observed_at, source_reference
)
select
  '58000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000001',
  '53000000-0000-0000-0000-000000000001',
  1, id, 1000,
  (select id from public.units where code = 'g'),
  30000, 1, date '2026-08-01', 'Test price'
from public.units where code = 'kg';

select lives_ok(
  $$
    select public.publish_price_book(
      '58000000-0000-0000-0000-000000000001',
      repeat('c', 64),
      '51000000-0000-0000-0000-000000000001',
      1
    )
  $$,
  'normalized price book publishes atomically'
);
select throws_ok(
  $$ update public.food_prices set package_price_vnd = 1 where price_book_id = '58000000-0000-0000-0000-000000000001' $$,
  null,
  null,
  'published prices remain immutable'
);

select throws_ok(
  $$ update public.food_categories set parent_id = id where code = 'seafood' $$,
  null,
  null,
  'category self-cycles are rejected'
);

select is((select count(*)::integer from public.admin_audit_log), 3, 'each successful publication appends one audit row');

select * from finish();
rollback;
