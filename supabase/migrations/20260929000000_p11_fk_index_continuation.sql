-- P11 continuation: finish the still-relevant reverse-FK index work from the
-- original Supabase hardening branch on top of the current production schema.
--
-- The security portion of the old branch is intentionally not replayed:
-- main already has the stronger restrictive deny-all audit policy, the two read RPCs
-- now run as SECURITY INVOKER, and production ACLs already keep anon out.
--
-- These indexes are limited to foreign-key columns that still have no covering
-- leading-column index on main. The earlier P13 index on
-- meal_option_version_tags(recipe_tag_id) is therefore not duplicated.

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

create index if not exists recipe_version_tags_recipe_tag_id_idx
  on public.recipe_version_tags (recipe_tag_id);

create index if not exists recipe_ingredients_unit_id_idx
  on public.recipe_ingredients (unit_id);

create index if not exists shopping_list_item_sources_meal_option_recipe_id_idx
  on public.shopping_list_item_sources (meal_option_recipe_id);
