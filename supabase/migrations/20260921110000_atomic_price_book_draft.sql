-- Make price-book draft replacement atomic.
--
-- The previous repository implementation updated the price-book parent, deleted old rows, then
-- inserted replacement prices through separate PostgREST requests. A rejected price row could
-- therefore leave the parent revision advanced while no prices existed. Keep the entire draft
-- replacement in one PostgreSQL transaction instead.

create function public.save_price_book_draft_atomic(
  p_price_book_id uuid,
  p_expected_revision integer,
  p_effective_from date,
  p_effective_to date,
  p_prices jsonb,
  p_actor_user_id uuid
)
returns public.price_books
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.price_books;
begin
  perform private.assert_catalog_admin(p_actor_user_id);

  if jsonb_typeof(p_prices) <> 'array' or jsonb_array_length(p_prices) = 0 then
    raise exception using errcode = '22023', message = 'PRICE_ROWS_REQUIRED';
  end if;

  update public.price_books
  set
    effective_from = p_effective_from,
    effective_to = p_effective_to
  where id = p_price_book_id
    and revision = p_expected_revision
    and publication_status = 'draft'
  returning * into v_book;

  if not found then
    raise exception using errcode = 'P0001', message = 'STALE_CATALOG_REVISION';
  end if;

  delete from public.food_prices
  where price_book_id = p_price_book_id;

  insert into public.food_prices (
    price_book_id,
    food_id,
    food_fact_version_id,
    package_quantity,
    package_unit_id,
    package_base_quantity,
    base_unit_id,
    package_price_vnd,
    purchase_increment,
    observed_at,
    source_reference
  )
  select
    p_price_book_id,
    price.food_id,
    price.food_fact_version_id,
    price.package_quantity,
    price.package_unit_id,
    price.package_base_quantity,
    price.base_unit_id,
    price.package_price_vnd,
    price.purchase_increment,
    price.observed_at,
    price.source_reference
  from jsonb_to_recordset(p_prices) as price(
    food_id uuid,
    food_fact_version_id uuid,
    package_quantity numeric,
    package_unit_id uuid,
    package_base_quantity numeric,
    base_unit_id uuid,
    package_price_vnd bigint,
    purchase_increment numeric,
    observed_at date,
    source_reference text
  );

  return v_book;
end;
$$;

revoke all on function public.save_price_book_draft_atomic(
  uuid, integer, date, date, jsonb, uuid
) from public, anon, authenticated;

grant execute on function public.save_price_book_draft_atomic(
  uuid, integer, date, date, jsonb, uuid
) to service_role;
