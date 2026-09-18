-- Tell "not an ingredient" apart from "cleared for an allergic eater", and let each household say
-- which of the two its own allergy rule needs.
--
-- `absent` used to carry both meanings at once. For a catalog of generic market ingredients only the
-- first is ever knowable — nobody can clear a wet-market supplier's handling from a food's identity
-- — so writing `absent` there overstated what anyone had checked, and writing `unknown` instead
-- excluded every meal from every household that declared an allergy. Neither is usable.
--
-- `cross_contact_unverified` is the honest middle: not an ingredient of this food, handling
-- unverified. Whether that is acceptable is a medical judgement that differs per household and per
-- allergen, so `household_food_rules.allergen_strictness` moves the judgement to the household and
-- defaults to the strict reading.

-- Postgres cannot use a value added by `alter type ... add value` inside the transaction that adds
-- it, and each migration runs in one. Swapping the type sidesteps that entirely.
alter type public.allergen_assessment_status rename to allergen_assessment_status_superseded;

create type public.allergen_assessment_status as enum (
  'absent',
  'contains',
  'may_contain',
  'cross_contact_unverified',
  'unknown'
);

alter table public.food_fact_allergen_assessments
  alter column assessment type public.allergen_assessment_status
  using assessment::text::public.allergen_assessment_status;

drop type public.allergen_assessment_status_superseded;

-- `publish_food_fact` rejects only `unknown`, so a fact whose assessments are all decided — whether
-- `absent` or `cross_contact_unverified` — still publishes. That is deliberate: the new value is a
-- decision, not a gap.

create type public.household_allergen_strictness as enum ('strict', 'ingredient_only');

alter table public.household_food_rules
  add column allergen_strictness public.household_allergen_strictness not null default 'strict';

comment on column public.household_food_rules.allergen_strictness is
  'How far this rule reaches. `strict` also excludes meals whose ingredients are only '
  '`cross_contact_unverified`; `ingredient_only` accepts them. The default, and every non-allergen '
  'rule, stay `strict`, so an unanswered question never reads as permission.';

-- Only an allergy rule has a reach to choose. A food exclusion or a diet is about what the household
-- puts on the plate, not about a supplier's facility, so those rows stay at the default.
alter table public.household_food_rules
  add constraint household_food_rules_strictness_only_for_allergens
  check (allergen_strictness = 'strict' or rule_code like 'allergen\_%');

-- Replace rather than overload: with a defaulted sixth argument, a five-argument call would be
-- ambiguous between the two signatures.
drop function public.save_household_setup(integer, bigint, smallint, jsonb, text[]);

create function public.save_household_setup(
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


-- The planner needs each household's choice alongside its rules. `create or replace` keeps the
-- function's existing grants; only the projection changes.
create or replace function public.get_planner_generation_input(
  p_household_id uuid,
  p_week_start date,
  p_calculation_date date
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'household', to_jsonb(household),
    'memberGroups', coalesce((
      select jsonb_agg(to_jsonb(member_group) order by member_group.age_band)
      from public.household_member_groups as member_group
      where member_group.household_id = household.id
    ), '[]'::jsonb),
    'foodRules', coalesce((
      select jsonb_agg(rule.rule_code order by rule.rule_code)
      from public.household_food_rules as rule where rule.household_id = household.id
    ), '[]'::jsonb),
    -- Only the rules that departed from the default travel, so a planner input carrying no
    -- strictness at all still filters strictly.
    'foodRuleStrictness', coalesce((
      select jsonb_object_agg(rule.rule_code, rule.allergen_strictness)
      from public.household_food_rules as rule
      where rule.household_id = household.id and rule.allergen_strictness <> 'strict'
    ), '{}'::jsonb),
    'weekStart', p_week_start,
    'calculationDate', p_calculation_date,
    'mealOptionVersionIds', coalesce((
      select jsonb_agg(version.id order by version.id)
      from public.meal_options as identity
      join public.meal_option_versions as version on version.id = identity.current_version_id
      where identity.status = 'published' and identity.retired_at is null
        and version.publication_status = 'published'
    ), '[]'::jsonb),
    'priceBook', public.get_current_price_book(household.price_region_id)
  )
  from public.households as household
  where household.id = p_household_id
    and household.owner_user_id = (select auth.uid())
    and household.onboarding_completed_at is not null
    and extract(isodow from p_week_start) = 1;
$$;
