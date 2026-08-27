begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, raw_app_meta_data)
values ('71000000-0000-0000-0000-000000000001', 'phase3-admin@example.test', '{"role":"admin"}');

insert into public.recipes (id, code, name_vi)
values ('72000000-0000-0000-0000-000000000001', 'phase3_recipe', 'Món Phase 3');
insert into public.recipe_versions (
  id, recipe_id, version_number, yield_adult_equivalent, active_minutes, elapsed_minutes, created_by
)
values (
  '73000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  1, 4, 20, 90, '71000000-0000-0000-0000-000000000001'
);
select private.begin_catalog_transition();
update public.recipe_versions
set publication_status = 'published', content_hash = repeat('a', 64), published_at = now()
where id = '73000000-0000-0000-0000-000000000001';
update public.recipes
set status = 'published', current_version_id = '73000000-0000-0000-0000-000000000001'
where id = '72000000-0000-0000-0000-000000000001';
select private.end_catalog_transition();

insert into public.meal_options (id, code, name_vi)
values ('74000000-0000-0000-0000-000000000001', 'phase3_meal', 'Bữa Phase 3');
insert into public.meal_option_versions (
  id, meal_option_id, version_number, yield_adult_equivalent, active_minutes,
  elapsed_minutes, created_by
)
values (
  '75000000-0000-0000-0000-000000000001',
  '74000000-0000-0000-0000-000000000001',
  1, 4, 25, 30, '71000000-0000-0000-0000-000000000001'
);
insert into public.meal_option_recipes (
  meal_option_version_id, recipe_id, recipe_version_id, quantity_multiplier, meal_role, sort_order
)
values (
  '75000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  1, 'main', 1
);
insert into public.meal_option_version_tags (meal_option_version_id, recipe_tag_id)
select '75000000-0000-0000-0000-000000000001', id
from public.recipe_tags where code = 'protein_poultry';

select throws_ok(
  $$
    select public.publish_meal_option_version(
      '75000000-0000-0000-0000-000000000001', repeat('b', 64),
      '71000000-0000-0000-0000-000000000001', 1
    )
  $$,
  null,
  null,
  'publication rejects missing cooking-style metadata atomically'
);
select is(
  (select publication_status from public.meal_option_versions where id = '75000000-0000-0000-0000-000000000001'),
  'draft',
  'failed publication leaves the version draft'
);

insert into public.meal_option_version_tags (meal_option_version_id, recipe_tag_id)
select '75000000-0000-0000-0000-000000000001', id
from public.recipe_tags where code = 'style_braise';

select lives_ok(
  $$
    select public.publish_meal_option_version(
      '75000000-0000-0000-0000-000000000001', repeat('b', 64),
      '71000000-0000-0000-0000-000000000001', 1
    )
  $$,
  'a complete curated option publishes with editorial elapsed time independent of recipe time'
);
select is(
  (select elapsed_minutes::integer from public.meal_option_versions where id = '75000000-0000-0000-0000-000000000001'),
  30,
  'meal-option elapsed time is not replaced by the 90-minute recipe time'
);
select throws_ok(
  $$ update public.meal_option_versions set elapsed_minutes = 90 where id = '75000000-0000-0000-0000-000000000001' $$,
  null,
  null,
  'published meal-option payload is immutable'
);
select throws_ok(
  $$ delete from public.meal_option_recipes where meal_option_version_id = '75000000-0000-0000-0000-000000000001' $$,
  null,
  null,
  'published curated composition is immutable'
);

insert into public.meal_option_versions (
  id, meal_option_id, version_number, yield_adult_equivalent, active_minutes,
  elapsed_minutes, created_by
)
values (
  '75000000-0000-0000-0000-000000000002',
  '74000000-0000-0000-0000-000000000001',
  2, 4, 25, 35, '71000000-0000-0000-0000-000000000001'
);
select ok(
  exists(select 1 from public.meal_option_versions where id = '75000000-0000-0000-0000-000000000002'),
  'correction creates a new draft version rather than mutating history'
);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select ok(
  public.get_published_meal_option_calculation_input(
    '75000000-0000-0000-0000-000000000001'
  ) is not null,
  'authenticated planner can load a published meal option by exact version ID'
);
select is(
  public.get_published_meal_option_calculation_input(
    '75000000-0000-0000-0000-000000000002'
  ),
  null,
  'published calculation RPC does not expose draft meal-option versions'
);
select throws_ok(
  $$ select public.get_meal_option_aggregate_for_publication(
    '75000000-0000-0000-0000-000000000002'
  ) $$,
  null,
  null,
  'authenticated planner cannot call the draft publication helper'
);
reset role;

select lives_ok(
  $$ select public.retire_meal_option(
    '74000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001', 2
  ) $$,
  'retirement removes discovery only'
);
select ok(
  public.get_published_meal_option_calculation_input(
    '75000000-0000-0000-0000-000000000001'
  ) is not null,
  'retired published option remains readable by exact version ID'
);

select * from finish();
rollback;
