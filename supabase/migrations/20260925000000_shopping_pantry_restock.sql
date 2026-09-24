-- Phần dư sau khi đi chợ đi vào tủ bếp.
--
-- Danh sách đi chợ đã tính sẵn ba con số cho mỗi món: cần bao nhiêu, phải mua bao nhiêu gói, và dư
-- ra bao nhiêu. Con số thứ ba xưa nay chỉ để đọc. Nó chính là thứ còn lại trong bếp sau khi nấu hết
-- tuần, nên nó thuộc về tủ bếp — và tuần sau planner sẽ tự trừ nó đi thay vì bắt mua lại.
--
-- Chỉ chuyển phần DƯ, không chuyển cả gói vừa mua: phần dùng cho tuần này sẽ được nấu hết, nên cộng
-- cả gói vào tủ bếp là khai khống tồn kho, và planner tuần sau sẽ tưởng còn nhiều hơn thực tế.
--
-- Chốt chống cộng trùng đặt ở TỪNG MÓN, không phải ở cả chuyến đi chợ. Người ta tick vài món rồi
-- bấm xong, lát sau tick thêm rồi bấm lại — chốt theo chuyến sẽ nhốt những món tick sau ở ngoài tủ
-- bếp vĩnh viễn. Khoá chính của bảng dòng là `shopping_list_item_id`, nên mỗi món vào tủ bếp đúng
-- một lần dù bấm bao nhiêu lần.

create table public.shopping_pantry_transfers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  shopping_list_id uuid not null,
  meal_plan_revision_id uuid not null,
  transferred_line_count integer not null check (transferred_line_count >= 0),
  created_at timestamptz not null default now(),
  constraint shopping_pantry_transfers_list_fkey
    foreign key (shopping_list_id, meal_plan_revision_id)
    references public.shopping_lists (id, meal_plan_revision_id) on delete cascade
);

create index shopping_pantry_transfers_household_id_idx
on public.shopping_pantry_transfers (household_id);

-- Bằng chứng từng dòng. Số ghi ở đây là lượng base ĐÚNG đã chuyển, không làm tròn, nên vẫn đối chiếu
-- được với danh sách đi chợ kể cả khi ô `quantity` của tủ bếp phải làm tròn theo precision của nó.
create table public.shopping_pantry_transfer_lines (
  -- Khoá chính, không phải cột thường: đây chính là chốt chống cộng trùng.
  shopping_list_item_id uuid primary key references public.shopping_list_items (id) on delete cascade,
  transfer_id uuid not null references public.shopping_pantry_transfers (id) on delete cascade,
  pantry_item_id uuid not null references public.pantry_items (id) on delete cascade,
  food_id uuid not null,
  base_unit_id uuid not null,
  transferred_base_quantity text not null
    check (private.is_canonical_decimal_text(transferred_base_quantity, false))
);

create index shopping_pantry_transfer_lines_transfer_id_idx
on public.shopping_pantry_transfer_lines (transfer_id);

alter table public.shopping_pantry_transfers enable row level security;
alter table public.shopping_pantry_transfer_lines enable row level security;

revoke all on table public.shopping_pantry_transfers from public, anon, authenticated;
revoke all on table public.shopping_pantry_transfer_lines from public, anon, authenticated;
grant select on table public.shopping_pantry_transfers to authenticated;
grant select on table public.shopping_pantry_transfer_lines to authenticated;

create policy shopping_pantry_transfers_select_own
on public.shopping_pantry_transfers
for select
to authenticated
using (
  exists (
    select 1
    from public.households as household
    where household.id = shopping_pantry_transfers.household_id
      and household.owner_user_id = (select auth.uid())
  )
);

create policy shopping_pantry_transfer_lines_select_own
on public.shopping_pantry_transfer_lines
for select
to authenticated
using (
  exists (
    select 1
    from public.shopping_pantry_transfers as transfer
    join public.households as household on household.id = transfer.household_id
    where transfer.id = shopping_pantry_transfer_lines.transfer_id
      and household.owner_user_id = (select auth.uid())
  )
);

-- Chuyển phần dư của những món ĐÃ TICK sang tủ bếp.
--
-- Idempotent theo từng món: gọi lại chỉ chuyển những món chưa từng được chuyển. Người đứng giữa chợ
-- bấm hai lần là chuyện bình thường, và tồn kho sai thì tuần sau nấu thiếu.
--
-- Không có món nào bị bỏ qua trong im lặng: thiếu phiên bản dữ liệu thực phẩm hay thiếu quy đổi đơn
-- vị đều làm cả lệnh dừng lại, vì đoán một con số tồn kho còn tệ hơn là không ghi gì.
create function public.apply_shopping_to_pantry(p_meal_plan_revision_id uuid)
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

  -- Khoá hộ, không khoá từng dòng: hai lần bấm đồng thời phải xếp hàng, nếu không cả hai cùng thấy
  -- "chưa chuyển" rồi cùng cộng.
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
      item.leftover_base_quantity::numeric as leftover_base
    from public.shopping_list_items as item
    join public.shopping_item_check_states as checked
      on checked.shopping_list_item_id = item.id
    where item.meal_plan_revision_id = p_meal_plan_revision_id
      and item.leftover_base_quantity::numeric > 0
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

    -- Ghi lại ngay: `found` sẽ bị câu truy vấn quy đổi bên dưới ghi đè trước khi dùng tới.
    v_has_pantry_row := found;

    if v_has_pantry_row then
      -- Giữ nguyên đơn vị và lineage người dùng đã chọn: chỉ cộng thêm số lượng, quy về đơn vị đó.
      v_fact_version_id := v_existing.food_fact_version_id;
      v_unit_id := v_existing.unit_id;
    else
      -- Dòng mới ghi theo base unit của thực phẩm, nên hệ số quy đổi bằng 1 và không có làm tròn.
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

    if v_added_quantity <= 0 then
      -- Phần dư nhỏ hơn cả bước nhỏ nhất mà cột lưu được. Cộng 0 chỉ tạo ra một dòng tủ bếp rỗng và
      -- một dòng bằng chứng nói dối, nên bỏ qua hẳn món này.
      continue;
    end if;

    if v_has_pantry_row then
      update public.pantry_items
      set quantity = quantity + v_added_quantity
      where id = v_existing.id
      returning id into v_pantry_item_id;
    else
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
      transferred_base_quantity
    ) values (
      v_transfer.id,
      v_item.id,
      v_pantry_item_id,
      v_item.food_id,
      v_item.base_unit_id,
      -- Chép nguyên văn text của danh sách đi chợ. Nó đã là canonical decimal (có check constraint
      -- riêng), nên đi vòng qua numeric rồi cắt số 0 cuối chỉ tạo cơ hội làm hỏng: '300' bị cắt
      -- thành '3'.
      v_item.leftover_text
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
    -- Tổng cộng dồn của cả revision, để màn hình nói được "đã cất 5 món" chứ không chỉ "vừa cất 2".
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
