-- P10.1: tighten read RPC execution and make audit isolation explicit.
-- Keep the three narrow mutation RPCs SECURITY DEFINER: they intentionally avoid
-- granting authenticated users direct INSERT/UPDATE/DELETE privileges on state tables.

drop policy if exists admin_audit_log_no_direct_access on public.admin_audit_log;

create policy admin_audit_log_no_direct_access
on public.admin_audit_log
as restrictive
for all
to public
using (false)
with check (false);

-- Reading a user's pantry does not require privilege elevation because the underlying
-- households and pantry_items RLS policies already enforce ownership.
alter function public.get_pantry(uuid)
security invoker;

-- Published meal-option calculation input is also covered by published-read RLS.
-- Keep the draft-capable aggregate helper unavailable to authenticated users and
-- expose a published-only aggregate through the invoker RPC.
revoke all on function public.get_meal_option_aggregate_for_publication(uuid)
from public, anon, authenticated;

create or replace function public.get_published_meal_option_calculation_input(
  p_meal_option_version_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $fn$
  select jsonb_build_object(
    'mealOption', jsonb_build_object(
      'mealOptionId', identity.id,
      'code', identity.code,
      'nameVi', identity.name_vi,
      'revision', identity.revision
    ),
    'version', jsonb_build_object(
      'mealOptionVersionId', version.id,
      'versionNumber', version.version_number,
      'revision', version.revision,
      'yieldAdultEquivalent',
        trim(trailing '.' from trim(trailing '0' from version.yield_adult_equivalent::text)),
      'activeMinutes', version.active_minutes,
      'elapsedMinutes', version.elapsed_minutes,
      'publicationStatus', version.publication_status,
      'contentHash', version.content_hash
    ),
    'components', coalesce((
      select jsonb_agg(jsonb_build_object(
        'mealOptionRecipeId', component.id,
        'recipeId', component.recipe_id,
        'recipeVersionId', component.recipe_version_id,
        'recipeVersionNumber', recipe_version.version_number,
        'recipeContentHash', recipe_version.content_hash,
        'recipePublicationStatus', recipe_version.publication_status,
        'recipeYieldAdultEquivalent',
          trim(trailing '.' from trim(trailing '0' from recipe_version.yield_adult_equivalent::text)),
        'quantityMultiplier',
          trim(trailing '.' from trim(trailing '0' from component.quantity_multiplier::text)),
        'mealRole', component.meal_role,
        'sortOrder', component.sort_order
      ) order by component.sort_order, component.id)
      from public.meal_option_recipes as component
      join public.recipe_versions as recipe_version
        on recipe_version.id = component.recipe_version_id
      where component.meal_option_version_id = version.id
        and recipe_version.publication_status = 'published'
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tagId', tag.id,
        'code', tag.code,
        'kind', tag.tag_kind
      ) order by tag.tag_kind, tag.code, tag.id)
      from public.meal_option_version_tags as link
      join public.recipe_tags as tag on tag.id = link.recipe_tag_id
      where link.meal_option_version_id = version.id
    ), '[]'::jsonb)
  )
  from public.meal_option_versions as version
  join public.meal_options as identity
    on identity.id = version.meal_option_id
  where version.id = p_meal_option_version_id
    and version.publication_status = 'published'
    and identity.status in ('published', 'retired');
$fn$;

revoke all on function public.get_published_meal_option_calculation_input(uuid)
from public, anon, authenticated;

grant execute on function public.get_published_meal_option_calculation_input(uuid)
to authenticated;

-- Production statistics show repeated sequential scans on recipe_step_ingredients.
-- Two composite indexes cover both foreign-key paths while also supporting lookups
-- by recipe_version_id through their leading column.
create index if not exists recipe_step_ingredients_step_fk_idx
on public.recipe_step_ingredients (recipe_version_id, recipe_step_id);

create index if not exists recipe_step_ingredients_ingredient_fk_idx
on public.recipe_step_ingredients (recipe_version_id, recipe_ingredient_id);
