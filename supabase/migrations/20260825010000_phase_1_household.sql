create type public.household_member_kind as enum ('adult', 'child', 'elderly');
create type public.household_age_band as enum (
  'adult',
  '1_3',
  '4_6',
  '7_9',
  '10_12',
  '13_17',
  'elderly'
);
create type public.household_rule_kind as enum (
  'allergen_exclusion',
  'food_exclusion',
  'soft_preference'
);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  locale text not null default 'vi-VN' check (locale = 'vi-VN'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users (id) on delete cascade,
  timezone text not null default 'Asia/Ho_Chi_Minh' check (timezone = 'Asia/Ho_Chi_Minh'),
  currency_code text not null default 'VND' check (currency_code = 'VND'),
  weekly_plan_budget_vnd bigint not null check (
    weekly_plan_budget_vnd between 1 and 100000000
  ),
  max_elapsed_minutes smallint not null check (max_elapsed_minutes between 10 and 180),
  onboarding_completed_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_member_groups (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_kind public.household_member_kind not null,
  age_band public.household_age_band not null,
  member_count smallint not null check (member_count between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_member_kind_band_compatible check (
    (member_kind = 'adult' and age_band = 'adult')
    or (
      member_kind = 'child'
      and age_band in ('1_3', '4_6', '7_9', '10_12', '13_17')
    )
    or (member_kind = 'elderly' and age_band = 'elderly')
  ),
  unique (household_id, member_kind, age_band)
);

create index household_member_groups_household_id_idx
on public.household_member_groups (household_id);

create table public.household_rule_options (
  code text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  target_key text not null check (target_key ~ '^[a-z][a-z0-9_]*$'),
  rule_kind public.household_rule_kind not null,
  label_vi text not null check (char_length(label_vi) between 1 and 80),
  sort_order smallint not null check (sort_order > 0),
  unique (rule_kind, target_key),
  unique (rule_kind, sort_order)
);

insert into public.household_rule_options (code, target_key, rule_kind, label_vi, sort_order)
values
  ('allergen_peanut', 'peanut', 'allergen_exclusion', 'Dị ứng đậu phộng', 1),
  ('allergen_tree_nut', 'tree_nut', 'allergen_exclusion', 'Dị ứng các loại hạt cây', 2),
  ('allergen_milk', 'dairy', 'allergen_exclusion', 'Dị ứng sữa', 3),
  ('allergen_egg', 'egg', 'allergen_exclusion', 'Dị ứng trứng', 4),
  ('allergen_soy', 'soy', 'allergen_exclusion', 'Dị ứng đậu nành', 5),
  ('allergen_wheat', 'wheat', 'allergen_exclusion', 'Dị ứng lúa mì', 6),
  ('allergen_fish', 'fish', 'allergen_exclusion', 'Dị ứng cá', 7),
  (
    'allergen_crustacean',
    'crustacean',
    'allergen_exclusion',
    'Dị ứng giáp xác (tôm, cua)',
    8
  ),
  ('allergen_mollusc', 'mollusc', 'allergen_exclusion', 'Dị ứng nhuyễn thể', 9),
  ('allergen_sesame', 'sesame', 'allergen_exclusion', 'Dị ứng mè (vừng)', 10),
  (
    'allergen_other',
    'unsupported_allergen',
    'allergen_exclusion',
    'Dị ứng khác chưa có trong danh sách',
    11
  ),
  ('exclude_pork', 'pork', 'food_exclusion', 'Không dùng thịt heo', 12),
  ('exclude_beef', 'beef', 'food_exclusion', 'Không dùng thịt bò', 13),
  ('exclude_poultry', 'poultry', 'food_exclusion', 'Không dùng thịt gia cầm', 14),
  ('exclude_seafood', 'seafood', 'food_exclusion', 'Không dùng hải sản', 15),
  ('exclude_egg', 'egg', 'food_exclusion', 'Không dùng trứng', 16),
  ('exclude_dairy', 'dairy', 'food_exclusion', 'Không dùng sữa', 17),
  ('diet_vegetarian', 'vegetarian', 'food_exclusion', 'Ăn chay', 18),
  ('prefer_pork', 'pork', 'soft_preference', 'Ưu tiên thịt heo', 19),
  ('prefer_beef', 'beef', 'soft_preference', 'Ưu tiên thịt bò', 20),
  ('prefer_poultry', 'poultry', 'soft_preference', 'Ưu tiên thịt gia cầm', 21),
  ('prefer_fish', 'fish', 'soft_preference', 'Ưu tiên cá', 22),
  ('prefer_seafood', 'seafood', 'soft_preference', 'Ưu tiên hải sản', 23),
  ('prefer_tofu', 'tofu', 'soft_preference', 'Ưu tiên đậu hũ', 24),
  (
    'prefer_vegetable_forward',
    'vegetable_forward',
    'soft_preference',
    'Ưu tiên nhiều rau',
    25
  ),
  ('prefer_soup', 'soup', 'soft_preference', 'Ưu tiên món canh', 26);

create table public.household_food_rules (
  household_id uuid not null references public.households (id) on delete cascade,
  rule_code text not null references public.household_rule_options (code) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (household_id, rule_code)
);

create index household_food_rules_household_id_idx
on public.household_food_rules (household_id);

create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

create trigger auth_user_creates_profile
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create function private.touch_profile_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.touch_profile_updated_at() from public, anon, authenticated;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function private.touch_profile_updated_at();

create function private.prepare_household_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id then
    raise exception using
      errcode = '23514',
      message = 'HOUSEHOLD_OWNER_IMMUTABLE';
  end if;
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

revoke all on function private.prepare_household_update() from public, anon, authenticated;

create trigger households_prepare_update
before update on public.households
for each row execute function private.prepare_household_update();

create function private.touch_member_group_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.touch_member_group_updated_at() from public, anon, authenticated;

create trigger household_member_groups_touch_updated_at
before update on public.household_member_groups
for each row execute function private.touch_member_group_updated_at();

create function private.assert_household_member_state(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completed_at timestamptz;
  v_member_total integer;
begin
  select
    household.onboarding_completed_at,
    coalesce(sum(member_group.member_count), 0)::integer
  into v_completed_at, v_member_total
  from public.households as household
  left join public.household_member_groups as member_group
    on member_group.household_id = household.id
  where household.id = p_household_id
  group by household.id, household.onboarding_completed_at;

  if not found then
    return;
  end if;

  if v_member_total > 20 then
    raise exception using
      errcode = '23514',
      message = 'HOUSEHOLD_MEMBER_TOTAL_OUT_OF_RANGE';
  end if;

  if v_completed_at is not null and v_member_total not between 1 and 20 then
    raise exception using
      errcode = '23514',
      message = 'COMPLETED_HOUSEHOLD_REQUIRES_SUPPORTED_MEMBERS';
  end if;
end;
$$;

revoke all on function private.assert_household_member_state(uuid)
from public, anon, authenticated;

create function private.enforce_household_member_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'households' then
    perform private.assert_household_member_state(coalesce(new.id, old.id));
  else
    if tg_op in ('UPDATE', 'DELETE') then
      perform private.assert_household_member_state(old.household_id);
    end if;
    if tg_op in ('INSERT', 'UPDATE') and (
      tg_op = 'INSERT' or new.household_id is distinct from old.household_id
    ) then
      perform private.assert_household_member_state(new.household_id);
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_household_member_state()
from public, anon, authenticated;

create constraint trigger households_require_valid_members
after insert or update on public.households
deferrable initially immediate
for each row execute function private.enforce_household_member_state();

create constraint trigger household_member_groups_require_valid_household
after insert or update or delete on public.household_member_groups
deferrable initially immediate
for each row execute function private.enforce_household_member_state();

create function private.assert_household_rule_target_state(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.household_food_rules as hard_rule
    join public.household_rule_options as hard_option
      on hard_option.code = hard_rule.rule_code
    join public.household_food_rules as soft_rule
      on soft_rule.household_id = hard_rule.household_id
    join public.household_rule_options as soft_option
      on soft_option.code = soft_rule.rule_code
    where hard_rule.household_id = p_household_id
      and hard_option.rule_kind in ('allergen_exclusion', 'food_exclusion')
      and soft_option.rule_kind = 'soft_preference'
      and soft_option.target_key = hard_option.target_key
  ) then
    raise exception using
      errcode = '23514',
      message = 'HOUSEHOLD_RULE_TARGET_CONFLICT';
  end if;
end;
$$;

revoke all on function private.assert_household_rule_target_state(uuid)
from public, anon, authenticated;

create function private.enforce_household_rule_target_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.household_id is distinct from old.household_id then
    perform private.assert_household_rule_target_state(old.household_id);
  end if;
  perform private.assert_household_rule_target_state(new.household_id);
  return new;
end;
$$;

revoke all on function private.enforce_household_rule_target_state()
from public, anon, authenticated;

create constraint trigger household_food_rules_no_hard_soft_conflict
after insert or update on public.household_food_rules
deferrable initially immediate
for each row execute function private.enforce_household_rule_target_state();

create function private.reject_household_rule_option_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'HOUSEHOLD_RULE_OPTIONS_ARE_APPEND_ONLY';
end;
$$;

revoke all on function private.reject_household_rule_option_mutation()
from public, anon, authenticated;

create trigger household_rule_options_are_append_only
before update or delete on public.household_rule_options
for each row execute function private.reject_household_rule_option_mutation();

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_member_groups enable row level security;
alter table public.household_rule_options enable row level security;
alter table public.household_food_rules enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.households from anon, authenticated;
revoke all on table public.household_member_groups from anon, authenticated;
revoke all on table public.household_rule_options from anon, authenticated;
revoke all on table public.household_food_rules from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (locale) on table public.profiles to authenticated;
grant select, insert, update on table public.households to authenticated;
grant select, insert, update, delete on table public.household_member_groups to authenticated;
grant select on table public.household_rule_options to authenticated;
grant select, insert, delete on table public.household_food_rules to authenticated;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (user_id = (select auth.uid()));

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy households_select_own
on public.households
for select
to authenticated
using (owner_user_id = (select auth.uid()));

create policy households_insert_own
on public.households
for insert
to authenticated
with check (owner_user_id = (select auth.uid()));

create policy households_update_own
on public.households
for update
to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

create policy household_member_groups_select_own
on public.household_member_groups
for select
to authenticated
using (
  exists (
    select 1
    from public.households as household
    where household.id = household_member_groups.household_id
      and household.owner_user_id = (select auth.uid())
  )
);

create policy household_member_groups_insert_own
on public.household_member_groups
for insert
to authenticated
with check (
  exists (
    select 1
    from public.households as household
    where household.id = household_member_groups.household_id
      and household.owner_user_id = (select auth.uid())
  )
);

create policy household_member_groups_update_own
on public.household_member_groups
for update
to authenticated
using (
  exists (
    select 1
    from public.households as household
    where household.id = household_member_groups.household_id
      and household.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.households as household
    where household.id = household_member_groups.household_id
      and household.owner_user_id = (select auth.uid())
  )
);

create policy household_member_groups_delete_own
on public.household_member_groups
for delete
to authenticated
using (
  exists (
    select 1
    from public.households as household
    where household.id = household_member_groups.household_id
      and household.owner_user_id = (select auth.uid())
  )
);

create policy household_rule_options_select_authenticated
on public.household_rule_options
for select
to authenticated
using (true);

create policy household_food_rules_select_own
on public.household_food_rules
for select
to authenticated
using (
  exists (
    select 1
    from public.households as household
    where household.id = household_food_rules.household_id
      and household.owner_user_id = (select auth.uid())
  )
);

create policy household_food_rules_insert_own
on public.household_food_rules
for insert
to authenticated
with check (
  exists (
    select 1
    from public.households as household
    where household.id = household_food_rules.household_id
      and household.owner_user_id = (select auth.uid())
  )
);

create policy household_food_rules_delete_own
on public.household_food_rules
for delete
to authenticated
using (
  exists (
    select 1
    from public.households as household
    where household.id = household_food_rules.household_id
      and household.owner_user_id = (select auth.uid())
  )
);

create function public.save_household_setup(
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
    households_require_valid_members,
    household_member_groups_require_valid_household
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
    households_require_valid_members,
    household_member_groups_require_valid_household
  immediate;

  return v_household;
end;
$$;

revoke all on function public.save_household_setup(integer, bigint, smallint, jsonb, text[])
from public, anon;
grant execute on function public.save_household_setup(integer, bigint, smallint, jsonb, text[])
to authenticated;
