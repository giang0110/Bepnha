begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, raw_app_meta_data)
values
  ('61000000-0000-0000-0000-000000000001', 'reader-a@example.test', '{}'::jsonb),
  ('61000000-0000-0000-0000-000000000002', 'reader-b@example.test', '{}'::jsonb),
  ('61000000-0000-0000-0000-000000000003', 'admin-token@example.test', '{"role":"admin"}'::jsonb);

-- Reuse the integrity path through a compact complete aggregate.
insert into public.foods (id, code, name_vi, base_dimension, base_unit_id)
select '62000000-0000-0000-0000-000000000001', 'bun_test', 'Bún test', 'mass', id
from public.units where code = 'g';
insert into public.food_fact_versions (
  id, food_id, version_number, category_id, edible_fraction, provenance, created_by
)
select
  '63000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001', 1, id, 1, 'RLS fact',
  '61000000-0000-0000-0000-000000000003'
from public.food_categories where code = 'staple';
insert into public.food_fact_unit_conversions
  (food_fact_version_id, unit_id, base_quantity_per_unit, gross_grams_per_unit, display_step, provenance)
select '63000000-0000-0000-0000-000000000001', id, 1, 1, 5, 'RLS conversion'
from public.units where code = 'g';
insert into public.food_fact_allergen_assessments
  (food_fact_version_id, allergen_id, assessment, provenance)
select '63000000-0000-0000-0000-000000000001', id, 'absent', 'RLS assessment'
from public.allergens;
insert into public.food_fact_nutrients
  (food_fact_version_id, nutrient_id, amount_per_100g, provenance)
select '63000000-0000-0000-0000-000000000001', id, 0, 'RLS nutrient'
from public.nutrients;
select public.publish_food_fact_version(
  '63000000-0000-0000-0000-000000000001', repeat('d', 64),
  '61000000-0000-0000-0000-000000000003', 1
);

insert into public.recipes (id, code, name_vi)
values
  ('64000000-0000-0000-0000-000000000001', 'bun_rls_published', 'Bún published'),
  ('64000000-0000-0000-0000-000000000002', 'bun_rls_draft', 'Bún draft');
insert into public.recipe_versions
  (id, recipe_id, version_number, yield_adult_equivalent, active_minutes, elapsed_minutes, created_by)
values
  ('65000000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000001', 1, 4, 10, 20, '61000000-0000-0000-0000-000000000003'),
  ('65000000-0000-0000-0000-000000000002', '64000000-0000-0000-0000-000000000002', 1, 4, 10, 20, '61000000-0000-0000-0000-000000000003');
insert into public.recipe_ingredients
  (id, recipe_version_id, food_id, food_fact_version_id, quantity, unit_id, sort_order)
select
  '66000000-0000-0000-0000-000000000001',
  '65000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  '63000000-0000-0000-0000-000000000001', 500, id, 1
from public.units where code = 'g';
insert into public.recipe_steps
  (recipe_version_id, sort_order, instruction_vi)
values ('65000000-0000-0000-0000-000000000001', 1, 'Nấu bún chín rồi dọn.');
select public.publish_recipe_version(
  '65000000-0000-0000-0000-000000000001', repeat('e', 64),
  '61000000-0000-0000-0000-000000000003', 1
);

insert into public.price_books (id, region_id, version_number, effective_from, created_by)
select '68000000-0000-0000-0000-000000000001', id, 1, date '2026-08-01',
  '61000000-0000-0000-0000-000000000003'
from public.price_regions where code = 'vn_baseline';
insert into public.food_prices
  (price_book_id, food_id, food_fact_version_id, package_quantity, package_unit_id,
   package_base_quantity, base_unit_id, package_price_vnd, purchase_increment, observed_at, source_reference)
select
  '68000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  '63000000-0000-0000-0000-000000000001',
  1000, id, 1000, id, 30000, 1, date '2026-08-01', 'RLS price'
from public.units where code = 'g';
select public.publish_price_book(
  '68000000-0000-0000-0000-000000000001', repeat('f', 64),
  '61000000-0000-0000-0000-000000000003', 1
);

set local role anon;
select throws_ok($$ select * from public.foods $$, null, null, 'anon has no catalog table grant');
select throws_ok(
  $$ select public.get_published_recipe_calculation_input('65000000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-000000000001') $$,
  null,
  null,
  'anon cannot call exact calculation read RPC'
);

reset role;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::integer from public.recipes), 1, 'reader A sees published recipe identity only');
select is((select count(*)::integer from public.recipe_versions), 1, 'reader A sees published recipe version only');
select throws_ok(
  $$ select * from public.admin_audit_log $$,
  null,
  null,
  'reader A cannot read audit rows'
);
select ok(
  public.get_published_recipe_calculation_input(
    '65000000-0000-0000-0000-000000000001',
    '68000000-0000-0000-0000-000000000001'
  ) is not null,
  'reader A can load exact published recipe and book'
);
select throws_ok(
  $$ insert into public.recipes (code, name_vi) values ('blocked', 'Blocked') $$,
  null,
  null,
  'ordinary authenticated reader cannot write catalog'
);
select throws_ok(
  $$ select public.publish_recipe_version('65000000-0000-0000-0000-000000000001', repeat('0', 64), '61000000-0000-0000-0000-000000000001', 1) $$,
  null,
  null,
  'ordinary reader cannot execute publication RPC'
);

reset role;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"role":"admin"}}', true);
set local role authenticated;
select throws_ok(
  $$ insert into public.recipes (code, name_vi) values ('admin_blocked', 'Admin blocked') $$,
  null,
  null,
  'admin app metadata does not grant Data API catalog writes'
);

reset role;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.recipes), 1, 'reader B receives the same published catalog');
select ok(
  public.get_current_price_book((select id from public.price_regions where code = 'vn_baseline')) ->> 'priceBookId'
    = '68000000-0000-0000-0000-000000000001',
  'discovery returns the current published non-retired book'
);

reset role;
select lives_ok(
  $$
    select public.retire_catalog_identity(
      'price_book', '68000000-0000-0000-0000-000000000001',
      '61000000-0000-0000-0000-000000000003', 2
    )
  $$,
  'trusted retirement changes discovery state only'
);

select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(
  public.get_current_price_book((select id from public.price_regions where code = 'vn_baseline')),
  null,
  'retired current book disappears from default discovery'
);
select ok(
  public.get_published_recipe_calculation_input(
    '65000000-0000-0000-0000-000000000001',
    '68000000-0000-0000-0000-000000000001'
  ) is not null,
  'retired published book remains readable and replayable by exact ID'
);
select is((select count(*)::integer from public.food_prices), 1, 'historical published price row remains readable');

select * from finish();
rollback;
