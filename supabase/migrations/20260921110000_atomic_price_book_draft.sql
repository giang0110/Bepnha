-- Make price-book draft replacement atomic.
-- Synced after P10.1 security hardening merged into main.
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


-- Meal-option drafts have the same parent/children atomicity requirement as price books.
create function public.save_meal_option_version_draft_atomic(
  p_meal_option_version_id uuid,
  p_meal_option_id uuid,
  p_expected_revision integer,
  p_version_number integer,
  p_yield_adult_equivalent numeric,
  p_active_minutes smallint,
  p_elapsed_minutes smallint,
  p_components jsonb,
  p_tag_ids uuid[],
  p_actor_user_id uuid
)
returns public.meal_option_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.meal_option_versions;
begin
  perform private.assert_catalog_admin(p_actor_user_id);

  if jsonb_typeof(p_components) <> 'array' or jsonb_array_length(p_components) = 0 then
    raise exception using errcode = '22023', message = 'MEAL_OPTION_COMPONENTS_REQUIRED';
  end if;

  select * into v_version
  from public.meal_option_versions
  where id = p_meal_option_version_id
  for update;

  if not found then
    if p_expected_revision <> 1 then
      raise exception using errcode = 'P0001', message = 'STALE_CATALOG_REVISION';
    end if;

    insert into public.meal_option_versions (
      id,
      meal_option_id,
      version_number,
      yield_adult_equivalent,
      active_minutes,
      elapsed_minutes,
      created_by
    ) values (
      p_meal_option_version_id,
      p_meal_option_id,
      p_version_number,
      p_yield_adult_equivalent,
      p_active_minutes,
      p_elapsed_minutes,
      p_actor_user_id
    )
    returning * into v_version;
  else
    update public.meal_option_versions
    set
      yield_adult_equivalent = p_yield_adult_equivalent,
      active_minutes = p_active_minutes,
      elapsed_minutes = p_elapsed_minutes
    where id = p_meal_option_version_id
      and meal_option_id = p_meal_option_id
      and version_number = p_version_number
      and revision = p_expected_revision
      and publication_status = 'draft'
    returning * into v_version;

    if not found then
      raise exception using errcode = 'P0001', message = 'STALE_CATALOG_REVISION';
    end if;
  end if;

  delete from public.meal_option_recipes
  where meal_option_version_id = p_meal_option_version_id;

  delete from public.meal_option_version_tags
  where meal_option_version_id = p_meal_option_version_id;

  insert into public.meal_option_recipes (
    meal_option_version_id,
    recipe_id,
    recipe_version_id,
    quantity_multiplier,
    meal_role,
    sort_order
  )
  select
    p_meal_option_version_id,
    component.recipe_id,
    component.recipe_version_id,
    component.quantity_multiplier,
    component.meal_role::public.meal_option_role,
    component.sort_order
  from jsonb_to_recordset(p_components) as component(
    recipe_id uuid,
    recipe_version_id uuid,
    quantity_multiplier numeric,
    meal_role text,
    sort_order smallint
  );

  insert into public.meal_option_version_tags (
    meal_option_version_id,
    recipe_tag_id
  )
  select p_meal_option_version_id, tag_id
  from unnest(coalesce(p_tag_ids, array[]::uuid[])) as tag_id;

  return v_version;
end;
$$;

revoke all on function public.save_meal_option_version_draft_atomic(
  uuid, uuid, integer, integer, numeric, smallint, smallint, jsonb, uuid[], uuid
) from public, anon, authenticated;

grant execute on function public.save_meal_option_version_draft_atomic(
  uuid, uuid, integer, integer, numeric, smallint, smallint, jsonb, uuid[], uuid
) to service_role;
