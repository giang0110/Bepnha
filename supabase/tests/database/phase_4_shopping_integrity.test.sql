begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(private.is_canonical_decimal_text('1', false), 'positive integer text is canonical');
select ok(private.is_canonical_decimal_text('0.5', false), 'positive fractional text is canonical');
select ok(private.is_canonical_decimal_text('0', true), 'zero is canonical only when allowed');
select is(private.is_canonical_decimal_text('0', false), false, 'zero is rejected for positive quantities');
select is(private.is_canonical_decimal_text('01', true), false, 'leading zero is rejected');
select is(private.is_canonical_decimal_text('1.0', true), false, 'trailing fractional zero is rejected');
select is(private.is_canonical_decimal_text('1.', true), false, 'dangling decimal point is rejected');
select is(private.is_canonical_decimal_text('1e3', true), false, 'exponent notation is rejected');
select is(private.is_canonical_decimal_text('-1', true), false, 'negative quantities are rejected');

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.shopping_lists'::regclass
      and not tgisinternal
  ),
  'shopping list history has a protection trigger'
);
select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.shopping_list_items'::regclass
      and not tgisinternal
  ),
  'shopping item history has protection/integrity triggers'
);
select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.shopping_list_item_sources'::regclass
      and not tgisinternal
  ),
  'shopping source history has protection/integrity triggers'
);

select ok(
  (
    select prosecdef and array_to_string(proconfig, ',') like '%search_path=%'
    from pg_proc
    where oid = 'private.assert_shopping_source_row()'::regprocedure
  ),
  'source integrity helper is security definer with fixed search path'
);
select ok(
  (
    select prosecdef and array_to_string(proconfig, ',') like '%search_path=%'
    from pg_proc
    where oid = 'private.assert_revision_shopping_row(uuid)'::regprocedure
  ),
  'revision shopping assertion is security definer with fixed search path'
);

select * from finish();
rollback;
