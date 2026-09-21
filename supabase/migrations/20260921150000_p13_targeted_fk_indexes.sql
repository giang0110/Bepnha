-- P13: add only the reverse-FK indexes justified by the active catalog workload.
-- These indexes support reference checks and reverse lookups without duplicating existing parent-first indexes.

create index if not exists meal_option_recipes_recipe_version_fk_idx
  on public.meal_option_recipes (recipe_id, recipe_version_id);

create index if not exists meal_option_version_tags_recipe_tag_idx
  on public.meal_option_version_tags (recipe_tag_id);

create index if not exists recipe_ingredients_food_fact_fk_idx
  on public.recipe_ingredients (food_id, food_fact_version_id);

create index if not exists food_prices_food_fact_fk_idx
  on public.food_prices (food_id, food_fact_version_id);
