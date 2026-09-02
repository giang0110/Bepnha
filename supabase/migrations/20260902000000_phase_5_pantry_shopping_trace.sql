-- Preserve authoritative Phase 5 pantry deductions through the immutable shopping read model.
-- Existing Phase 4 rows predate pantry and are backfilled as zero deduction / full purchase need.
alter table public.shopping_list_items
  add column pantry_deducted_base_quantity text,
  add column purchase_required_base_quantity text;

update public.shopping_list_items
set pantry_deducted_base_quantity = '0',
    purchase_required_base_quantity = required_base_quantity;

alter table public.shopping_list_items
  alter column pantry_deducted_base_quantity set not null,
  alter column purchase_required_base_quantity set not null;

-- Phase 4 assumed every gross requirement had to be bought. Pantry changes the invariant to:
-- gross required = pantry deducted + purchase required, then package rounding applies to purchase required.
do $$
declare
  v_constraint record;
  v_dropped integer := 0;
  v_definition text;
begin
  for v_constraint in
    select constraint_row.oid, constraint_row.conname
    from pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.shopping_list_items'::regclass
      and constraint_row.contype = 'c'
  loop
    v_definition := pg_get_constraintdef(v_constraint.oid);
    if v_definition like '%is_canonical_decimal_text(purchase_package_count, false)%'
      or v_definition like '%is_canonical_decimal_text(purchase_base_quantity, false)%'
      or (
        v_definition like '%purchase_base_quantity%'
        and v_definition like '%required_base_quantity%'
        and v_definition like '%>=%'
      )
      or (
        v_definition like '%leftover_base_quantity%'
        and v_definition like '%purchase_base_quantity%'
        and v_definition like '%required_base_quantity%'
        and v_definition like '%-%'
      ) then
      execute format(
        'alter table public.shopping_list_items drop constraint %I',
        v_constraint.conname
      );
      v_dropped := v_dropped + 1;
    end if;
  end loop;

  if v_dropped <> 4 then
    raise exception using
      errcode = '55000',
      message = 'PHASE5_EXPECTED_SHOPPING_QUANTITY_CONSTRAINTS_NOT_FOUND';
  end if;
end;
$$;

alter table public.shopping_list_items
  add constraint shopping_list_items_pantry_deducted_decimal_check
    check (private.is_canonical_decimal_text(pantry_deducted_base_quantity, true)),
  add constraint shopping_list_items_purchase_required_decimal_check
    check (private.is_canonical_decimal_text(purchase_required_base_quantity, true)),
  add constraint shopping_list_items_purchase_package_count_decimal_check
    check (private.is_canonical_decimal_text(purchase_package_count, true)),
  add constraint shopping_list_items_purchase_base_decimal_check
    check (private.is_canonical_decimal_text(purchase_base_quantity, true)),
  add constraint shopping_list_items_gross_quantity_balance_check
    check (
      required_base_quantity::numeric
        = pantry_deducted_base_quantity::numeric + purchase_required_base_quantity::numeric
    ),
  add constraint shopping_list_items_purchase_covers_required_check
    check (purchase_base_quantity::numeric >= purchase_required_base_quantity::numeric),
  add constraint shopping_list_items_leftover_after_pantry_check
    check (
      leftover_base_quantity::numeric
        = purchase_base_quantity::numeric - purchase_required_base_quantity::numeric
    );

-- Patch sealed-revision assertions so relational shopping evidence must preserve both pantry quantities.
-- Older v2 callers that predate Pantry are interpreted strictly as zero deduction/full purchase need.
do $$
declare
  v_definition text;
  v_patched text;
begin
  v_definition := pg_get_functiondef(
    'private.assert_revision_shopping_row(uuid)'::regprocedure
  );

  v_patched := replace(
    v_definition,
    $old$v_line ->> 'requiredBaseQuantity' is distinct from v_basket_line ->> 'requiredBaseQuantity'$old$,
    $new$v_line ->> 'requiredBaseQuantity' is distinct from v_basket_line ->> 'requiredBaseQuantity'
      or coalesce(v_line ->> 'pantryDeductedBaseQuantity', '0')
        is distinct from coalesce(v_basket_line ->> 'pantryDeductedBaseQuantity', '0')
      or coalesce(v_line ->> 'purchaseRequiredBaseQuantity', v_line ->> 'requiredBaseQuantity')
        is distinct from coalesce(
          v_basket_line ->> 'purchaseRequiredBaseQuantity',
          v_basket_line ->> 'requiredBaseQuantity'
        )$new$
  );

  v_patched := replace(
    v_patched,
    $old$v_db_line.required_base_quantity <> v_line ->> 'requiredBaseQuantity'$old$,
    $new$v_db_line.required_base_quantity <> v_line ->> 'requiredBaseQuantity'
      or v_db_line.pantry_deducted_base_quantity
        <> coalesce(v_line ->> 'pantryDeductedBaseQuantity', '0')
      or v_db_line.purchase_required_base_quantity
        <> coalesce(v_line ->> 'purchaseRequiredBaseQuantity', v_line ->> 'requiredBaseQuantity')$new$
  );

  if v_patched = v_definition then
    raise exception using
      errcode = '55000',
      message = 'PHASE5_EXPECTED_SHOPPING_ASSERTION_FIELDS_NOT_FOUND';
  end if;

  execute v_patched;
end;
$$;

-- Persist the two authoritative pantry evidence fields with each immutable shopping line.
-- Missing fields are accepted only as the backwards-compatible zero-deduction interpretation.
do $$
declare
  v_definition text;
  v_patched text;
begin
  v_definition := pg_get_functiondef(
    'public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)'::regprocedure
  );

  v_patched := replace(
    v_definition,
    $old$required_base_quantity, package_base_quantity, purchase_increment,$old$,
    $new$required_base_quantity, pantry_deducted_base_quantity, purchase_required_base_quantity,
      package_base_quantity, purchase_increment,$new$
  );

  v_patched := replace(
    v_patched,
    $old$(v_line ->> 'baseUnitId')::uuid, v_line ->> 'requiredBaseQuantity',
      v_line ->> 'packageBaseQuantity'$old$,
    $new$(v_line ->> 'baseUnitId')::uuid, v_line ->> 'requiredBaseQuantity',
      coalesce(v_line ->> 'pantryDeductedBaseQuantity', '0'),
      coalesce(v_line ->> 'purchaseRequiredBaseQuantity', v_line ->> 'requiredBaseQuantity'),
      v_line ->> 'packageBaseQuantity'$new$
  );

  if v_patched = v_definition then
    raise exception using
      errcode = '55000',
      message = 'PHASE5_EXPECTED_SHOPPING_PERSISTENCE_FIELDS_NOT_FOUND';
  end if;

  execute v_patched;
end;
$$;

-- Return the same pantry evidence through the owner-scoped shopping RPC.
do $$
declare
  v_definition text;
  v_patched text;
begin
  v_definition := pg_get_functiondef(
    'public.get_shopping_list(uuid,uuid)'::regprocedure
  );

  v_patched := replace(
    v_definition,
    $old$'requiredBaseQuantity', item.required_base_quantity,
          'packageBaseQuantity'$old$,
    $new$'requiredBaseQuantity', item.required_base_quantity,
          'pantryDeductedBaseQuantity', item.pantry_deducted_base_quantity,
          'purchaseRequiredBaseQuantity', item.purchase_required_base_quantity,
          'packageBaseQuantity'$new$
  );

  if v_patched = v_definition then
    raise exception using
      errcode = '55000',
      message = 'PHASE5_EXPECTED_SHOPPING_RPC_FIELDS_NOT_FOUND';
  end if;

  execute v_patched;
end;
$$;
