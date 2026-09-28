-- BepNha — vì sao planner báo "Chưa tìm thấy kế hoạch đủ 7 bữa". CHỈ ĐỌC.
--
-- Dùng khi màn hình Kế hoạch tuần trả mã NO_COMPLETE_PLAN_FOUND_IN_DETERMINISTIC_SEARCH.
--
-- Câu chữ trên màn hình nói về "phạm vi tìm kiếm tất định", và nó dẫn người đọc đi sai
-- hướng. Đo bằng searchWeek với kho món 1, 3, 6, 7, 8 (2026-09-28): kho <= 6 luôn trả mã
-- đó, kho >= 7 luôn ra kế hoạch. Ranh giới trùng khít số ngày trong tuần, vì
-- search-week.ts:124 cấm lặp món trong một tuần. Nói cách khác mã này gần như luôn có
-- nghĩa "còn dưới 7 món đủ điều kiện", chứ không phải "tìm chưa đủ rộng".
--
-- API chỉ trả { error: MÃ } và telemetry không ghi lại danh sách món bị loại, nên mã hỗ
-- trợ trên màn hình tra được request nhưng không cho biết lý do. Đó là vì sao phải chạy
-- tay mấy câu dưới đây.
--
-- Dán vào Supabase → SQL Editor của project vkrqzwlpneocgjwhqbsl, chạy Q1 trước,
-- chép household_id ra, rồi thay vào ba câu sau.
-- Không có insert/update/delete ở bất kỳ đâu trong file này.
--
-- Điều đã biết chắc: một tuần không được lặp món (search-week.ts:124), nên dưới 7 món
-- đủ điều kiện là KHÔNG THỂ ra kế hoạch. Cần tìm xem còn lại bao nhiêu món, và vì sao.


-- ===========================================================================
-- Q1. Gia đình: điều kiện bắt buộc, độ nghiêm của dị ứng, giới hạn giờ nấu
-- ===========================================================================
select
  h.id                                as household_id,
  h.max_elapsed_minutes               as gioi_han_phut_nau,
  h.weekly_plan_budget_vnd            as ngan_sach_tuan,
  h.price_region_id,
  coalesce(
    (select jsonb_object_agg(r.rule_code, r.allergen_strictness)
     from public.household_food_rules as r
     where r.household_id = h.id),
    '{}'::jsonb
  )                                   as dieu_kien_bat_buoc,
  (select count(*) from public.household_member_groups as g
   where g.household_id = h.id)       as so_nhom_thanh_vien
from public.households as h
where h.onboarding_completed_at is not null
order by h.created_at desc;


-- ===========================================================================
-- Q2. SỐ QUYẾT ĐỊNH: danh mục có bao nhiêu món đang publish?
--     Đây đúng là tập mà get_planner_generation_input trả về cho planner.
-- ===========================================================================
select count(*) as mon_dang_publish
from public.meal_options as identity
join public.meal_option_versions as version
  on version.id = identity.current_version_id
where identity.status = 'published'
  and identity.retired_at is null
  and version.publication_status = 'published';

-- Nếu con số này < 7 thì đã xong: nguyên nhân là danh mục, không phải gia đình,
-- và không câu nào phía dưới đổi được kết luận.


-- ===========================================================================
-- Q3. Bảng giá: có thiếu giá món nào không, và giá cũ tới đâu
--     currentMaxAgeDays = 30, usableMaxAgeDays = 90 (pricing.ts).
--     Quá 90 ngày là không dùng được -> món chứa nguyên liệu đó rụng khỏi danh sách.
-- ===========================================================================
select
  book.id                            as price_book_id,
  book.version_number,
  count(price.id)                    as so_dong_gia,
  min(price.observed_at)             as khao_gia_cu_nhat,
  max(price.observed_at)             as khao_gia_moi_nhat,
  count(*) filter (where current_date - price.observed_at > 90)
                                     as qua_han_khong_dung_duoc,
  count(*) filter (where current_date - price.observed_at between 31 and 90)
                                     as cu_nhung_con_dung_duoc
from public.households as h
join public.price_regions as region on region.id = h.price_region_id
join public.price_books as book on book.id = region.current_price_book_id
left join public.food_prices as price on price.price_book_id = book.id
where h.id = 'DÁN_HOUSEHOLD_ID'
  and book.publication_status = 'published'
  and book.retired_at is null
group by book.id, book.version_number;


-- ===========================================================================
-- Q4. Từng món publish: còn sống hay chết, và chết vì gì
--
--     Câu này phủ được HAI tầng lọc nằm ở dữ liệu:
--       - thiếu giá cho nguyên liệu;
--       - giá quá 90 ngày;
--       - quá giới hạn giờ nấu của gia đình.
--     KHÔNG phủ được dị ứng và dinh dưỡng — hai thứ đó planner xét bằng code, và
--     tôi cố ý không chép lại logic đó sang SQL vì chép là sai sớm hay muộn.
--     Nên 'con_song' dưới đây là CẬN TRÊN: thực tế có thể còn thấp hơn.
-- ===========================================================================
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
judged as (
  select
    o.meal_option_id, o.code, o.name_vi, o.elapsed_minutes,
    count(ri.food_id)                                     as so_nguyen_lieu,
    count(*) filter (where p.id is null)                  as thieu_gia,
    count(*) filter (
      where p.id is not null and current_date - p.observed_at > 90
    )                                                     as gia_qua_han
  from published_option as o
  join public.meal_option_recipes as mor
    on mor.meal_option_version_id = o.version_id
  join public.recipe_ingredients as ri
    on ri.recipe_version_id = mor.recipe_version_id
  left join public.food_prices as p
    on p.food_id = ri.food_id and p.price_book_id = (select id from book)
  group by o.meal_option_id, o.code, o.name_vi, o.elapsed_minutes
)
select
  -- Phải bằng 1. Bằng 0 nghĩa là vùng giá của gia đình không có bảng giá nào đang
  -- publish, và khi đó cột 'chet_thieu_gia' bên dưới đọc sai thành "mọi món đều thiếu".
  (select count(*) from book)                             as tim_thay_bang_gia,
  count(*)                                                as mon_publish,
  count(*) filter (where thieu_gia > 0)                   as chet_thieu_gia,
  count(*) filter (where thieu_gia = 0 and gia_qua_han > 0)
                                                          as chet_gia_qua_han,
  count(*) filter (
    where thieu_gia = 0 and gia_qua_han = 0
      and elapsed_minutes > (select max_elapsed_minutes from hh)
  )                                                       as chet_qua_gio,
  count(*) filter (
    where thieu_gia = 0 and gia_qua_han = 0
      and elapsed_minutes <= (select max_elapsed_minutes from hh)
  )                                                       as con_song_can_tren,
  7                                                       as can_toi_thieu
from judged;


-- ===========================================================================
-- Q5. Nếu Q4 cho con số khó hiểu, xem từng món: đổi câu select cuối của Q4 thành
-- ===========================================================================
--   select code, name_vi, so_nguyen_lieu, thieu_gia, gia_qua_han, elapsed_minutes
--   from judged
--   order by (thieu_gia + gia_qua_han) desc, code;
