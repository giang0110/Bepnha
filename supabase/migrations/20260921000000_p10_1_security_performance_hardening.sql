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

-- Published meal-option calculation input is also fully covered by published-read RLS.
-- The inner aggregate function must be executable by authenticated callers once the
-- outer function stops elevating privileges.
revoke all on function public.get_meal_option_aggregate_for_publication(uuid)
from public, anon;

grant execute on function public.get_meal_option_aggregate_for_publication(uuid)
to authenticated;

alter function public.get_published_meal_option_calculation_input(uuid)
security invoker;

-- Production statistics show repeated sequential scans on recipe_step_ingredients.
-- Two composite indexes cover both foreign-key paths while also supporting lookups
-- by recipe_version_id through their leading column.
create index if not exists recipe_step_ingredients_step_fk_idx
on public.recipe_step_ingredients (recipe_version_id, recipe_step_id);

create index if not exists recipe_step_ingredients_ingredient_fk_idx
on public.recipe_step_ingredients (recipe_version_id, recipe_ingredient_id);
