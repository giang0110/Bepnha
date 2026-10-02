-- Private adult profiles belong to stable household identities, never replaceable group rows.
alter table public.households
  add column nutrition_setup_version text check (nutrition_setup_version = 'household-nutrition-v1'),
  add column planned_meal_share_percent integer not null default 33 check (planned_meal_share_percent between 20 and 50);

create table public.household_member_profiles (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  member_kind text not null check (member_kind in ('adult','elderly')),
  sort_order integer not null check (sort_order > 0),
  label text check (char_length(label) between 1 and 40 and label = btrim(label)),
  height_cm numeric(5,2) check (height_cm between 100 and 250),
  weight_kg numeric(5,2) check (weight_kg between 25 and 350),
  age_years integer check (age_years between 18 and 100),
  sex_for_equation text check (sex_for_equation in ('male','female')),
  activity_level text check (activity_level in ('sedentary','light','moderate','active','very_active')),
  goal text not null default 'maintain' check (goal in ('maintain','gain','lose')),
  constraint household_member_profiles_order_key unique(household_id,member_kind,sort_order) deferrable initially deferred
);
alter table public.household_member_profiles enable row level security;
revoke all on public.household_member_profiles from anon, authenticated;
grant select on public.household_member_profiles to authenticated;
create policy household_member_profiles_select_own on public.household_member_profiles for select to authenticated
using (exists (select 1 from public.households h where h.id = household_id and h.owner_user_id = (select auth.uid())));

-- Existing table grants stay compatible, but new settings cannot bypass the versioned transaction.
create function private.guard_direct_household_nutrition_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated','anon') and
    ((tg_op = 'INSERT' and (new.nutrition_setup_version is not null or new.planned_meal_share_percent <> 33))
     or (tg_op = 'UPDATE' and (new.nutrition_setup_version is distinct from old.nutrition_setup_version
       or new.planned_meal_share_percent is distinct from old.planned_meal_share_percent))) then
    raise exception using errcode = '42501', message = 'NUTRITION_SETUP_REQUIRES_V2';
  end if;
  return new;
end $$;
revoke all on function private.guard_direct_household_nutrition_write() from public, anon, authenticated;
create trigger households_guard_nutrition_write before insert or update on public.households
for each row execute function private.guard_direct_household_nutrition_write();

create function private.assert_household_profile_counts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_household_id uuid;
  v_kind text;
begin
  if tg_table_name = 'households' then
    v_household_id := new.id;
  elsif tg_op = 'DELETE' then
    v_household_id := old.household_id;
  else
    v_household_id := new.household_id;
  end if;
  if not exists (select 1 from public.households where id = v_household_id and nutrition_setup_version is not null) then return null; end if;
  foreach v_kind in array array['adult','elderly'] loop
    if (select count(*) from public.household_member_profiles where household_id = v_household_id and member_kind = v_kind)
      <> (select coalesce(sum(member_count),0) from public.household_member_groups where household_id = v_household_id and member_kind::text = v_kind) then
      raise exception using errcode = '23514', message = 'MEMBER_PROFILE_COUNT_MISMATCH';
    end if;
  end loop;
  return null;
end $$;
revoke all on function private.assert_household_profile_counts() from public, anon, authenticated;
create constraint trigger households_require_valid_profiles after insert or update on public.households
 deferrable initially deferred for each row execute function private.assert_household_profile_counts();
create constraint trigger household_groups_require_valid_profiles after insert or update or delete on public.household_member_groups
 deferrable initially deferred for each row execute function private.assert_household_profile_counts();
create constraint trigger household_profiles_require_valid_profiles after insert or update or delete on public.household_member_profiles
 deferrable initially deferred for each row execute function private.assert_household_profile_counts();

create function private.validate_household_member_profiles(p_profiles jsonb, p_groups jsonb, p_household_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_profile jsonb; v_field text; v_kind text; v_text text;
begin
  if p_profiles is null or jsonb_typeof(p_profiles) <> 'array' or jsonb_array_length(p_profiles) > 20 then
    raise exception using errcode = '22023', message = 'INVALID_MEMBER_PROFILES';
  end if;
  for v_profile in select value from jsonb_array_elements(p_profiles) loop
    if jsonb_typeof(v_profile) <> 'object' or not (v_profile ?& array['id','memberKind','sortOrder','label','heightCm','weightKg','ageYears','sexForEquation','activityLevel','goal'])
      or (select count(*) from jsonb_object_keys(v_profile)) <> 10
      or jsonb_typeof(v_profile->'id') <> 'string'
      or v_profile->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(v_profile->'memberKind') <> 'string' or v_profile->>'memberKind' not in ('adult','elderly')
      or jsonb_typeof(v_profile->'sortOrder') <> 'number' or v_profile->>'sortOrder' !~ '^[1-9][0-9]{0,9}$'
      or jsonb_typeof(v_profile->'goal') <> 'string' or v_profile->>'goal' not in ('maintain','gain','lose') then
      raise exception using errcode = '22023', message = 'INVALID_MEMBER_PROFILES';
    end if;
    if (v_profile->>'sortOrder')::bigint > 2147483647 then raise exception using errcode = '22023', message = 'INVALID_MEMBER_PROFILES'; end if;
    if jsonb_typeof(v_profile->'label') not in ('null','string') or char_length(btrim(v_profile->>'label')) > 40 then
      raise exception using errcode = '22023', message = 'INVALID_MEMBER_PROFILES';
    end if;
    foreach v_field in array array['heightCm','weightKg'] loop
      if jsonb_typeof(v_profile->v_field) <> 'null' then
        v_text := v_profile->>v_field;
        if jsonb_typeof(v_profile->v_field) <> 'string' or v_text !~ '^[1-9][0-9]{0,2}(\.[0-9]{1,2})?$' then
          raise exception using errcode = '22023', message = 'INVALID_MEMBER_PROFILES';
        end if;
        if (v_field = 'heightCm' and v_text::numeric not between 100 and 250) or (v_field = 'weightKg' and v_text::numeric not between 25 and 350) then
          raise exception using errcode = '22023', message = 'INVALID_MEMBER_PROFILES';
        end if;
      end if;
    end loop;
    if jsonb_typeof(v_profile->'ageYears') <> 'null' and
      (jsonb_typeof(v_profile->'ageYears') <> 'number' or v_profile->>'ageYears' !~ '^(1[89]|[2-9][0-9]|100)$') then
      raise exception using errcode = '22023', message = 'INVALID_MEMBER_PROFILES';
    end if;
    if (jsonb_typeof(v_profile->'sexForEquation') not in ('null','string')) or
      (v_profile->>'sexForEquation' is not null and v_profile->>'sexForEquation' not in ('male','female')) or
      (jsonb_typeof(v_profile->'activityLevel') not in ('null','string')) or
      (v_profile->>'activityLevel' is not null and v_profile->>'activityLevel' not in ('sedentary','light','moderate','active','very_active')) then
      raise exception using errcode = '22023', message = 'INVALID_MEMBER_PROFILES';
    end if;
    if exists (select 1 from public.household_member_profiles where id = (v_profile->>'id')::uuid and household_id is distinct from p_household_id) then
      raise exception using errcode = '42501', message = 'FOREIGN_MEMBER_PROFILE_ID';
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_profiles) e group by lower(e->>'id') having count(*) > 1)
    or exists (select 1 from jsonb_array_elements(p_profiles) e group by e->>'memberKind',e->>'sortOrder' having count(*) > 1) then
    raise exception using errcode = '22023', message = 'INVALID_MEMBER_PROFILES';
  end if;
  foreach v_kind in array array['adult','elderly'] loop
    if (select count(*) from jsonb_array_elements(p_profiles) e where e->>'memberKind' = v_kind)
      <> (select coalesce(sum((e->>'memberCount')::integer),0) from jsonb_array_elements(p_groups) e where e->>'memberKind' = v_kind) then
      raise exception using errcode = '22023', message = 'MEMBER_PROFILE_COUNT_MISMATCH';
    end if;
  end loop;
end $$;
revoke all on function private.validate_household_member_profiles(jsonb,jsonb,uuid) from public, anon, authenticated;

create function public.get_household_setup_v2() returns jsonb language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object(
  'id',h.id,'weekly_plan_budget_vnd',h.weekly_plan_budget_vnd,'max_elapsed_minutes',h.max_elapsed_minutes,
  'onboarding_completed_at',h.onboarding_completed_at,'version',h.version,
  'household_member_groups',coalesce((select jsonb_agg(jsonb_build_object('member_kind',g.member_kind,'age_band',g.age_band,'member_count',g.member_count) order by g.age_band) from public.household_member_groups g where g.household_id=h.id),'[]'),
  'household_food_rules',coalesce((select jsonb_agg(jsonb_build_object('rule_code',r.rule_code,'allergen_strictness',r.allergen_strictness,'household_rule_options',jsonb_build_object('code',r.rule_code)) order by r.rule_code) from public.household_food_rules r where r.household_id=h.id),'[]')
 ) || case when h.nutrition_setup_version is null then '{}'::jsonb else jsonb_build_object('nutritionSetup',jsonb_build_object(
  'version',h.nutrition_setup_version,'plannedMealSharePercent',h.planned_meal_share_percent,
  'memberProfiles',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'memberKind',p.member_kind,'sortOrder',p.sort_order,'label',p.label,
   'heightCm',trim_scale(p.height_cm)::text,'weightKg',trim_scale(p.weight_kg)::text,'ageYears',p.age_years,'sexForEquation',p.sex_for_equation,'activityLevel',p.activity_level,'goal',p.goal)
   order by p.member_kind,p.sort_order) from public.household_member_profiles p where p.household_id=h.id),'[]')
 )) end
 from public.households h where h.owner_user_id=(select auth.uid()) and h.onboarding_completed_at is not null
$$;
revoke all on function public.get_household_setup_v2() from public,anon;
grant execute on function public.get_household_setup_v2() to authenticated;

-- Old callers remain valid only for households without v2 settings.
create or replace function public.save_household_setup(
  p_expected_version integer,
  p_weekly_plan_budget_vnd bigint,
  p_max_elapsed_minutes smallint,
  p_member_groups jsonb,
  p_rule_codes text[],
  p_allergen_strictness jsonb default '{}'::jsonb
)
returns public.households
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_household public.households;
  v_is_new boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;

  if jsonb_typeof(p_member_groups) <> 'array' or p_rule_codes is null then
    raise exception using errcode = '22023', message = 'INVALID_HOUSEHOLD_SETUP_SHAPE';
  end if;

  if p_allergen_strictness is null or jsonb_typeof(p_allergen_strictness) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_HOUSEHOLD_SETUP_SHAPE';
  end if;

  -- A strictness entry is meaningful only for an allergy rule the household actually selected, and
  -- only in the two values the type allows. Ignoring anything else would let a typo read as the
  -- permissive choice.
  if exists (
    select 1
    from jsonb_each_text(p_allergen_strictness) as entry(rule_code, strictness)
    where entry.strictness not in ('strict', 'ingredient_only')
      or not (entry.rule_code = any (p_rule_codes))
      or entry.rule_code not like 'allergen\_%'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_ALLERGEN_STRICTNESS';
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

  set constraints
    public.households_require_valid_members,
    public.household_member_groups_require_valid_household
  deferred;

  select household.*
  into v_household
  from public.households as household
  where household.owner_user_id = v_user_id
  for update;

  if found then
    if v_household.nutrition_setup_version is not null then
      raise exception using errcode = '23514', message = 'NUTRITION_SETUP_REQUIRES_V2';
    end if;
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
      max_elapsed_minutes,
      onboarding_completed_at
    ) values (
      v_user_id,
      p_weekly_plan_budget_vnd,
      p_max_elapsed_minutes,
      now()
    )
    returning * into v_household;
    v_is_new := true;
  end if;

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

  insert into public.household_food_rules (household_id, rule_code, allergen_strictness)
  select
    v_household.id,
    selected.rule_code,
    coalesce(
      (p_allergen_strictness ->> selected.rule_code)::public.household_allergen_strictness,
      'strict'
    )
  from unnest(p_rule_codes) as selected(rule_code);

  if not v_is_new then
    update public.households
    set
      weekly_plan_budget_vnd = p_weekly_plan_budget_vnd,
      max_elapsed_minutes = p_max_elapsed_minutes,
      onboarding_completed_at = coalesce(onboarding_completed_at, now())
    where id = v_household.id
    returning * into v_household;
  end if;

  set constraints
    public.households_require_valid_members,
    public.household_member_groups_require_valid_household
  immediate;

  return v_household;
end;
$$;

revoke all on function public.save_household_setup(
  integer, bigint, smallint, jsonb, text[], jsonb
) from public, anon;

grant execute on function public.save_household_setup(
  integer, bigint, smallint, jsonb, text[], jsonb
) to authenticated;


create function public.save_household_setup_v2(
  p_expected_version integer,
  p_weekly_plan_budget_vnd bigint,
  p_max_elapsed_minutes integer,
  p_member_groups jsonb,
  p_rule_codes text[],
  p_allergen_strictness jsonb,
  p_member_profiles jsonb,
  p_planned_meal_share_percent integer
)
returns public.households
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_household public.households;
  v_is_new boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;

  if p_planned_meal_share_percent is null or p_planned_meal_share_percent not between 20 and 50 then
    raise exception using errcode = '22023', message = 'INVALID_MEAL_SHARE';
  end if;

  if jsonb_typeof(p_member_groups) <> 'array' or p_rule_codes is null then
    raise exception using errcode = '22023', message = 'INVALID_HOUSEHOLD_SETUP_SHAPE';
  end if;

  if p_allergen_strictness is null or jsonb_typeof(p_allergen_strictness) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_HOUSEHOLD_SETUP_SHAPE';
  end if;

  -- A strictness entry is meaningful only for an allergy rule the household actually selected, and
  -- only in the two values the type allows. Ignoring anything else would let a typo read as the
  -- permissive choice.
  if exists (
    select 1
    from jsonb_each_text(p_allergen_strictness) as entry(rule_code, strictness)
    where entry.strictness not in ('strict', 'ingredient_only')
      or not (entry.rule_code = any (p_rule_codes))
      or entry.rule_code not like 'allergen\_%'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_ALLERGEN_STRICTNESS';
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

  set constraints
    public.households_require_valid_members,
    public.household_member_groups_require_valid_household,
    public.households_require_valid_profiles,
    public.household_groups_require_valid_profiles,
    public.household_profiles_require_valid_profiles,
    public.household_member_profiles_order_key
  deferred;

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
      max_elapsed_minutes,
      onboarding_completed_at,
      nutrition_setup_version,
      planned_meal_share_percent
    ) values (
      v_user_id,
      p_weekly_plan_budget_vnd,
      p_max_elapsed_minutes,
      now(),
      'household-nutrition-v1',
      p_planned_meal_share_percent
    )
    returning * into v_household;
    v_is_new := true;
  end if;

  perform private.validate_household_member_profiles(p_member_profiles, p_member_groups, v_household.id);

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

  insert into public.household_food_rules (household_id, rule_code, allergen_strictness)
  select
    v_household.id,
    selected.rule_code,
    coalesce(
      (p_allergen_strictness ->> selected.rule_code)::public.household_allergen_strictness,
      'strict'
    )
  from unnest(p_rule_codes) as selected(rule_code);

  delete from public.household_member_profiles p where p.household_id = v_household.id
    and not exists (select 1 from jsonb_array_elements(p_member_profiles) e where (e->>'id')::uuid = p.id);
  insert into public.household_member_profiles (id,household_id,member_kind,sort_order,label,height_cm,weight_kg,age_years,sex_for_equation,activity_level,goal)
  select (e->>'id')::uuid,v_household.id,e->>'memberKind',(e->>'sortOrder')::integer,nullif(btrim(e->>'label'),''),
    (e->>'heightCm')::numeric,(e->>'weightKg')::numeric,(e->>'ageYears')::integer,e->>'sexForEquation',e->>'activityLevel',e->>'goal'
  from jsonb_array_elements(p_member_profiles) e
  on conflict(id) do update set member_kind=excluded.member_kind,sort_order=excluded.sort_order,label=excluded.label,
    height_cm=excluded.height_cm,weight_kg=excluded.weight_kg,age_years=excluded.age_years,
    sex_for_equation=excluded.sex_for_equation,activity_level=excluded.activity_level,goal=excluded.goal
    where public.household_member_profiles.household_id = excluded.household_id;

  if not v_is_new then
    update public.households
    set
      nutrition_setup_version = 'household-nutrition-v1',
      planned_meal_share_percent = p_planned_meal_share_percent,
      weekly_plan_budget_vnd = p_weekly_plan_budget_vnd,
      max_elapsed_minutes = p_max_elapsed_minutes,
      onboarding_completed_at = coalesce(onboarding_completed_at, now())
    where id = v_household.id
    returning * into v_household;
  end if;

  set constraints
    public.households_require_valid_members,
    public.household_member_groups_require_valid_household,
    public.households_require_valid_profiles,
    public.household_groups_require_valid_profiles,
    public.household_profiles_require_valid_profiles,
    public.household_member_profiles_order_key
  immediate;

  return v_household;
end;
$$;

revoke all on function public.save_household_setup_v2(integer,bigint,integer,jsonb,text[],jsonb,jsonb,integer) from public,anon;
grant execute on function public.save_household_setup_v2(integer,bigint,integer,jsonb,text[],jsonb,jsonb,integer) to authenticated;
