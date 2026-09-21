-- Meal-option component scaling may require repeating decimal ratios (for example 2 / 6).
-- Treat sub-nanounit representation error as equal while still rejecting material yield drift.

create or replace function public.publish_meal_option_version(
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
          or abs(
            recipe_version.yield_adult_equivalent * component.quantity_multiplier
              - v_version.yield_adult_equivalent
          ) > 0.000000001::numeric
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
