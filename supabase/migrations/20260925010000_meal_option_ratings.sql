-- Đánh giá món ăn, và planner biết lắng nghe.
--
-- Hai phần, thứ tự triển khai khác nhau, y như migration lịch sử tuần gần đây:
--
-- 1. `get_meal_option_ratings` là đường ĐỌC mới. Code gọi nó phải chịu được việc hàm chưa tồn tại
--    (PostgreSQL trả 42883 cho cả câu lệnh), nên loader bắt lỗi đó và coi như chưa có đánh giá nào
--    — kế hoạch vẫn tạo được, chỉ là chưa chiều khẩu vị.
--
-- 2. Nới guard engine version lên `planner-engine-v5` là đường GHI, và nó KHÔNG chịu được độ trễ:
--    nếu code v5 lên production trước migration này, `persist_meal_plan_revision` từ chối mọi bản
--    ghi mới và việc tạo kế hoạch hỏng hoàn toàn. Migration này phải được áp dụng TRƯỚC khi nhánh
--    được merge. Xem "Migration and deploy ordering" trong docs/operations/production-readiness.md.
--
-- Đánh giá KHÔNG phải là ràng buộc cứng. Dị ứng và loại trừ mới là thứ loại một món ra khỏi danh
-- sách hợp lệ; món bị chê chỉ bị chấm điểm xấu hơn. Hộ nào chê gần hết thực đơn vẫn phải nhận được
-- bảy bữa, chứ không phải một lỗi "không tìm được kế hoạch".

create type public.meal_rating as enum ('liked', 'disliked');

-- Không có dòng nào nghĩa là "bình thường". Lưu một hàng để nói rằng người ta không có ý kiến gì là
-- lưu một sự im lặng, và rồi phải phân biệt im lặng đã ghi với im lặng chưa ghi.
create table public.meal_option_ratings (
  household_id uuid not null references public.households (id) on delete cascade,
  meal_option_id uuid not null references public.meal_options (id) on delete cascade,
  rating public.meal_rating not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, meal_option_id)
);

create index meal_option_ratings_meal_option_id_idx
on public.meal_option_ratings (meal_option_id);

alter table public.meal_option_ratings enable row level security;
revoke all on table public.meal_option_ratings from public, anon, authenticated;
grant select on table public.meal_option_ratings to authenticated;

create policy meal_option_ratings_select_own
on public.meal_option_ratings
for select
to authenticated
using (
  exists (
    select 1
    from public.households as household
    where household.id = meal_option_ratings.household_id
      and household.owner_user_id = (select auth.uid())
  )
);

-- Đặt hoặc xoá đánh giá của hộ cho một món.
--
-- `p_rating` là null nghĩa là quay về "bình thường", và cách diễn đạt điều đó là xoá hàng đi.
create function public.set_meal_option_rating(
  p_household_id uuid,
  p_meal_option_id uuid,
  p_rating text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_rating public.meal_rating;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.households as household
    where household.id = p_household_id
      and household.owner_user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'MEAL_RATING_HOUSEHOLD_FORBIDDEN';
  end if;

  if not exists (
    select 1 from public.meal_options as option where option.id = p_meal_option_id
  ) then
    raise exception using errcode = '23503', message = 'MEAL_RATING_OPTION_UNKNOWN';
  end if;

  if p_rating is null then
    delete from public.meal_option_ratings
    where household_id = p_household_id
      and meal_option_id = p_meal_option_id;
    return jsonb_build_object(
      'householdId', p_household_id,
      'mealOptionId', p_meal_option_id,
      'rating', null
    );
  end if;

  -- Ép kiểu tường minh để một chuỗi lạ thành lỗi 22P02 ngay tại đây, thay vì lặng lẽ thành 'liked'.
  if p_rating not in ('liked', 'disliked') then
    raise exception using errcode = '22023', message = 'MEAL_RATING_INVALID';
  end if;
  v_rating := p_rating::public.meal_rating;

  insert into public.meal_option_ratings (household_id, meal_option_id, rating)
  values (p_household_id, p_meal_option_id, v_rating)
  on conflict (household_id, meal_option_id)
  do update set rating = excluded.rating, updated_at = now();

  return jsonb_build_object(
    'householdId', p_household_id,
    'mealOptionId', p_meal_option_id,
    'rating', v_rating
  );
end;
$$;

revoke all on function public.set_meal_option_rating(uuid, uuid, text) from public, anon;
grant execute on function public.set_meal_option_rating(uuid, uuid, text) to authenticated;

-- Khẩu vị của hộ, gom theo hai nhóm mà planner cần.
--
-- `security invoker` nên RLS vẫn quyết định ai thấy gì: người không phải chủ hộ nhận về hai mảng
-- rỗng, giống hệt một hộ chưa đánh giá món nào.
create function public.get_meal_option_ratings(p_household_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'liked', coalesce(
      (
        select jsonb_agg(rating.meal_option_id order by rating.meal_option_id)
        from public.meal_option_ratings as rating
        where rating.household_id = p_household_id and rating.rating = 'liked'
      ),
      '[]'::jsonb
    ),
    'disliked', coalesce(
      (
        select jsonb_agg(rating.meal_option_id order by rating.meal_option_id)
        from public.meal_option_ratings as rating
        where rating.household_id = p_household_id and rating.rating = 'disliked'
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.get_meal_option_ratings(uuid) from public, anon;
grant execute on function public.get_meal_option_ratings(uuid) to authenticated;

-- Nới ba guard engine version. Cùng cách vá theo văn bản: không tìm thấy đúng đoạn cần thay là lỗi
-- dừng hẳn, chứ không phải im lặng bỏ qua rồi để production tự phát hiện.
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
    $old$not in ('planner-engine-v2', 'planner-engine-v3', 'planner-engine-v4')$old$,
    $new$not in ('planner-engine-v2', 'planner-engine-v3', 'planner-engine-v4', 'planner-engine-v5')$new$
  );
  if v_patched = v_definition then
    raise exception using
      errcode = '55000',
      message = 'MEAL_RATING_EXPECTED_SHOPPING_REVISION_GUARD_NOT_FOUND';
  end if;
  execute v_patched;

  v_definition := pg_get_functiondef(
    'private.assert_plan_summary_row(uuid)'::regprocedure
  );
  v_patched := replace(
    v_definition,
    $old$in ('planner-engine-v2', 'planner-engine-v3', 'planner-engine-v4') then$old$,
    $new$in ('planner-engine-v2', 'planner-engine-v3', 'planner-engine-v4', 'planner-engine-v5') then$new$
  );
  if v_patched = v_definition then
    raise exception using
      errcode = '55000',
      message = 'MEAL_RATING_EXPECTED_PLAN_SUMMARY_ENGINE_GUARD_NOT_FOUND';
  end if;
  execute v_patched;

  v_definition := pg_get_functiondef(
    'public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)'::regprocedure
  );
  v_patched := replace(
    v_definition,
    $old$not in ('planner-engine-v2', 'planner-engine-v3', 'planner-engine-v4')$old$,
    $new$not in ('planner-engine-v2', 'planner-engine-v3', 'planner-engine-v4', 'planner-engine-v5')$new$
  );
  if v_patched = v_definition then
    raise exception using
      errcode = '55000',
      message = 'MEAL_RATING_EXPECTED_PLAN_PERSISTENCE_ENGINE_GUARD_NOT_FOUND';
  end if;
  execute v_patched;
end;
$$;
