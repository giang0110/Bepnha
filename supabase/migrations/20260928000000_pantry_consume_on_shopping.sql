-- Tủ bếp phải vơi đi, không chỉ đầy lên.
--
-- Từ Phase 5 tới nay, không có gì trừ `pantry_items`. Việc trừ chỉ xảy ra trên giấy: lúc lập kế
-- hoạch, `pantry_deducted_base_quantity` được ghi vào từng dòng đi chợ để mua ít đi — nhưng số
-- lượng trong tủ bếp thì giữ nguyên. Tuần sau planner lại trừ đúng chỗ thực phẩm đó lần nữa, và
-- mua thiếu. Tuần sau nữa lại thiếu thêm.
--
-- `apply_shopping_to_pantry` khiến chuyện này nặng hơn: nó cộng phần dư vào một cái giỏ không bao
-- giờ vơi. Vậy nên chỗ sửa đúng là chính nó — một hành động, hai chiều, đối xứng:
--
--   tủ bếp mới = tủ bếp cũ − phần kế hoạch đã lấy + phần mua về còn dư
--
-- Thời điểm này là thời điểm đúng: đi chợ xong là lúc nhu cầu cả tuần đã được phủ, nên phần tủ bếp
-- mà kế hoạch trông vào coi như đã tiêu.
--
-- Migration này cũng vá một lỗi của chính bảng bằng chứng, xem `pantry_item_id` bên dưới.

-- Cột bằng chứng cho chiều đi ra. `transferred_base_quantity` vẫn là chiều đi vào; gộp hai chiều
-- vào một số ròng sẽ xoá mất thông tin, và bằng chứng là thứ duy nhất đối chiếu được về sau.
alter table public.shopping_pantry_transfer_lines
  add column pantry_consumed_base_quantity text not null default '0'
    check (private.is_canonical_decimal_text(pantry_consumed_base_quantity, true));

-- `on delete cascade` ở đây là một lỗi, và nó đủ nghiêm trọng để sửa ngay.
--
-- Chốt chống cộng trùng chính là hàng trong bảng này. Gắn nó vào vòng đời của hàng tủ bếp nghĩa là:
-- người dùng xoá một món khỏi tủ bếp → hàng bằng chứng biến mất theo → lần bấm "Đi chợ xong" sau đó
-- cộng lại đúng thứ họ vừa cố ý bỏ đi. Chốt phải sống lâu hơn thứ nó trỏ tới.
alter table public.shopping_pantry_transfer_lines
  drop constraint shopping_pantry_transfer_lines_pantry_item_id_fkey;
alter table public.shopping_pantry_transfer_lines
  alter column pantry_item_id drop not null;
alter table public.shopping_pantry_transfer_lines
  add constraint shopping_pantry_transfer_lines_pantry_item_id_fkey
    foreign key (pantry_item_id) references public.pantry_items (id) on delete set null;

create or replace function public.apply_shopping_to_pantry(p_meal_plan_revision_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_shopping_list_id uuid;
  v_transfer public.shopping_pantry_transfers;
  v_item record;
  v_existing public.pantry_items;
  v_fact_version_id uuid;
  v_unit_id uuid;
  v_factor numeric(18, 6);
  v_added_quantity numeric(18, 6);
  v_wanted_consume numeric(18, 6);
  v_after_consume numeric(18, 6);
  v_actual_consumed numeric(18, 6);
  v_pantry_item_id uuid;
  v_has_pantry_row boolean;
  v_line_count integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select list.id, plan.household_id
  into v_shopping_list_id, v_household_id
  from public.shopping_lists as list
  join public.meal_plans as plan on plan.id = list.meal_plan_id
  join public.households as household on household.id = plan.household_id
  where list.meal_plan_revision_id = p_meal_plan_revision_id
    and household.owner_user_id = v_user_id;

  if not found then
    raise exception using errcode = '42501', message = 'SHOPPING_LIST_OWNERSHIP_REQUIRED';
  end if;

  perform 1 from public.households where id = v_household_id for update;

  insert into public.shopping_pantry_transfers (
    household_id, shopping_list_id, meal_plan_revision_id, transferred_line_count
  ) values (v_household_id, v_shopping_list_id, p_meal_plan_revision_id, 0)
  returning * into v_transfer;

  for v_item in
    select
      item.id,
      item.food_id,
      item.base_unit_id,
      item.leftover_base_quantity as leftover_text,
      item.leftover_base_quantity::numeric as leftover_base,
      item.pantry_deducted_base_quantity::numeric as deducted_base
    from public.shopping_list_items as item
    join public.shopping_item_check_states as checked
      on checked.shopping_list_item_id = item.id
    where item.meal_plan_revision_id = p_meal_plan_revision_id
      -- Một dòng có phần trừ nhưng không có phần dư vẫn phải được xử lý: kế hoạch đã lấy thực phẩm
      -- đó ra khỏi tủ bếp, dù lần mua này không để lại gì.
      and (item.leftover_base_quantity::numeric > 0 or item.pantry_deducted_base_quantity::numeric > 0)
      and not exists (
        select 1
        from public.shopping_pantry_transfer_lines as line
        where line.shopping_list_item_id = item.id
      )
    order by item.id
  loop
    select pantry.*
    into v_existing
    from public.pantry_items as pantry
    where pantry.household_id = v_household_id
      and pantry.food_id = v_item.food_id
    for update;

    v_has_pantry_row := found;

    if v_has_pantry_row then
      v_fact_version_id := v_existing.food_fact_version_id;
      v_unit_id := v_existing.unit_id;
    else
      -- Không có hàng tủ bếp thì không có gì để trừ. Chỉ tạo hàng mới khi thật sự có phần dư.
      if v_item.leftover_base <= 0 then
        continue;
      end if;
      select food.current_fact_version_id
      into v_fact_version_id
      from public.foods as food
      where food.id = v_item.food_id;

      if v_fact_version_id is null then
        raise exception using
          errcode = '23503',
          message = 'PANTRY_RESTOCK_FOOD_FACT_UNAVAILABLE';
      end if;
      v_unit_id := v_item.base_unit_id;
    end if;

    select conversion.base_quantity_per_unit
    into v_factor
    from public.food_fact_unit_conversions as conversion
    where conversion.food_fact_version_id = v_fact_version_id
      and conversion.unit_id = v_unit_id;

    if v_factor is null then
      raise exception using
        errcode = '23503',
        message = 'PANTRY_RESTOCK_CONVERSION_UNAVAILABLE';
    end if;

    v_added_quantity := (v_item.leftover_base / v_factor)::numeric(18, 6);

    if v_has_pantry_row then
      v_wanted_consume := (v_item.deducted_base / v_factor)::numeric(18, 6);
      -- Sàn ở 0 thay vì báo lỗi. Tủ bếp có thể đã bị người dùng sửa xuống sau khi lập kế hoạch, và
      -- một tủ bếp âm là điều không tồn tại. Số thật sự lấy được mới là số ghi vào bằng chứng, nên
      -- phần chênh không biến mất trong im lặng — nó nằm ngay đó để đối chiếu.
      v_after_consume := greatest(v_existing.quantity - v_wanted_consume, 0);
      v_actual_consumed := v_existing.quantity - v_after_consume;

      if v_actual_consumed = 0 and v_added_quantity = 0 then
        continue;
      end if;

      update public.pantry_items
      set quantity = v_after_consume + v_added_quantity
      where id = v_existing.id
      returning id into v_pantry_item_id;
    else
      v_actual_consumed := 0;
      if v_added_quantity <= 0 then
        continue;
      end if;
      insert into public.pantry_items (
        household_id, food_id, food_fact_version_id, quantity, unit_id, base_quantity, base_unit_id
      ) values (
        v_household_id,
        v_item.food_id,
        v_fact_version_id,
        v_added_quantity,
        v_unit_id,
        0,
        v_item.base_unit_id
      )
      returning id into v_pantry_item_id;
    end if;

    insert into public.shopping_pantry_transfer_lines (
      transfer_id,
      shopping_list_item_id,
      pantry_item_id,
      food_id,
      base_unit_id,
      transferred_base_quantity,
      pantry_consumed_base_quantity
    ) values (
      v_transfer.id,
      v_item.id,
      v_pantry_item_id,
      v_item.food_id,
      v_item.base_unit_id,
      v_item.leftover_text,
      trim(trailing '.' from trim(trailing '0' from
        to_char((v_actual_consumed * v_factor)::numeric(30, 12), 'FM9999999999999999990.999999999999')))
    );

    v_line_count := v_line_count + 1;
  end loop;

  update public.shopping_pantry_transfers
  set transferred_line_count = v_line_count
  where id = v_transfer.id;

  return jsonb_build_object(
    'transferId', v_transfer.id,
    'mealPlanRevisionId', p_meal_plan_revision_id,
    'transferredLineCount', v_line_count,
    'totalTransferredLineCount', (
      select count(*)
      from public.shopping_pantry_transfer_lines as line
      join public.shopping_list_items as item
        on item.id = line.shopping_list_item_id
      where item.meal_plan_revision_id = p_meal_plan_revision_id
    )
  );
end;
$$;

revoke all on function public.apply_shopping_to_pantry(uuid) from public, anon;
grant execute on function public.apply_shopping_to_pantry(uuid) to authenticated;

-- Danh sách đi chợ phải nói được món nào đã vào tủ bếp rồi. Không có nó, nút "Đi chợ xong" ở lần mở
-- sau vẫn hứa cất những món nó đã cất, và bấm vào thì không làm gì cả.
do $$
declare
  v_definition text;
  v_patched text;
begin
  v_definition := pg_get_functiondef('public.get_shopping_list(uuid,uuid)'::regprocedure);
  v_patched := replace(
    v_definition,
    $old$'checked', check_state.shopping_list_item_id is not null,$old$,
    $new$'checked', check_state.shopping_list_item_id is not null,
          'transferredToPantry', exists (
            select 1
            from public.shopping_pantry_transfer_lines as transfer_line
            where transfer_line.shopping_list_item_id = item.id
          ),$new$
  );
  if v_patched = v_definition then
    raise exception using
      errcode = '55000',
      message = 'PANTRY_CONSUME_EXPECTED_SHOPPING_RPC_CHECKED_FIELD_NOT_FOUND';
  end if;
  execute v_patched;
end;
$$;
