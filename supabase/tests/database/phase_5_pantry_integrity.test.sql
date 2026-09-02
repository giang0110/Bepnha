begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.pantry_items')
      and contype = 'f'
      and pg_get_constraintdef(oid) like '%FOREIGN KEY (food_id, food_fact_version_id)%'
  ),
  'pantry pins exact food fact lineage'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.pantry_items')
      and contype = 'f'
      and pg_get_constraintdef(oid) like '%FOREIGN KEY (food_id, base_unit_id)%'
  ),
  'pantry pins the stable food permanent base unit'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.pantry_items')
      and contype = 'f'
      and pg_get_constraintdef(oid) like '%FOREIGN KEY (food_fact_version_id, unit_id)%'
  ),
  'pantry quantity unit must be defined by the pinned fact version'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.pantry_items')
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%quantity >=%'
  ),
  'pantry quantity cannot be negative'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.pantry_items')
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%base_quantity >=%'
  ),
  'derived pantry base quantity cannot be negative'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.pantry_items')
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%version > 0%'
  ),
  'pantry optimistic version is positive'
);
select has_trigger(
  'public',
  'pantry_items',
  'pantry_items_prepare_row',
  'pantry row trigger derives base quantity and optimistic version'
);

select * from finish();
rollback;
