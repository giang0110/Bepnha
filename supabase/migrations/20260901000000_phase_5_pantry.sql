-- Phase 5 changes the authoritative planner semantics by binding an explicit pantry snapshot.
-- Phase 4 shopping persistence intentionally pinned planner-engine-v2, so extend only those
-- existing guards to the known Phase 5 engine while preserving exact engine/snapshot matching.
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
    $old$if v_revision.engine_version <> 'planner-engine-v2'
    or v_revision.input_snapshot ->> 'engineVersion' <> 'planner-engine-v2' then$old$,
    $new$if v_revision.engine_version not in ('planner-engine-v2', 'planner-engine-v3')
    or v_revision.input_snapshot ->> 'engineVersion' is distinct from v_revision.engine_version then$new$
  );
  if v_patched = v_definition then
    raise exception using
      errcode = '55000',
      message = 'PHASE5_EXPECTED_SHOPPING_REVISION_GUARD_NOT_FOUND';
  end if;
  execute v_patched;

  v_definition := pg_get_functiondef(
    'private.assert_plan_summary_row(uuid)'::regprocedure
  );
  v_patched := replace(
    v_definition,
    $old$if v_revision.engine_version = 'planner-engine-v2' then$old$,
    $new$if v_revision.engine_version in ('planner-engine-v2', 'planner-engine-v3') then$new$
  );
  if v_patched = v_definition then
    raise exception using
      errcode = '55000',
      message = 'PHASE5_EXPECTED_PLAN_SUMMARY_ENGINE_GUARD_NOT_FOUND';
  end if;
  execute v_patched;

  v_definition := pg_get_functiondef(
    'public.persist_meal_plan_revision(uuid,uuid,date,integer,uuid,uuid,jsonb,jsonb)'::regprocedure
  );
  v_patched := replace(
    v_definition,
    $old$or p_revision ->> 'engineVersion' <> 'planner-engine-v2'
    or p_revision #>> '{inputSnapshot,engineVersion}' <> 'planner-engine-v2'
    or p_revision ->> 'engineVersion' is distinct from p_revision #>> '{inputSnapshot,engineVersion}'$old$,
    $new$or p_revision ->> 'engineVersion' not in ('planner-engine-v2', 'planner-engine-v3')
    or p_revision ->> 'engineVersion' is distinct from p_revision #>> '{inputSnapshot,engineVersion}'$new$
  );
  if v_patched = v_definition then
    raise exception using
      errcode = '55000',
      message = 'PHASE5_EXPECTED_PLAN_PERSISTENCE_ENGINE_GUARD_NOT_FOUND';
  end if;
  execute v_patched;
end;
$$;

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  food_id uuid not null,
  food_fact_version_id uuid not null,
  quantity numeric(18, 6) not null check (quantity >= 0),
  unit_id uuid not null,
  base_quantity numeric(30, 12) not null check (base_quantity >= 0),
  base_unit_id uuid not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, food_id),
  constraint pantry_items_food_fact_fkey
    foreign key (food_id, food_fact_version_id)
    references public.food_fact_versions (food_id, id) on delete restrict,
  constraint pantry_items_food_base_unit_fkey
    foreign key (food_id, base_unit_id)
    references public.foods (id, base_unit_id) on delete restrict,
  constraint pantry_items_fact_unit_conversion_fkey
    foreign key (food_fact_version_id, unit_id)
    references public.food_fact_unit_conversions (food_fact_version_id, unit_id) on delete restrict
);

create index pantry_items_household_id_idx
on public.pantry_items (household_id);

create function private.prepare_pantry_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_unit_id uuid;
  v_base_quantity_per_unit numeric(18, 6);
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.household_id is distinct from old.household_id
    or new.food_id is distinct from old.food_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'PANTRY_ITEM_IDENTITY_IMMUTABLE';
  end if;

  select
    food.base_unit_id,
    conversion.base_quantity_per_unit
  into v_base_unit_id, v_base_quantity_per_unit
  from public.foods as food
  join public.food_fact_versions as fact
    on fact.food_id = food.id
   and fact.id = new.food_fact_version_id
  join public.food_fact_unit_conversions as conversion
    on conversion.food_fact_version_id = fact.id
   and conversion.unit_id = new.unit_id
  where food.id = new.food_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'PANTRY_LINEAGE_OR_CONVERSION_UNAVAILABLE';
  end if;

  new.base_unit_id := v_base_unit_id;
  new.base_quantity := (new.quantity * v_base_quantity_per_unit)::numeric(30, 12);

  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := now();
    new.updated_at := new.created_at;
  else
    new.version := old.version + 1;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_pantry_item()
from public, anon, authenticated;

create trigger pantry_items_prepare_row
before insert or update on public.pantry_items
for each row execute function private.prepare_pantry_item();

alter table public.pantry_items enable row level security;

revoke all on table public.pantry_items from public, anon, authenticated;
grant select on table public.pantry_items to authenticated;

create policy pantry_items_select_own
on public.pantry_items
for select
to authenticated
using (
  exists (
    select 1
    from public.households as household
    where household.id = pantry_items.household_id
      and household.owner_user_id = (select auth.uid())
  )
);

create function public.get_pantry(p_household_id uuid)
returns setof public.pantry_items
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;

  if not exists (
    select 1
    from public.households as household
    where household.id = p_household_id
      and household.owner_user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'PANTRY_HOUSEHOLD_FORBIDDEN';
  end if;

  return query
  select item.*
  from public.pantry_items as item
  where item.household_id = p_household_id
  order by item.food_id, item.id;
end;
$$;

revoke all on function public.get_pantry(uuid)
from public, anon, authenticated;
grant execute on function public.get_pantry(uuid) to authenticated;

create function public.upsert_pantry_item(
  p_household_id uuid,
  p_food_id uuid,
  p_food_fact_version_id uuid,
  p_unit_id uuid,
  p_quantity numeric,
  p_expected_version integer
)
returns public.pantry_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_existing public.pantry_items;
  v_result public.pantry_items;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;

  if p_household_id is null
    or p_food_id is null
    or p_food_fact_version_id is null
    or p_unit_id is null then
    raise exception using errcode = '22023', message = 'INVALID_PANTRY_ITEM_INPUT';
  end if;

  if p_quantity is null
    or p_quantity < 0
    or p_quantity <> round(p_quantity, 6) then
    raise exception using errcode = '22023', message = 'INVALID_PANTRY_QUANTITY';
  end if;

  if p_expected_version is null or p_expected_version < 0 then
    raise exception using errcode = 'P0001', message = 'STALE_PANTRY_VERSION';
  end if;

  select household.id
  into v_household_id
  from public.households as household
  where household.id = p_household_id
    and household.owner_user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'PANTRY_HOUSEHOLD_FORBIDDEN';
  end if;

  select item.*
  into v_existing
  from public.pantry_items as item
  where item.household_id = v_household_id
    and item.food_id = p_food_id
  for update;

  if found then
    if p_expected_version <> v_existing.version then
      raise exception using errcode = 'P0001', message = 'STALE_PANTRY_VERSION';
    end if;

    update public.pantry_items
    set
      food_fact_version_id = p_food_fact_version_id,
      unit_id = p_unit_id,
      quantity = p_quantity
    where id = v_existing.id
    returning * into v_result;
  else
    if p_expected_version <> 0 then
      raise exception using errcode = 'P0001', message = 'STALE_PANTRY_VERSION';
    end if;

    insert into public.pantry_items (
      household_id,
      food_id,
      food_fact_version_id,
      quantity,
      unit_id,
      base_quantity,
      base_unit_id
    ) values (
      v_household_id,
      p_food_id,
      p_food_fact_version_id,
      p_quantity,
      p_unit_id,
      0,
      (select food.base_unit_id from public.foods as food where food.id = p_food_id)
    )
    returning * into v_result;
  end if;

  return v_result;
end;
$$;

revoke all on function public.upsert_pantry_item(uuid, uuid, uuid, uuid, numeric, integer)
from public, anon, authenticated;
grant execute on function public.upsert_pantry_item(uuid, uuid, uuid, uuid, numeric, integer)
to authenticated;

create function public.delete_pantry_item(
  p_pantry_item_id uuid,
  p_expected_version integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item_id uuid;
  v_version integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;

  if p_pantry_item_id is null then
    raise exception using errcode = '42501', message = 'PANTRY_ITEM_FORBIDDEN';
  end if;

  select item.id, item.version
  into v_item_id, v_version
  from public.pantry_items as item
  join public.households as household
    on household.id = item.household_id
  where item.id = p_pantry_item_id
    and household.owner_user_id = v_user_id
  for update of item;

  if not found then
    raise exception using errcode = '42501', message = 'PANTRY_ITEM_FORBIDDEN';
  end if;

  if p_expected_version is null or p_expected_version <> v_version then
    raise exception using errcode = 'P0001', message = 'STALE_PANTRY_VERSION';
  end if;

  delete from public.pantry_items
  where id = v_item_id;

  return v_item_id;
end;
$$;

revoke all on function public.delete_pantry_item(uuid, integer)
from public, anon, authenticated;
grant execute on function public.delete_pantry_item(uuid, integer) to authenticated;
