-- P11: make security intent explicit and add targeted FK indexes for production growth.
-- This migration does not broaden client data access.

-- Keep the administrator audit trail inaccessible even if table grants are broadened later.
create policy admin_audit_log_no_client_access
on public.admin_audit_log
for all
to anon, authenticated
using (false)
with check (false);

-- Reassert the intended RPC contract: never anonymous; authenticated only.
revoke all on function public.delete_pantry_item(uuid, integer) from public, anon;
revoke all on function public.get_pantry(uuid) from public, anon;
revoke all on function public.get_published_meal_option_calculation_input(uuid) from public, anon;
revoke all on function public.set_shopping_item_checked(uuid, boolean) from public, anon;
revoke all on function public.upsert_pantry_item(uuid, uuid, uuid, uuid, numeric, integer) from public, anon;

grant execute on function public.delete_pantry_item(uuid, integer) to authenticated;
grant execute on function public.get_pantry(uuid) to authenticated;
grant execute on function public.get_published_meal_option_calculation_input(uuid) to authenticated;
grant execute on function public.set_shopping_item_checked(uuid, boolean) to authenticated;
grant execute on function public.upsert_pantry_item(uuid, uuid, uuid, uuid, numeric, integer) to authenticated;

comment on function public.delete_pantry_item(uuid, integer)
  is 'Owner-scoped pantry mutation. SECURITY DEFINER is intentional; auth.uid() and household ownership are verified inside the function.';
comment on function public.get_pantry(uuid)
  is 'Owner-scoped pantry read. SECURITY DEFINER is intentional; auth.uid() and household ownership are verified inside the function.';
comment on function public.get_published_meal_option_calculation_input(uuid)
  is 'Authenticated published-catalog read. SECURITY DEFINER is intentional and only published meal option versions are returned.';
comment on function public.set_shopping_item_checked(uuid, boolean)
  is 'Owner-scoped shopping mutation. SECURITY DEFINER is intentional; auth.uid() and household ownership are verified inside the function.';
comment on function public.upsert_pantry_item(uuid, uuid, uuid, uuid, numeric, integer)
  is 'Owner-scoped pantry mutation. SECURITY DEFINER is intentional; auth.uid() and household ownership are verified inside the function.';

-- Targeted indexes selected from Supabase Advisor findings and current query paths.
create index if not exists admin_audit_log_actor_user_id_idx
  on public.admin_audit_log (actor_user_id);

create index if not exists food_categories_parent_id_idx
  on public.food_categories (parent_id);

create index if not exists food_fact_allergen_assessments_allergen_id_idx
  on public.food_fact_allergen_assessments (allergen_id);

create index if not exists food_fact_dietary_tags_dietary_tag_id_idx
  on public.food_fact_dietary_tags (dietary_tag_id);

create index if not exists food_fact_nutrients_nutrient_id_idx
  on public.food_fact_nutrients (nutrient_id);

create index if not exists food_fact_unit_conversions_unit_id_idx
  on public.food_fact_unit_conversions (unit_id);

create index if not exists food_fact_versions_category_id_idx
  on public.food_fact_versions (category_id);

create index if not exists household_food_rules_rule_code_idx
  on public.household_food_rules (rule_code);

create index if not exists household_rule_catalog_targets_allergen_id_idx
  on public.household_rule_catalog_targets (allergen_id);

create index if not exists household_rule_catalog_targets_category_id_idx
  on public.household_rule_catalog_targets (category_id);

create index if not exists household_rule_catalog_targets_dietary_tag_id_idx
  on public.household_rule_catalog_targets (dietary_tag_id);

create index if not exists meal_option_version_tags_recipe_tag_id_idx
  on public.meal_option_version_tags (recipe_tag_id);

create index if not exists recipe_version_tags_recipe_tag_id_idx
  on public.recipe_version_tags (recipe_tag_id);

create index if not exists recipe_ingredients_unit_id_idx
  on public.recipe_ingredients (unit_id);

create index if not exists shopping_list_item_sources_meal_option_recipe_id_idx
  on public.shopping_list_item_sources (meal_option_recipe_id);
