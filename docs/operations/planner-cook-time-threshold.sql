-- BepNha — nới giới hạn giờ nấu lên bao nhiêu thì planner mới tạo được kế hoạch. CHỈ ĐỌC.
--
-- Dùng sau planner-refuses-to-plan.sql, khi Q4 ở đó cho thấy phần lớn món chết vì
-- 'chet_qua_gio'. Lần gặp đầu tiên (2026-09-28): 24 món publish, 18 món quá giờ, còn 6 —
-- thiếu đúng 1 món so với 7 ngày.
--
-- Câu này xếp các món đã qua được kiểm tra giá theo thời gian nấu tăng dần, kèm số món
-- cộng dồn. Đọc cột 'du_7_mon_tu_day' để biết ngưỡng cần đặt.
--
-- Lưu ý: con số ở đây vẫn là CẬN TRÊN. Dị ứng và dinh dưỡng được xét bằng code chứ không
-- phải SQL, nên một món lọt qua câu này vẫn có thể bị planner loại. Nới giới hạn tới
-- ngưỡng bên dưới là điều kiện cần, chưa chắc đã đủ.

with hh as (
  select id, price_region_id, max_elapsed_minutes
  from public.households
  where id = 'DÁN_HOUSEHOLD_ID'
),
book as (
  select b.id
  from hh
  join public.price_regions as region on region.id = hh.price_region_id
  join public.price_books as b on b.id = region.current_price_book_id
  where b.publication_status = 'published' and b.retired_at is null
),
published_option as (
  select identity.id as meal_option_id, identity.code, identity.name_vi,
         version.id as version_id, version.elapsed_minutes
  from public.meal_options as identity
  join public.meal_option_versions as version
    on version.id = identity.current_version_id
  where identity.status = 'published'
    and identity.retired_at is null
    and version.publication_status = 'published'
),
priced as (
  select o.meal_option_id, o.code, o.name_vi, o.elapsed_minutes
  from published_option as o
  join public.meal_option_recipes as mor
    on mor.meal_option_version_id = o.version_id
  join public.recipe_ingredients as ri
    on ri.recipe_version_id = mor.recipe_version_id
  left join public.food_prices as p
    on p.food_id = ri.food_id and p.price_book_id = (select id from book)
  group by o.meal_option_id, o.code, o.name_vi, o.elapsed_minutes
  having count(*) filter (where p.id is null) = 0
     and count(*) filter (
           where p.id is not null and current_date - p.observed_at > 90
         ) = 0
)
select
  elapsed_minutes                                        as phut_nau,
  code,
  name_vi,
  count(*) over (order by elapsed_minutes, code)         as cong_don,
  (select max_elapsed_minutes from hh)                   as gioi_han_hien_tai,
  case
    when count(*) over (order by elapsed_minutes, code) = 7
    then 'ĐẶT GIỚI HẠN >= ' || elapsed_minutes || ' PHÚT'
    else ''
  end                                                    as du_7_mon_tu_day
from priced
order by elapsed_minutes, code;
