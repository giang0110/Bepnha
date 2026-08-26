create type public.meal_option_role as enum ('staple', 'main', 'vegetable', 'soup', 'side');
create type public.meal_plan_status as enum ('ready', 'archived');
create type public.meal_plan_revision_kind as enum ('generation', 'regeneration', 'replacement');
create type public.meal_plan_budget_status as enum ('within', 'over');
create type public.meal_plan_revision_state as enum ('building', 'ready');

alter table public.food_prices
add constraint food_prices_purchase_increment_whole
check (purchase_increment = trunc(purchase_increment));

create table public.meal_options (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_vi text not null check (char_length(btrim(name_vi)) between 1 and 120),
  status public.catalog_identity_status not null default 'draft',
  revision integer not null default 1 check (revision > 0),
  current_version_id uuid,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'draft' and current_version_id is null and retired_at is null)
    or (status = 'published' and current_version_id is not null and retired_at is null)
    or (status = 'retired' and current_version_id is not null and retired_at is not null)
  )
);

create table public.meal_option_versions (
  id uuid primary key default gen_random_uuid(),
  meal_option_id uuid not null references public.meal_options (id) on delete restrict,
  version_number integer not null check (version_number > 0),
  revision integer not null default 1 check (revision > 0),
  yield_adult_equivalent numeric(8, 3) not null check (yield_adult_equivalent > 0),
  active_minutes smallint not null check (active_minutes > 0),
  elapsed_minutes smallint not null check (
    elapsed_minutes >= active_minutes and elapsed_minutes <= 180
  ),
  publication_status public.catalog_publication_status not null default 'draft',
  content_hash text,
  published_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meal_option_id, version_number),
  unique (meal_option_id, id),
  check (
    (publication_status = 'draft' and content_hash is null and published_at is null)
    or (
      publication_status = 'published'
      and content_hash ~ '^[0-9a-f]{64}$'
      and published_at is not null
    )
  )
);

create unique index meal_option_versions_one_draft_per_identity_idx
on public.meal_option_versions (meal_option_id)
where publication_status = 'draft';

alter table public.meal_options
add constraint meal_options_current_version_fkey
foreign key (id, current_version_id)
references public.meal_option_versions (meal_option_id, id) on delete restrict;

create table public.meal_option_recipes (
  id uuid primary key default gen_random_uuid(),
  meal_option_version_id uuid not null references public.meal_option_versions (id) on delete restrict,
  recipe_id uuid not null,
  recipe_version_id uuid not null,
  quantity_multiplier numeric(18, 6) not null check (quantity_multiplier > 0),
  meal_role public.meal_option_role not null,
  sort_order smallint not null check (sort_order > 0),
  unique (meal_option_version_id, recipe_id),
  unique (meal_option_version_id, sort_order),
  unique (meal_option_version_id, id),
  constraint meal_option_recipes_recipe_version_fkey
    foreign key (recipe_id, recipe_version_id)
    references public.recipe_versions (recipe_id, id) on delete restrict
);

create table public.meal_option_version_tags (
  meal_option_version_id uuid not null references public.meal_option_versions (id) on delete restrict,
  recipe_tag_id uuid not null references public.recipe_tags (id) on delete restrict,
  primary key (meal_option_version_id, recipe_tag_id)
);

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  timezone text not null check (timezone = 'Asia/Ho_Chi_Minh'),
  status public.meal_plan_status not null default 'ready',
  version integer not null default 0 check (version >= 0),
  current_revision_id uuid,
  calculation_fingerprint text check (
    calculation_fingerprint is null or calculation_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  total_estimated_cost_vnd bigint check (
    total_estimated_cost_vnd is null
    or total_estimated_cost_vnd between 0 and 9007199254740991
  ),
  budget_status public.meal_plan_budget_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, week_start),
  unique (id, current_revision_id)
);

create index meal_plans_household_id_idx on public.meal_plans (household_id);

create table public.meal_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references public.meal_plans (id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  parent_revision_id uuid,
  revision_kind public.meal_plan_revision_kind not null,
  replaced_day_index smallint check (replaced_day_index between 0 and 6),
  idempotency_key uuid not null,
  household_setup_version integer not null check (household_setup_version > 0),
  engine_version text not null check (char_length(btrim(engine_version)) between 1 and 80),
  portion_config_version text not null check (char_length(btrim(portion_config_version)) between 1 and 80),
  price_freshness_config_version text not null check (
    char_length(btrim(price_freshness_config_version)) between 1 and 80
  ),
  planner_config_version text not null check (char_length(btrim(planner_config_version)) between 1 and 80),
  calculation_date date not null,
  catalog_fingerprint text not null check (catalog_fingerprint ~ '^[0-9a-f]{64}$'),
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  calculation_fingerprint text not null check (calculation_fingerprint ~ '^[0-9a-f]{64}$'),
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  calculation_snapshot jsonb not null check (jsonb_typeof(calculation_snapshot) = 'object'),
  budget_vnd bigint not null check (budget_vnd between 1 and 100000000),
  total_estimated_cost_vnd bigint not null check (
    total_estimated_cost_vnd between 0 and 9007199254740991
  ),
  overage_vnd bigint not null check (overage_vnd between 0 and 9007199254740991),
  budget_status public.meal_plan_budget_status not null,
  warnings jsonb not null check (jsonb_typeof(warnings) = 'array'),
  state public.meal_plan_revision_state not null default 'building',
  sealed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (meal_plan_id, revision_number),
  unique (meal_plan_id, idempotency_key),
  unique (meal_plan_id, id),
  constraint meal_plan_revisions_parent_fkey
    foreign key (meal_plan_id, parent_revision_id)
    references public.meal_plan_revisions (meal_plan_id, id) on delete restrict,
  check (
    (revision_kind = 'replacement' and parent_revision_id is not null and replaced_day_index is not null)
    or (revision_kind <> 'replacement' and replaced_day_index is null)
  ),
  check (
    (state = 'building' and sealed_at is null)
    or (state = 'ready' and sealed_at is not null)
  ),
  check (
    (budget_status = 'within' and total_estimated_cost_vnd <= budget_vnd and overage_vnd = 0)
    or (
      budget_status = 'over'
      and total_estimated_cost_vnd > budget_vnd
      and overage_vnd = total_estimated_cost_vnd - budget_vnd
    )
  )
);

alter table public.meal_plans
add constraint meal_plans_current_revision_fkey
foreign key (id, current_revision_id)
references public.meal_plan_revisions (meal_plan_id, id) on delete restrict;

create index meal_plan_revisions_plan_id_idx on public.meal_plan_revisions (meal_plan_id);

create table public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  meal_plan_revision_id uuid not null references public.meal_plan_revisions (id) on delete cascade,
  day_index smallint not null check (day_index between 0 and 6),
  meal_slot text not null default 'primary' check (meal_slot = 'primary'),
  meal_option_id uuid not null,
  meal_option_version_id uuid not null,
  adult_equivalent numeric(18, 6) not null check (adult_equivalent > 0),
  scale_factor numeric(18, 9) not null check (scale_factor > 0),
  calculation_snapshot jsonb not null check (jsonb_typeof(calculation_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique (meal_plan_revision_id, day_index, meal_slot),
  constraint meal_plan_items_option_version_fkey
    foreign key (meal_option_id, meal_option_version_id)
    references public.meal_option_versions (meal_option_id, id) on delete restrict
);

create index meal_plan_items_revision_id_idx on public.meal_plan_items (meal_plan_revision_id);

create table private.plan_transition_context (
  backend_pid integer not null,
  transaction_id bigint not null,
  primary key (backend_pid, transaction_id)
);

revoke all on table private.plan_transition_context from public, anon, authenticated, service_role;

create function private.begin_plan_transition()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into private.plan_transition_context (backend_pid, transaction_id)
  values (pg_backend_pid(), txid_current())
  on conflict do nothing;
$$;

create function private.end_plan_transition()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from private.plan_transition_context
  where backend_pid = pg_backend_pid() and transaction_id = txid_current();
$$;

create function private.plan_transition_is_trusted()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.plan_transition_context
    where backend_pid = pg_backend_pid() and transaction_id = txid_current()
  );
$$;

revoke all on function private.begin_plan_transition() from public, anon, authenticated, service_role;
revoke all on function private.end_plan_transition() from public, anon, authenticated, service_role;
revoke all on function private.plan_transition_is_trusted() from public, anon, authenticated;

create function private.protect_meal_option_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.current_version_id is not null or new.retired_at is not null then
      raise exception using errcode = '23514', message = 'MEAL_OPTION_MUST_START_DRAFT';
    end if;
    return new;
  end if;
  if private.catalog_transition_is_trusted() then return new; end if;
  if new.status is distinct from old.status
    or new.current_version_id is distinct from old.current_version_id
    or new.retired_at is distinct from old.retired_at then
    raise exception using errcode = '42501', message = 'MEAL_OPTION_LIFECYCLE_RPC_REQUIRED';
  end if;
  if exists (select 1 from public.meal_option_versions where meal_option_id = old.id)
    and new.code is distinct from old.code then
    raise exception using errcode = '23514', message = 'MEAL_OPTION_CODE_IMMUTABLE';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger meal_options_protect_identity
before insert or update on public.meal_options
for each row execute function private.protect_meal_option_identity();

create function private.protect_meal_option_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.publication_status <> 'draft' or new.content_hash is not null or new.published_at is not null then
      raise exception using errcode = '23514', message = 'MEAL_OPTION_VERSION_MUST_START_DRAFT';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.publication_status = 'published' then
      raise exception using errcode = '23514', message = 'PUBLISHED_MEAL_OPTION_VERSION_IMMUTABLE';
    end if;
    return old;
  end if;
  if private.catalog_transition_is_trusted() then return new; end if;
  if old.publication_status = 'published' then
    raise exception using errcode = '23514', message = 'PUBLISHED_MEAL_OPTION_VERSION_IMMUTABLE';
  end if;
  if new.publication_status is distinct from old.publication_status
    or new.content_hash is distinct from old.content_hash
    or new.published_at is distinct from old.published_at then
    raise exception using errcode = '42501', message = 'MEAL_OPTION_PUBLICATION_RPC_REQUIRED';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger meal_option_versions_protect_lifecycle
before insert or update or delete on public.meal_option_versions
for each row execute function private.protect_meal_option_version();

create function private.protect_meal_option_child()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_parent uuid;
  v_new_parent uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_parent := old.meal_option_version_id;
    if exists (
      select 1 from public.meal_option_versions
      where id = v_old_parent and publication_status = 'published'
    ) then
      raise exception using errcode = '23514', message = 'PUBLISHED_MEAL_OPTION_CHILD_IMMUTABLE';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_parent := new.meal_option_version_id;
    if exists (
      select 1 from public.meal_option_versions
      where id = v_new_parent and publication_status = 'published'
    ) then
      raise exception using errcode = '23514', message = 'PUBLISHED_MEAL_OPTION_CHILD_IMMUTABLE';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger meal_option_recipes_protect_published
before insert or update or delete on public.meal_option_recipes
for each row execute function private.protect_meal_option_child();
create trigger meal_option_tags_protect_published
before insert or update or delete on public.meal_option_version_tags
for each row execute function private.protect_meal_option_child();

create function private.protect_plan_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.plan_transition_is_trusted() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception using errcode = '42501', message = 'PLAN_PERSISTENCE_RPC_REQUIRED';
end;
$$;

create trigger meal_plans_protect_history
before insert or update or delete on public.meal_plans
for each row execute function private.protect_plan_history();
create trigger meal_plan_revisions_protect_history
before insert or update or delete on public.meal_plan_revisions
for each row execute function private.protect_plan_history();
create trigger meal_plan_items_protect_history
before insert or update or delete on public.meal_plan_items
for each row execute function private.protect_plan_history();

create function private.assert_plan_summary_row(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.meal_plans;
  v_revision public.meal_plan_revisions;
  v_line_sum bigint;
begin
  select * into v_plan from public.meal_plans where id = p_plan_id;
  if not found or v_plan.current_revision_id is null then
    raise exception using errcode = '23514', message = 'PLAN_CURRENT_REVISION_REQUIRED';
  end if;
  select * into v_revision from public.meal_plan_revisions
  where id = v_plan.current_revision_id and meal_plan_id = v_plan.id and state = 'ready';
  if not found then raise exception using errcode = '23514', message = 'PLAN_READY_REVISION_REQUIRED'; end if;
  select coalesce(sum((line ->> 'lineCostVnd')::bigint), 0) into v_line_sum
  from jsonb_array_elements(v_revision.calculation_snapshot #> '{purchaseBasket,lines}') as line;
  if v_plan.calculation_fingerprint <> v_revision.calculation_fingerprint
    or v_plan.total_estimated_cost_vnd <> v_revision.total_estimated_cost_vnd
    or v_plan.budget_status <> v_revision.budget_status
    or v_line_sum <> v_revision.total_estimated_cost_vnd
    or (v_revision.calculation_snapshot #>> '{purchaseBasket,totalEstimatedCostVnd}')::bigint
      <> v_revision.total_estimated_cost_vnd then
    raise exception using errcode = '23514', message = 'PLAN_SUMMARY_MISMATCH';
  end if;
end;
$$;

create function private.assert_plan_summary_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_plan_summary_row(new.id);
  return null;
end;
$$;

create constraint trigger meal_plans_summary_matches_revision
after insert or update on public.meal_plans
deferrable initially deferred
for each row execute function private.assert_plan_summary_trigger();

create function public.publish_meal_option_version(
  p_meal_option_version_id uuid,
  p_content_hash text,
  p_actor_user_id uuid,
  p_expected_revision integer
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
  if p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_CONTENT_HASH';
  end if;
  select * into v_version from public.meal_option_versions
  where id = p_meal_option_version_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'MEAL_OPTION_VERSION_NOT_FOUND'; end if;
  if v_version.publication_status <> 'draft' or v_version.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'STALE_CATALOG_REVISION';
  end if;
  perform 1 from public.meal_options where id = v_version.meal_option_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'MEAL_OPTION_NOT_FOUND'; end if;

  if (select count(*) from public.meal_option_recipes where meal_option_version_id = v_version.id) < 1
    or exists (
      select 1 from public.meal_option_recipes as component
      left join public.recipe_versions as recipe_version on recipe_version.id = component.recipe_version_id
      where component.meal_option_version_id = v_version.id
        and (
          recipe_version.publication_status is distinct from 'published'
          or recipe_version.recipe_id <> component.recipe_id
          or recipe_version.yield_adult_equivalent * component.quantity_multiplier
            <> v_version.yield_adult_equivalent
        )
    )
    or not exists (
      select 1 from public.meal_option_recipes
      where meal_option_version_id = v_version.id and meal_role = 'main'
    )
    or exists (
      select 1 from generate_series(1, (
        select count(*) from public.meal_option_recipes where meal_option_version_id = v_version.id
      )) as expected(sort_order)
      where not exists (
        select 1 from public.meal_option_recipes as component
        where component.meal_option_version_id = v_version.id
          and component.sort_order = expected.sort_order
      )
    ) then
    raise exception using errcode = '23514', message = 'INVALID_MEAL_OPTION_COMPONENTS';
  end if;

  if (
    select count(*) <> 1
    from public.meal_option_version_tags as link
    join public.recipe_tags as tag on tag.id = link.recipe_tag_id
    where link.meal_option_version_id = v_version.id and tag.tag_kind = 'protein_hint'
  ) then
    raise exception using errcode = '23514', message = 'INVALID_PROTEIN_HINT';
  end if;
  if not exists (
    select 1 from public.meal_option_version_tags as link
    join public.recipe_tags as tag on tag.id = link.recipe_tag_id
    where link.meal_option_version_id = v_version.id and tag.tag_kind = 'cooking_style'
  ) then
    raise exception using errcode = '23514', message = 'MISSING_COOKING_STYLE';
  end if;

  perform private.begin_catalog_transition();
  update public.meal_option_versions
  set publication_status = 'published', content_hash = p_content_hash,
      published_at = now(), revision = revision + 1, updated_at = now()
  where id = v_version.id returning * into v_version;
  update public.meal_options
  set status = 'published', current_version_id = v_version.id, retired_at = null,
      revision = revision + 1, updated_at = now()
  where id = v_version.meal_option_id;
  insert into public.admin_audit_log (
    actor_kind, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    'admin_user', p_actor_user_id, 'publish', 'meal_option_version', v_version.id,
    jsonb_build_object('contentHash', p_content_hash, 'versionNumber', v_version.version_number)
  );
  perform private.end_catalog_transition();
  return v_version;
end;
$$;

create function public.retire_meal_option(
  p_meal_option_id uuid,
  p_actor_user_id uuid,
  p_expected_revision integer
)
returns public.meal_options
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_identity public.meal_options;
begin
  perform private.assert_catalog_admin(p_actor_user_id);
  select * into v_identity from public.meal_options where id = p_meal_option_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'MEAL_OPTION_NOT_FOUND'; end if;
  if v_identity.status <> 'published' or v_identity.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'STALE_CATALOG_REVISION';
  end if;
  perform private.begin_catalog_transition();
  update public.meal_options
  set status = 'retired', retired_at = now(), revision = revision + 1, updated_at = now()
  where id = p_meal_option_id returning * into v_identity;
  insert into public.admin_audit_log (
    actor_kind, actor_user_id, action, entity_type, entity_id, before_summary, after_summary
  ) values (
    'admin_user', p_actor_user_id, 'retire', 'meal_option', p_meal_option_id,
    jsonb_build_object('status', 'published'), jsonb_build_object('status', 'retired')
  );
  perform private.end_catalog_transition();
  return v_identity;
end;
$$;

create function public.get_meal_option_aggregate_for_publication(p_meal_option_version_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'mealOption', jsonb_build_object(
      'mealOptionId', identity.id, 'code', identity.code, 'nameVi', identity.name_vi,
      'revision', identity.revision
    ),
    'version', jsonb_build_object(
      'mealOptionVersionId', version.id, 'versionNumber', version.version_number,
      'revision', version.revision,
      'yieldAdultEquivalent', trim(trailing '.' from trim(trailing '0' from version.yield_adult_equivalent::text)),
      'activeMinutes', version.active_minutes, 'elapsedMinutes', version.elapsed_minutes,
      'publicationStatus', version.publication_status, 'contentHash', version.content_hash
    ),
    'components', coalesce((
      select jsonb_agg(jsonb_build_object(
        'mealOptionRecipeId', component.id, 'recipeId', component.recipe_id,
        'recipeVersionId', component.recipe_version_id,
        'recipeVersionNumber', recipe_version.version_number,
        'recipeContentHash', recipe_version.content_hash,
        'recipePublicationStatus', recipe_version.publication_status,
        'recipeYieldAdultEquivalent', trim(trailing '.' from trim(trailing '0' from recipe_version.yield_adult_equivalent::text)),
        'quantityMultiplier', trim(trailing '.' from trim(trailing '0' from component.quantity_multiplier::text)),
        'mealRole', component.meal_role, 'sortOrder', component.sort_order
      ) order by component.sort_order, component.id)
      from public.meal_option_recipes as component
      join public.recipe_versions as recipe_version on recipe_version.id = component.recipe_version_id
      where component.meal_option_version_id = version.id
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tagId', tag.id, 'code', tag.code, 'kind', tag.tag_kind
      ) order by tag.tag_kind, tag.code, tag.id)
      from public.meal_option_version_tags as link
      join public.recipe_tags as tag on tag.id = link.recipe_tag_id
      where link.meal_option_version_id = version.id
    ), '[]'::jsonb)
  )
  from public.meal_option_versions as version
  join public.meal_options as identity on identity.id = version.meal_option_id
  where version.id = p_meal_option_version_id;
$$;

create function public.get_published_meal_option_calculation_input(p_meal_option_version_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.get_meal_option_aggregate_for_publication(version.id)
  from public.meal_option_versions as version
  where version.id = p_meal_option_version_id and version.publication_status = 'published';
$$;

create function public.get_planner_generation_input(
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

create function public.get_plan_replacement_input(p_plan_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'plan', to_jsonb(plan),
    'revision', to_jsonb(revision),
    'items', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.day_index)
      from public.meal_plan_items as item
      where item.meal_plan_revision_id = revision.id
    ), '[]'::jsonb),
    'discoverableMealOptionVersionIds', coalesce((
      select jsonb_agg(version.id order by version.id)
      from public.meal_options as identity
      join public.meal_option_versions as version on version.id = identity.current_version_id
      where identity.status = 'published' and identity.retired_at is null
    ), '[]'::jsonb)
  )
  from public.meal_plans as plan
  join public.households as household on household.id = plan.household_id
  join public.meal_plan_revisions as revision on revision.id = plan.current_revision_id
  where plan.id = p_plan_id and household.owner_user_id = (select auth.uid());
$$;

create function public.persist_meal_plan_revision(
  p_actor_user_id uuid,
  p_household_id uuid,
  p_week_start date,
  p_expected_plan_version integer,
  p_expected_current_revision_id uuid,
  p_idempotency_key uuid,
  p_revision jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household public.households;
  v_plan public.meal_plans;
  v_revision_id uuid := gen_random_uuid();
  v_revision_number integer;
  v_revision_kind public.meal_plan_revision_kind;
  v_replaced_day smallint;
  v_budget bigint;
  v_total bigint;
  v_overage bigint;
  v_budget_status public.meal_plan_budget_status;
  v_fingerprint text;
  v_line_sum bigint;
  v_existing public.meal_plan_revisions;
  v_changed_days integer;
begin
  select * into v_household from public.households
  where id = p_household_id and owner_user_id = p_actor_user_id
    and onboarding_completed_at is not null for share;
  if not found then raise exception using errcode = '42501', message = 'HOUSEHOLD_OWNERSHIP_REQUIRED'; end if;
  if extract(isodow from p_week_start) <> 1 then
    raise exception using errcode = '22023', message = 'WEEK_START_MUST_BE_MONDAY';
  end if;
  if jsonb_typeof(p_revision) <> 'object' or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) <> 7 then
    raise exception using errcode = '22023', message = 'INVALID_PLAN_PAYLOAD';
  end if;
  if (
    select count(*) <> 7
      or count(distinct (item ->> 'dayIndex')::integer) <> 7
      or min((item ->> 'dayIndex')::integer) <> 0
      or max((item ->> 'dayIndex')::integer) <> 6
      or count(distinct item ->> 'mealOptionId') <> 7
      or bool_or(item ->> 'mealSlot' <> 'primary')
    from jsonb_array_elements(p_items) as item
  ) then
    raise exception using errcode = '23514', message = 'PLAN_REQUIRES_SEVEN_DISTINCT_PRIMARY_ITEMS';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as item
    left join public.meal_option_versions as version
      on version.id = (item ->> 'mealOptionVersionId')::uuid
      and version.meal_option_id = (item ->> 'mealOptionId')::uuid
      and version.publication_status = 'published'
    where version.id is null
  ) then
    raise exception using errcode = '23503', message = 'INVALID_MEAL_OPTION_VERSION_PIN';
  end if;

  v_revision_kind := (p_revision ->> 'revisionKind')::public.meal_plan_revision_kind;
  v_replaced_day := nullif(p_revision ->> 'replacedDayIndex', '')::smallint;
  v_budget := (p_revision ->> 'budgetVnd')::bigint;
  v_total := (p_revision ->> 'totalEstimatedCostVnd')::bigint;
  v_overage := (p_revision ->> 'overageVnd')::bigint;
  v_budget_status := (p_revision ->> 'budgetStatus')::public.meal_plan_budget_status;
  v_fingerprint := p_revision ->> 'calculationFingerprint';
  if v_fingerprint !~ '^[0-9a-f]{64}$'
    or (p_revision ->> 'catalogFingerprint') !~ '^[0-9a-f]{64}$'
    or (p_revision ->> 'inputFingerprint') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_revision -> 'warnings') <> 'array'
    or jsonb_typeof(p_revision -> 'inputSnapshot') <> 'object'
    or jsonb_typeof(p_revision -> 'calculationSnapshot') <> 'object'
    or (p_revision ->> 'householdSetupVersion')::integer <> v_household.version then
    raise exception using errcode = '22023', message = 'INVALID_REVISION_METADATA';
  end if;
  select coalesce(sum((line ->> 'lineCostVnd')::bigint), 0) into v_line_sum
  from jsonb_array_elements(p_revision #> '{calculationSnapshot,purchaseBasket,lines}') as line;
  if v_line_sum <> v_total
    or (p_revision #>> '{calculationSnapshot,purchaseBasket,totalEstimatedCostVnd}')::bigint <> v_total
    or (v_budget_status = 'within' and (v_total > v_budget or v_overage <> 0))
    or (v_budget_status = 'over' and (v_total <= v_budget or v_overage <> v_total - v_budget)) then
    raise exception using errcode = '23514', message = 'PLAN_COST_INVARIANT_VIOLATION';
  end if;

  perform private.begin_plan_transition();
  select * into v_plan from public.meal_plans
  where household_id = p_household_id and week_start = p_week_start for update;
  if found then
    select * into v_existing from public.meal_plan_revisions
    where meal_plan_id = v_plan.id and idempotency_key = p_idempotency_key;
    if found then
      perform private.end_plan_transition();
      return jsonb_build_object(
        'planId', v_plan.id, 'revisionId', v_existing.id,
        'planVersion', v_plan.version, 'idempotent', true
      );
    end if;
    if v_plan.version <> p_expected_plan_version
      or v_plan.current_revision_id is distinct from p_expected_current_revision_id then
      raise exception using errcode = 'P0001', message = 'STALE_PLAN_VERSION';
    end if;
    if v_revision_kind = 'generation' then
      raise exception using errcode = '22023', message = 'REGENERATION_KIND_REQUIRED';
    end if;
  else
    if p_expected_plan_version <> 0 or p_expected_current_revision_id is not null
      or v_revision_kind <> 'generation' then
      raise exception using errcode = 'P0001', message = 'STALE_PLAN_VERSION';
    end if;
    insert into public.meal_plans (household_id, week_start, timezone)
    values (p_household_id, p_week_start, v_household.timezone)
    returning * into v_plan;
  end if;

  v_revision_number := v_plan.version + 1;
  insert into public.meal_plan_revisions (
    id, meal_plan_id, revision_number, parent_revision_id, revision_kind,
    replaced_day_index, idempotency_key, household_setup_version, engine_version,
    portion_config_version, price_freshness_config_version, planner_config_version,
    calculation_date, catalog_fingerprint, input_fingerprint, calculation_fingerprint,
    input_snapshot, calculation_snapshot, budget_vnd, total_estimated_cost_vnd,
    overage_vnd, budget_status, warnings
  ) values (
    v_revision_id, v_plan.id, v_revision_number, v_plan.current_revision_id, v_revision_kind,
    v_replaced_day, p_idempotency_key, (p_revision ->> 'householdSetupVersion')::integer,
    p_revision ->> 'engineVersion', p_revision ->> 'portionConfigVersion',
    p_revision ->> 'priceFreshnessConfigVersion', p_revision ->> 'plannerConfigVersion',
    (p_revision ->> 'calculationDate')::date, p_revision ->> 'catalogFingerprint',
    p_revision ->> 'inputFingerprint', v_fingerprint, p_revision -> 'inputSnapshot',
    jsonb_set(p_revision -> 'calculationSnapshot', '{items}', p_items, true),
    v_budget, v_total, v_overage, v_budget_status, p_revision -> 'warnings'
  );

  insert into public.meal_plan_items (
    meal_plan_revision_id, day_index, meal_slot, meal_option_id, meal_option_version_id,
    adult_equivalent, scale_factor, calculation_snapshot
  )
  select
    v_revision_id, (item ->> 'dayIndex')::smallint, item ->> 'mealSlot',
    (item ->> 'mealOptionId')::uuid, (item ->> 'mealOptionVersionId')::uuid,
    (item ->> 'adultEquivalent')::numeric, (item ->> 'scaleFactor')::numeric,
    item -> 'snapshot'
  from jsonb_array_elements(p_items) as item;

  if v_revision_kind = 'replacement' then
    if v_replaced_day is null or v_plan.current_revision_id is null then
      raise exception using errcode = '23514', message = 'INVALID_REPLACEMENT_PARENT';
    end if;
    select count(*) into v_changed_days
    from public.meal_plan_items as old_item
    join public.meal_plan_items as new_item on new_item.meal_plan_revision_id = v_revision_id
      and new_item.day_index = old_item.day_index
    where old_item.meal_plan_revision_id = v_plan.current_revision_id
      and (
        old_item.meal_option_id is distinct from new_item.meal_option_id
        or old_item.meal_option_version_id is distinct from new_item.meal_option_version_id
      );
    if v_changed_days <> 1 or not exists (
      select 1 from public.meal_plan_items as old_item
      join public.meal_plan_items as new_item on new_item.meal_plan_revision_id = v_revision_id
        and new_item.day_index = old_item.day_index
      where old_item.meal_plan_revision_id = v_plan.current_revision_id
        and old_item.day_index = v_replaced_day
        and old_item.meal_option_id is distinct from new_item.meal_option_id
    ) then
      raise exception using errcode = '23514', message = 'REPLACEMENT_MUST_CHANGE_EXACTLY_ONE_DAY';
    end if;
  end if;

  update public.meal_plan_revisions
  set state = 'ready', sealed_at = now()
  where id = v_revision_id;
  update public.meal_plans
  set current_revision_id = v_revision_id, version = v_revision_number,
      calculation_fingerprint = v_fingerprint, total_estimated_cost_vnd = v_total,
      budget_status = v_budget_status, updated_at = now()
  where id = v_plan.id returning * into v_plan;
  perform private.assert_plan_summary_row(v_plan.id);
  perform private.end_plan_transition();
  return jsonb_build_object(
    'planId', v_plan.id, 'revisionId', v_revision_id,
    'planVersion', v_plan.version, 'idempotent', false
  );
exception when others then
  perform private.end_plan_transition();
  raise;
end;
$$;

alter table public.meal_options enable row level security;
alter table public.meal_option_versions enable row level security;
alter table public.meal_option_recipes enable row level security;
alter table public.meal_option_version_tags enable row level security;
alter table public.meal_plans enable row level security;
alter table public.meal_plan_revisions enable row level security;
alter table public.meal_plan_items enable row level security;

create policy meal_options_authenticated_published_read
on public.meal_options for select to authenticated using (status in ('published', 'retired'));
create policy meal_option_versions_authenticated_published_read
on public.meal_option_versions for select to authenticated using (publication_status = 'published');
create policy meal_option_recipes_authenticated_published_read
on public.meal_option_recipes for select to authenticated using (
  exists (
    select 1 from public.meal_option_versions as version
    where version.id = meal_option_version_id and version.publication_status = 'published'
  )
);
create policy meal_option_tags_authenticated_published_read
on public.meal_option_version_tags for select to authenticated using (
  exists (
    select 1 from public.meal_option_versions as version
    where version.id = meal_option_version_id and version.publication_status = 'published'
  )
);
create policy meal_plans_owner_read
on public.meal_plans for select to authenticated using (
  exists (
    select 1 from public.households as household
    where household.id = household_id and household.owner_user_id = (select auth.uid())
  )
);
create policy meal_plan_revisions_owner_read
on public.meal_plan_revisions for select to authenticated using (
  exists (
    select 1 from public.meal_plans as plan
    join public.households as household on household.id = plan.household_id
    where plan.id = meal_plan_id and household.owner_user_id = (select auth.uid())
  )
);
create policy meal_plan_items_owner_read
on public.meal_plan_items for select to authenticated using (
  exists (
    select 1 from public.meal_plan_revisions as revision
    join public.meal_plans as plan on plan.id = revision.meal_plan_id
    join public.households as household on household.id = plan.household_id
    where revision.id = meal_plan_revision_id
      and household.owner_user_id = (select auth.uid())
  )
);

revoke all on table public.meal_options from anon, authenticated, service_role;
revoke all on table public.meal_option_versions from anon, authenticated, service_role;
revoke all on table public.meal_option_recipes from anon, authenticated, service_role;
revoke all on table public.meal_option_version_tags from anon, authenticated, service_role;
revoke all on table public.meal_plans from anon, authenticated, service_role;
revoke all on table public.meal_plan_revisions from anon, authenticated, service_role;
revoke all on table public.meal_plan_items from anon, authenticated, service_role;

grant select on table
  public.meal_options, public.meal_option_versions, public.meal_option_recipes,
  public.meal_option_version_tags, public.meal_plans, public.meal_plan_revisions,
  public.meal_plan_items
to authenticated;
grant select on table
  public.meal_options, public.meal_option_versions, public.meal_option_recipes,
  public.meal_option_version_tags, public.meal_plans, public.meal_plan_revisions,
  public.meal_plan_items
to service_role;
grant insert, delete on table public.meal_options, public.meal_option_versions to service_role;
grant update (code, name_vi) on public.meal_options to service_role;
grant update (yield_adult_equivalent, active_minutes, elapsed_minutes)
on public.meal_option_versions to service_role;
grant insert, update, delete on table
  public.meal_option_recipes, public.meal_option_version_tags
to service_role;

revoke all on function public.publish_meal_option_version(uuid, text, uuid, integer)
from public, anon, authenticated;
revoke all on function public.retire_meal_option(uuid, uuid, integer)
from public, anon, authenticated;
revoke all on function public.get_meal_option_aggregate_for_publication(uuid)
from public, anon, authenticated;
revoke all on function public.get_published_meal_option_calculation_input(uuid)
from public, anon;
revoke all on function public.get_planner_generation_input(uuid, date, date)
from public, anon;
revoke all on function public.get_plan_replacement_input(uuid) from public, anon;
revoke all on function public.persist_meal_plan_revision(uuid, uuid, date, integer, uuid, uuid, jsonb, jsonb)
from public, anon, authenticated;

grant execute on function public.publish_meal_option_version(uuid, text, uuid, integer)
to service_role;
grant execute on function public.retire_meal_option(uuid, uuid, integer)
to service_role;
grant execute on function public.get_meal_option_aggregate_for_publication(uuid)
to service_role;
grant execute on function public.get_published_meal_option_calculation_input(uuid)
to authenticated, service_role;
grant execute on function public.get_planner_generation_input(uuid, date, date)
to authenticated, service_role;
grant execute on function public.get_plan_replacement_input(uuid)
to authenticated, service_role;
grant execute on function public.persist_meal_plan_revision(uuid, uuid, date, integer, uuid, uuid, jsonb, jsonb)
to service_role;
