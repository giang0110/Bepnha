-- Không lặp món trong vài tuần gần nhất.
--
-- Hai phần, và thứ tự triển khai của chúng khác nhau:
--
-- 1. Hàm `get_recent_meal_option_ids` là đường ĐỌC mới. Code gọi nó phải chịu được việc hàm chưa
--    tồn tại (PostgreSQL trả 42883 cho cả câu lệnh), nên `supabase-planner-input-loader.ts` bắt lỗi
--    đó và coi lịch sử là rỗng — kế hoạch vẫn tạo được, chỉ là chưa tránh món cũ.
--
-- 2. Nới các guard engine version lên `planner-engine-v4` là đường GHI, và nó KHÔNG chịu được độ
--    trễ: nếu code v4 lên production trước migration này, `persist_meal_plan_revision` sẽ từ chối
--    mọi bản ghi mới và việc tạo kế hoạch hỏng hoàn toàn. Migration này phải được áp dụng TRƯỚC khi
--    nhánh được merge. Xem mục "Migration and deploy ordering" trong
--    docs/operations/production-readiness.md.
--
-- Giữ nguyên cách vá theo văn bản của migration Phase 5: định nghĩa hàm là nguồn sự thật, và việc
-- không tìm thấy đúng đoạn cần thay là lỗi dừng hẳn chứ không phải im lặng bỏ qua.

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
    $old$if v_revision.engine_version not in ('planner-engine-v2', 'planner-engine-v3')$old$,
    $new$if v_revision.engine_version not in ('planner-engine-v2', 'planner-engine-v3', 'planner-engine-v4')$new$
  );
  if v_patched = v_definition then
    raise exception using
      errcode = '55000',
      message = 'RECENT_WEEK_EXPECTED_SHOPPING_REVISION_GUARD_NOT_FOUND';
  end if;
  execute v_patched;

  v_definition := pg_get_functiondef(
    'private.assert_plan_summary_row(uuid)'::regprocedure
  );
  v_patched := replace(
    v_definition,
    $old$if v_revision.engine_version in ('planner-engine-v2', 'planner-engine-v3') then$old$,
    $new$if v_revision.engine_version in ('planner-engine-v2', 'planner-engine-v3', 'planner-engine-v4') then$new$
  );
  if v_patched = v_definition then
    raise exception using
      errcode = '55000',
      message = 'RECENT_WEEK_EXPECTED_PLAN_SUMMARY_ENGINE_GUARD_NOT_FOUND';
  end if;
  execute v_patched;

  v_definition := pg_get_functiondef(
    'public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)'::regprocedure
  );
  v_patched := replace(
    v_definition,
    $old$or p_revision ->> 'engineVersion' not in ('planner-engine-v2', 'planner-engine-v3')$old$,
    $new$or p_revision ->> 'engineVersion' not in ('planner-engine-v2', 'planner-engine-v3', 'planner-engine-v4')$new$
  );
  if v_patched = v_definition then
    raise exception using
      errcode = '55000',
      message = 'RECENT_WEEK_EXPECTED_PLAN_PERSISTENCE_ENGINE_GUARD_NOT_FOUND';
  end if;
  execute v_patched;
end;
$$;

-- Những món hộ này đã nấu trong `p_week_count` tuần ngay trước `p_week_start`.
--
-- Chỉ đọc bản hiện hành của mỗi tuần (`current_revision_id`): các bản nháp và bản đã bị thay thế
-- không phải là bữa ai đó thực sự đã nấu.
--
-- `security invoker` nên RLS vẫn là thứ quyết định ai thấy gì; người không phải chủ hộ không chọn
-- được hàng nào và nhận về mảng rỗng, y như khi hộ đó chưa có kế hoạch nào.
--
-- Trả về định danh món (`meal_option_id`) chứ không phải phiên bản: hộ ăn cơm gà tuần trước là đã ăn
-- cơm gà, dù công thức có được sửa đổi giữa chừng hay không.
create function public.get_recent_meal_option_ids(
  p_household_id uuid,
  p_week_start date,
  p_week_count integer
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(distinct item.meal_option_id order by item.meal_option_id), '[]'::jsonb)
  from public.meal_plans as plan
  join public.meal_plan_revisions as revision
    on revision.id = plan.current_revision_id
  join public.meal_plan_items as item
    on item.meal_plan_revision_id = revision.id
  where plan.household_id = p_household_id
    and plan.week_start < p_week_start
    and plan.week_start >= p_week_start - (greatest(p_week_count, 0) * 7);
$$;

revoke all on function public.get_recent_meal_option_ids(uuid, date, integer) from public, anon;
grant execute on function public.get_recent_meal_option_ids(uuid, date, integer) to authenticated;
