-- Cho phép đọc lại kế hoạch của một tuần.
--
-- Trước migration này không có đường nào tìm kế hoạch theo (hộ gia đình, tuần):
-- `get_plan_replacement_input` cần sẵn một `plan_id`, mà `plan_id` chỉ tồn tại trong bộ nhớ trang
-- ngay sau khi tạo. Tải lại trang là mất, và bấm tạo lại thì bị từ chối vì kế hoạch đã tồn tại —
-- người dùng không còn đường nào quay lại kế hoạch của chính mình.
--
-- Hàm này không tự đọc gì: nó tra `plan_id` rồi uỷ thác cho hàm đã có. `security invoker` giữ nguyên
-- RLS, nên `meal_plans_owner_read` vẫn là thứ quyết định ai thấy được gì; người không phải chủ hộ
-- không chọn được hàng nào và nhận về null, đúng như khi gọi thẳng hàm kia với một plan id lạ.

create function public.get_current_plan_for_week(p_household_id uuid, p_week_start date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.get_plan_replacement_input(plan.id)
  from public.meal_plans as plan
  where plan.household_id = p_household_id
    and plan.week_start = p_week_start;
$$;

revoke all on function public.get_current_plan_for_week(uuid, date) from public, anon;
grant execute on function public.get_current_plan_for_week(uuid, date) to authenticated;
