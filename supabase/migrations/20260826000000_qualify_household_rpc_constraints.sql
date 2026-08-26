create or replace function public.save_household_setup(
  p_expected_version integer,
  p_weekly_plan_budget_vnd bigint,
  p_max_elapsed_minutes smallint,
  p_member_groups jsonb,
  p_rule_codes text[]
)
returns public.households
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_household public.households;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;

  if jsonb_typeof(p_member_groups) <> 'array' or p_rule_codes is null then
    raise exception using errcode = '22023', message = 'INVALID_HOUSEHOLD_SETUP_SHAPE';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_member_groups) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or not (item.value ?& array['memberKind', 'ageBand', 'memberCount'])
      or (select count(*) from jsonb_object_keys(item.value)) <> 3
      or jsonb_typeof(item.value -> 'memberKind') <> 'string'
      or jsonb_typeof(item.value -> 'ageBand') <> 'string'
      or jsonb_typeof(item.value -> 'memberCount') <> 'number'
      or item.value ->> 'memberCount' !~ '^[0-9]+$'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_MEMBER_GROUP_SHAPE';
  end if;

  if cardinality(p_rule_codes) <> (
    select count(distinct rule_code)
    from unnest(p_rule_codes) as selected(rule_code)
  ) then
    raise exception using errcode = '22023', message = 'DUPLICATE_RULE_CODE';
  end if;

  if exists (
    select 1
    from unnest(p_rule_codes) as selected(rule_code)
    left join public.household_rule_options as option
      on option.code = selected.rule_code
    where option.code is null
  ) then
    raise exception using errcode = '23503', message = 'UNKNOWN_HOUSEHOLD_RULE_CODE';
  end if;

  select household.*
  into v_household
  from public.households as household
  where household.owner_user_id = v_user_id
  for update;

  if found then
    if p_expected_version is null or v_household.version <> p_expected_version then
      raise exception using errcode = 'P0001', message = 'STALE_HOUSEHOLD_VERSION';
    end if;
  else
    if p_expected_version is not null then
      raise exception using errcode = 'P0001', message = 'STALE_HOUSEHOLD_VERSION';
    end if;

    insert into public.households (
      owner_user_id,
      weekly_plan_budget_vnd,
      max_elapsed_minutes
    ) values (
      v_user_id,
      p_weekly_plan_budget_vnd,
      p_max_elapsed_minutes
    )
    returning * into v_household;
  end if;

  set constraints
    public.households_require_valid_members,
    public.household_member_groups_require_valid_household
  deferred;

  delete from public.household_member_groups
  where household_id = v_household.id;

  insert into public.household_member_groups (
    household_id,
    member_kind,
    age_band,
    member_count
  )
  select
    v_household.id,
    (item.value ->> 'memberKind')::public.household_member_kind,
    (item.value ->> 'ageBand')::public.household_age_band,
    (item.value ->> 'memberCount')::smallint
  from jsonb_array_elements(p_member_groups) as item(value);

  delete from public.household_food_rules
  where household_id = v_household.id;

  insert into public.household_food_rules (household_id, rule_code)
  select v_household.id, selected.rule_code
  from unnest(p_rule_codes) as selected(rule_code);

  update public.households
  set
    weekly_plan_budget_vnd = p_weekly_plan_budget_vnd,
    max_elapsed_minutes = p_max_elapsed_minutes,
    onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where id = v_household.id
  returning * into v_household;

  set constraints
    public.households_require_valid_members,
    public.household_member_groups_require_valid_household
  immediate;

  return v_household;
end;
$$;

revoke all on function public.save_household_setup(integer, bigint, smallint, jsonb, text[])
from public, anon;
grant execute on function public.save_household_setup(integer, bigint, smallint, jsonb, text[])
to authenticated;
