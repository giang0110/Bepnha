-- Completing a checked pantry-covered line is a durable settlement even when current stock
-- was emptied or deleted after generation. Its transfer-line key must latch the confirmation
-- so a retry cannot consume stock entered after that trip was already completed.
-- Patch only the two zero-change exits; preserve the owner checks, locks and v6 fact guards.
do $patch$
declare
  definition text;
  patched text;
begin
  definition := pg_get_functiondef('public.apply_shopping_to_pantry(uuid)'::regprocedure);
  patched := replace(definition, $old$      if v_item.leftover_base <= 0 then
        continue;
      end if;$old$, $new$      if v_item.leftover_base <= 0 then
        insert into public.shopping_pantry_transfer_lines (
          transfer_id, shopping_list_item_id, pantry_item_id, food_id, base_unit_id,
          transferred_base_quantity, pantry_consumed_base_quantity
        ) values (
          v_transfer.id, v_item.id, null, v_item.food_id, v_item.base_unit_id, '0', '0'
        );
        v_line_count := v_line_count + 1;
        continue;
      end if;$new$);
  if patched = definition then
    raise exception using errcode = '55000',
      message = 'ZERO_CHANGE_PANTRY_MISSING_ROW_PATCH_REQUIRED';
  end if;

  definition := patched;
  patched := replace(definition, $old$      if v_actual_consumed = 0 and v_added_quantity = 0 then
        continue;
      end if;

      update public.pantry_items
      set quantity = v_after_consume + v_added_quantity
      where id = v_existing.id
      returning id into v_pantry_item_id;$old$, $new$      v_pantry_item_id := v_existing.id;
      if v_actual_consumed <> 0 or v_added_quantity <> 0 then
        update public.pantry_items
        set quantity = v_after_consume + v_added_quantity
        where id = v_existing.id
        returning id into v_pantry_item_id;
      end if;$new$);
  if patched = definition then
    raise exception using errcode = '55000',
      message = 'ZERO_CHANGE_PANTRY_EXISTING_ROW_PATCH_REQUIRED';
  end if;

  execute patched;
end $patch$;
