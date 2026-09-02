begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_column(
  'public',
  'shopping_list_items',
  'pantry_deducted_base_quantity',
  'shopping items persist the pantry quantity deducted for the immutable revision'
);
select has_column(
  'public',
  'shopping_list_items',
  'purchase_required_base_quantity',
  'shopping items persist the post-pantry purchase requirement before package rounding'
);
select col_type_is(
  'public',
  'shopping_list_items',
  'pantry_deducted_base_quantity',
  'numeric(30,12)',
  'pantry deduction keeps canonical high-precision quantity storage'
);
select col_type_is(
  'public',
  'shopping_list_items',
  'purchase_required_base_quantity',
  'numeric(30,12)',
  'purchase requirement keeps canonical high-precision quantity storage'
);

select * from finish();
rollback;
