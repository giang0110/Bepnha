create type public.catalog_dimension as enum ('mass', 'volume', 'count');
create type public.catalog_identity_status as enum ('draft', 'published', 'retired');
create type public.catalog_publication_status as enum ('draft', 'published');
create type public.allergen_assessment_status as enum (
  'absent',
  'contains',
  'may_contain',
  'unknown'
);
create type public.household_rule_catalog_mapping_kind as enum (
  'allergen',
  'category',
  'required_tag',
  'unsupported'
);
create type public.recipe_tag_kind as enum ('cooking_style', 'protein_hint', 'dish_role');
create type public.catalog_actor_kind as enum ('admin_user', 'trusted_operation');

create table public.units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_vi text not null check (char_length(btrim(name_vi)) between 1 and 80),
  dimension public.catalog_dimension not null,
  to_dimension_base numeric(18, 6) not null check (to_dimension_base > 0),
  created_at timestamptz not null default now(),
  unique (id, dimension)
);

insert into public.units (id, code, name_vi, dimension, to_dimension_base)
values
  ('70010000-0000-0000-0000-000000000001', 'g', 'gam', 'mass', 1),
  ('70010000-0000-0000-0000-000000000002', 'kg', 'kilôgam', 'mass', 1000),
  ('70010000-0000-0000-0000-000000000003', 'ml', 'mililít', 'volume', 1),
  ('70010000-0000-0000-0000-000000000004', 'l', 'lít', 'volume', 1000),
  ('70010000-0000-0000-0000-000000000005', 'tsp', 'muỗng cà phê', 'volume', 5),
  ('70010000-0000-0000-0000-000000000006', 'tbsp', 'muỗng canh', 'volume', 15),
  ('70010000-0000-0000-0000-000000000007', 'item', 'cái', 'count', 1);

create table public.food_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_vi text not null check (char_length(btrim(name_vi)) between 1 and 80),
  parent_id uuid references public.food_categories (id) on delete restrict,
  created_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);

insert into public.food_categories (id, code, name_vi, parent_id)
values
  ('70020000-0000-0000-0000-000000000001', 'food', 'Thực phẩm', null),
  ('70020000-0000-0000-0000-000000000002', 'pork', 'Thịt heo', '70020000-0000-0000-0000-000000000001'),
  ('70020000-0000-0000-0000-000000000003', 'beef', 'Thịt bò', '70020000-0000-0000-0000-000000000001'),
  ('70020000-0000-0000-0000-000000000004', 'poultry', 'Gia cầm', '70020000-0000-0000-0000-000000000001'),
  ('70020000-0000-0000-0000-000000000005', 'seafood', 'Hải sản', '70020000-0000-0000-0000-000000000001'),
  ('70020000-0000-0000-0000-000000000006', 'fish', 'Cá', '70020000-0000-0000-0000-000000000005'),
  ('70020000-0000-0000-0000-000000000007', 'crustacean', 'Giáp xác', '70020000-0000-0000-0000-000000000005'),
  ('70020000-0000-0000-0000-000000000008', 'mollusc', 'Nhuyễn thể', '70020000-0000-0000-0000-000000000005'),
  ('70020000-0000-0000-0000-000000000009', 'egg', 'Trứng', '70020000-0000-0000-0000-000000000001'),
  ('70020000-0000-0000-0000-000000000010', 'dairy', 'Sữa', '70020000-0000-0000-0000-000000000001'),
  ('70020000-0000-0000-0000-000000000011', 'tofu', 'Đậu hũ', '70020000-0000-0000-0000-000000000001'),
  ('70020000-0000-0000-0000-000000000012', 'vegetable', 'Rau', '70020000-0000-0000-0000-000000000001'),
  ('70020000-0000-0000-0000-000000000013', 'staple', 'Lương thực chính', '70020000-0000-0000-0000-000000000001'),
  ('70020000-0000-0000-0000-000000000014', 'seasoning', 'Gia vị', '70020000-0000-0000-0000-000000000001');

create table public.allergens (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_vi text not null check (char_length(btrim(name_vi)) between 1 and 80),
  created_at timestamptz not null default now()
);

insert into public.allergens (id, code, name_vi)
values
  ('70030000-0000-0000-0000-000000000001', 'peanut', 'Đậu phộng'),
  ('70030000-0000-0000-0000-000000000002', 'tree_nut', 'Hạt cây'),
  ('70030000-0000-0000-0000-000000000003', 'dairy', 'Sữa'),
  ('70030000-0000-0000-0000-000000000004', 'egg', 'Trứng'),
  ('70030000-0000-0000-0000-000000000005', 'soy', 'Đậu nành'),
  ('70030000-0000-0000-0000-000000000006', 'wheat', 'Lúa mì'),
  ('70030000-0000-0000-0000-000000000007', 'fish', 'Cá'),
  ('70030000-0000-0000-0000-000000000008', 'crustacean', 'Giáp xác'),
  ('70030000-0000-0000-0000-000000000009', 'mollusc', 'Nhuyễn thể'),
  ('70030000-0000-0000-0000-000000000010', 'sesame', 'Mè');

create table public.dietary_tags (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_vi text not null check (char_length(btrim(name_vi)) between 1 and 80),
  created_at timestamptz not null default now()
);

insert into public.dietary_tags (id, code, name_vi)
values ('70040000-0000-0000-0000-000000000001', 'vegetarian', 'Phù hợp ăn chay');

create table public.nutrients (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_vi text not null check (char_length(btrim(name_vi)) between 1 and 80),
  unit_code text not null check (unit_code in ('kcal', 'g', 'mg', 'mcg')),
  display_precision smallint not null check (display_precision between 0 and 6),
  required_for_publication boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.nutrients (
  id, code, name_vi, unit_code, display_precision, required_for_publication
)
values
  ('70050000-0000-0000-0000-000000000001', 'energy_kcal', 'Năng lượng', 'kcal', 0, true),
  ('70050000-0000-0000-0000-000000000002', 'protein_g', 'Chất đạm', 'g', 1, true),
  ('70050000-0000-0000-0000-000000000003', 'carbohydrate_g', 'Carbohydrate', 'g', 1, true),
  ('70050000-0000-0000-0000-000000000004', 'fat_g', 'Chất béo', 'g', 1, true),
  ('70050000-0000-0000-0000-000000000005', 'fibre_g', 'Chất xơ', 'g', 1, true),
  ('70050000-0000-0000-0000-000000000006', 'sodium_mg', 'Natri', 'mg', 0, true);

create table public.price_regions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_vi text not null check (char_length(btrim(name_vi)) between 1 and 80),
  is_launch_default boolean not null default false,
  current_price_book_id uuid,
  created_at timestamptz not null default now(),
  unique (id, current_price_book_id)
);

create unique index price_regions_one_launch_default_idx
on public.price_regions (is_launch_default)
where is_launch_default;

insert into public.price_regions (id, code, name_vi, is_launch_default)
values ('70060000-0000-0000-0000-000000000001', 'vn_baseline', 'Giá tham khảo Việt Nam', true);

alter table public.households
add column price_region_id uuid default '70060000-0000-0000-0000-000000000001';
update public.households
set price_region_id = '70060000-0000-0000-0000-000000000001'
where price_region_id is null;
alter table public.households alter column price_region_id set not null;
alter table public.households
add constraint households_price_region_id_fkey
foreign key (price_region_id) references public.price_regions (id) on delete restrict;

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_vi text not null check (char_length(btrim(name_vi)) between 1 and 120),
  base_dimension public.catalog_dimension not null,
  base_unit_id uuid not null,
  status public.catalog_identity_status not null default 'draft',
  revision integer not null default 1 check (revision > 0),
  current_fact_version_id uuid,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, base_unit_id),
  unique (id, current_fact_version_id),
  constraint foods_base_unit_dimension_fkey
    foreign key (base_unit_id, base_dimension)
    references public.units (id, dimension) on delete restrict,
  check (
    (status = 'draft' and current_fact_version_id is null and retired_at is null)
    or (status = 'published' and current_fact_version_id is not null and retired_at is null)
    or (status = 'retired' and current_fact_version_id is not null and retired_at is not null)
  )
);

create table public.food_fact_versions (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods (id) on delete restrict,
  version_number integer not null check (version_number > 0),
  revision integer not null default 1 check (revision > 0),
  category_id uuid not null references public.food_categories (id) on delete restrict,
  nutrition_basis text not null default 'per_100g_edible'
    check (nutrition_basis = 'per_100g_edible'),
  edible_fraction numeric(8, 6) not null check (edible_fraction > 0 and edible_fraction <= 1),
  provenance text not null check (char_length(btrim(provenance)) between 1 and 500),
  assessment_completed_at timestamptz,
  publication_status public.catalog_publication_status not null default 'draft',
  content_hash text,
  published_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (food_id, version_number),
  unique (food_id, id),
  check (
    (publication_status = 'draft' and content_hash is null and published_at is null and assessment_completed_at is null)
    or (
      publication_status = 'published'
      and content_hash ~ '^[0-9a-f]{64}$'
      and published_at is not null
      and assessment_completed_at is not null
    )
  )
);

create unique index food_fact_versions_one_draft_per_food_idx
on public.food_fact_versions (food_id)
where publication_status = 'draft';

alter table public.foods
add constraint foods_current_fact_version_fkey
foreign key (id, current_fact_version_id)
references public.food_fact_versions (food_id, id) on delete restrict;

create table public.food_fact_unit_conversions (
  food_fact_version_id uuid not null references public.food_fact_versions (id) on delete restrict,
  unit_id uuid not null references public.units (id) on delete restrict,
  base_quantity_per_unit numeric(18, 6) not null check (base_quantity_per_unit > 0),
  gross_grams_per_unit numeric(18, 6) not null check (gross_grams_per_unit > 0),
  display_step numeric(18, 6) not null check (display_step > 0),
  provenance text not null check (char_length(btrim(provenance)) between 1 and 500),
  primary key (food_fact_version_id, unit_id)
);

create table public.food_fact_allergen_assessments (
  food_fact_version_id uuid not null references public.food_fact_versions (id) on delete restrict,
  allergen_id uuid not null references public.allergens (id) on delete restrict,
  assessment public.allergen_assessment_status not null,
  provenance text not null check (char_length(btrim(provenance)) between 1 and 500),
  primary key (food_fact_version_id, allergen_id)
);

create table public.food_fact_dietary_tags (
  food_fact_version_id uuid not null references public.food_fact_versions (id) on delete restrict,
  dietary_tag_id uuid not null references public.dietary_tags (id) on delete restrict,
  primary key (food_fact_version_id, dietary_tag_id)
);

create table public.food_fact_nutrients (
  food_fact_version_id uuid not null references public.food_fact_versions (id) on delete restrict,
  nutrient_id uuid not null references public.nutrients (id) on delete restrict,
  amount_per_100g numeric(18, 6) not null check (amount_per_100g >= 0),
  provenance text not null check (char_length(btrim(provenance)) between 1 and 500),
  primary key (food_fact_version_id, nutrient_id)
);

create table public.household_rule_catalog_targets (
  rule_code text primary key references public.household_rule_options (code) on delete restrict,
  mapping_kind public.household_rule_catalog_mapping_kind not null,
  allergen_id uuid references public.allergens (id) on delete restrict,
  category_id uuid references public.food_categories (id) on delete restrict,
  dietary_tag_id uuid references public.dietary_tags (id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (mapping_kind = 'allergen' and allergen_id is not null and category_id is null and dietary_tag_id is null)
    or (mapping_kind = 'category' and allergen_id is null and category_id is not null and dietary_tag_id is null)
    or (mapping_kind = 'required_tag' and allergen_id is null and category_id is null and dietary_tag_id is not null)
    or (mapping_kind = 'unsupported' and allergen_id is null and category_id is null and dietary_tag_id is null)
  )
);

insert into public.household_rule_catalog_targets (
  rule_code, mapping_kind, allergen_id, category_id, dietary_tag_id
)
select mapping.rule_code, mapping.mapping_kind::public.household_rule_catalog_mapping_kind,
  allergen.id, category.id, tag.id
from (
  values
    ('allergen_peanut', 'allergen', 'peanut', null, null),
    ('allergen_tree_nut', 'allergen', 'tree_nut', null, null),
    ('allergen_milk', 'allergen', 'dairy', null, null),
    ('allergen_egg', 'allergen', 'egg', null, null),
    ('allergen_soy', 'allergen', 'soy', null, null),
    ('allergen_wheat', 'allergen', 'wheat', null, null),
    ('allergen_fish', 'allergen', 'fish', null, null),
    ('allergen_crustacean', 'allergen', 'crustacean', null, null),
    ('allergen_mollusc', 'allergen', 'mollusc', null, null),
    ('allergen_sesame', 'allergen', 'sesame', null, null),
    ('allergen_other', 'unsupported', null, null, null),
    ('exclude_pork', 'category', null, 'pork', null),
    ('exclude_beef', 'category', null, 'beef', null),
    ('exclude_poultry', 'category', null, 'poultry', null),
    ('exclude_seafood', 'category', null, 'seafood', null),
    ('exclude_egg', 'category', null, 'egg', null),
    ('exclude_dairy', 'category', null, 'dairy', null),
    ('diet_vegetarian', 'required_tag', null, null, 'vegetarian')
) as mapping(rule_code, mapping_kind, allergen_code, category_code, tag_code)
left join public.allergens as allergen on allergen.code = mapping.allergen_code
left join public.food_categories as category on category.code = mapping.category_code
left join public.dietary_tags as tag on tag.code = mapping.tag_code;

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_vi text not null check (char_length(btrim(name_vi)) between 1 and 120),
  status public.catalog_identity_status not null default 'draft',
  revision integer not null default 1 check (revision > 0),
  current_version_id uuid,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, current_version_id),
  check (
    (status = 'draft' and current_version_id is null and retired_at is null)
    or (status = 'published' and current_version_id is not null and retired_at is null)
    or (status = 'retired' and current_version_id is not null and retired_at is not null)
  )
);

create table public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete restrict,
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
  unique (recipe_id, version_number),
  unique (recipe_id, id),
  check (
    (publication_status = 'draft' and content_hash is null and published_at is null)
    or (
      publication_status = 'published'
      and content_hash ~ '^[0-9a-f]{64}$'
      and published_at is not null
    )
  )
);

create unique index recipe_versions_one_draft_per_recipe_idx
on public.recipe_versions (recipe_id)
where publication_status = 'draft';

alter table public.recipes
add constraint recipes_current_version_fkey
foreign key (id, current_version_id)
references public.recipe_versions (recipe_id, id) on delete restrict;

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_version_id uuid not null references public.recipe_versions (id) on delete restrict,
  food_id uuid not null,
  food_fact_version_id uuid not null,
  quantity numeric(18, 6) not null check (quantity > 0),
  unit_id uuid not null references public.units (id) on delete restrict,
  preparation_note_vi text check (
    preparation_note_vi is null
    or char_length(btrim(preparation_note_vi)) between 1 and 120
  ),
  sort_order smallint not null check (sort_order > 0),
  unique (recipe_version_id, food_id),
  unique (recipe_version_id, sort_order),
  unique (recipe_version_id, id),
  constraint recipe_ingredients_food_fact_fkey
    foreign key (food_id, food_fact_version_id)
    references public.food_fact_versions (food_id, id) on delete restrict
);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_version_id uuid not null references public.recipe_versions (id) on delete restrict,
  sort_order smallint not null check (sort_order > 0),
  instruction_vi text not null check (
    instruction_vi = btrim(instruction_vi)
    and char_length(instruction_vi) between 1 and 500
  ),
  timer_minutes smallint check (timer_minutes between 0 and 180),
  unique (recipe_version_id, sort_order),
  unique (recipe_version_id, id)
);

create table public.recipe_step_ingredients (
  recipe_version_id uuid not null references public.recipe_versions (id) on delete restrict,
  recipe_step_id uuid not null,
  recipe_ingredient_id uuid not null,
  reference_order smallint not null check (reference_order > 0),
  primary key (recipe_step_id, recipe_ingredient_id),
  unique (recipe_step_id, reference_order),
  constraint recipe_step_ingredients_step_fkey
    foreign key (recipe_version_id, recipe_step_id)
    references public.recipe_steps (recipe_version_id, id) on delete restrict,
  constraint recipe_step_ingredients_ingredient_fkey
    foreign key (recipe_version_id, recipe_ingredient_id)
    references public.recipe_ingredients (recipe_version_id, id) on delete restrict
);

create table public.recipe_tags (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_vi text not null check (char_length(btrim(name_vi)) between 1 and 80),
  tag_kind public.recipe_tag_kind not null,
  created_at timestamptz not null default now()
);

insert into public.recipe_tags (id, code, name_vi, tag_kind)
values
  ('70070000-0000-0000-0000-000000000001', 'style_boil', 'Luộc', 'cooking_style'),
  ('70070000-0000-0000-0000-000000000002', 'style_braise', 'Kho', 'cooking_style'),
  ('70070000-0000-0000-0000-000000000003', 'style_fry', 'Chiên', 'cooking_style'),
  ('70070000-0000-0000-0000-000000000004', 'style_grill', 'Nướng', 'cooking_style'),
  ('70070000-0000-0000-0000-000000000005', 'style_steam', 'Hấp', 'cooking_style'),
  ('70070000-0000-0000-0000-000000000006', 'style_stir_fry', 'Xào', 'cooking_style'),
  ('70070000-0000-0000-0000-000000000007', 'protein_pork', 'Heo', 'protein_hint'),
  ('70070000-0000-0000-0000-000000000008', 'protein_beef', 'Bò', 'protein_hint'),
  ('70070000-0000-0000-0000-000000000009', 'protein_poultry', 'Gia cầm', 'protein_hint'),
  ('70070000-0000-0000-0000-000000000010', 'protein_fish', 'Cá', 'protein_hint'),
  ('70070000-0000-0000-0000-000000000011', 'protein_seafood', 'Hải sản', 'protein_hint'),
  ('70070000-0000-0000-0000-000000000012', 'protein_plant', 'Đạm thực vật', 'protein_hint'),
  ('70070000-0000-0000-0000-000000000013', 'role_staple', 'Món tinh bột', 'dish_role'),
  ('70070000-0000-0000-0000-000000000014', 'role_main', 'Món chính', 'dish_role'),
  ('70070000-0000-0000-0000-000000000015', 'role_vegetable', 'Món rau', 'dish_role'),
  ('70070000-0000-0000-0000-000000000016', 'role_soup', 'Món canh', 'dish_role'),
  ('70070000-0000-0000-0000-000000000017', 'role_side', 'Món phụ', 'dish_role');

create table public.recipe_version_tags (
  recipe_version_id uuid not null references public.recipe_versions (id) on delete restrict,
  recipe_tag_id uuid not null references public.recipe_tags (id) on delete restrict,
  primary key (recipe_version_id, recipe_tag_id)
);

create table public.price_books (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.price_regions (id) on delete restrict,
  version_number integer not null check (version_number > 0),
  revision integer not null default 1 check (revision > 0),
  effective_from date not null,
  effective_to date check (effective_to is null or effective_to >= effective_from),
  publication_status public.catalog_publication_status not null default 'draft',
  content_hash text,
  published_at timestamptz,
  retired_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (region_id, version_number),
  unique (region_id, id),
  check (
    (publication_status = 'draft' and content_hash is null and published_at is null and retired_at is null)
    or (
      publication_status = 'published'
      and content_hash ~ '^[0-9a-f]{64}$'
      and published_at is not null
    )
  )
);

create unique index price_books_one_draft_per_region_idx
on public.price_books (region_id)
where publication_status = 'draft';

alter table public.price_regions
add constraint price_regions_current_book_fkey
foreign key (id, current_price_book_id)
references public.price_books (region_id, id) on delete restrict;

create table public.food_prices (
  id uuid primary key default gen_random_uuid(),
  price_book_id uuid not null references public.price_books (id) on delete restrict,
  food_id uuid not null,
  food_fact_version_id uuid not null,
  package_quantity numeric(18, 6) not null check (package_quantity > 0),
  package_unit_id uuid not null references public.units (id) on delete restrict,
  package_base_quantity numeric(18, 6) not null check (package_base_quantity > 0),
  base_unit_id uuid not null,
  package_price_vnd bigint not null check (package_price_vnd between 1 and 9007199254740991),
  purchase_increment numeric(18, 6) not null check (purchase_increment > 0),
  observed_at date not null,
  source_reference text not null check (char_length(btrim(source_reference)) between 1 and 500),
  unique (price_book_id, food_id),
  constraint food_prices_food_fact_fkey
    foreign key (food_id, food_fact_version_id)
    references public.food_fact_versions (food_id, id) on delete restrict,
  constraint food_prices_food_base_unit_fkey
    foreign key (food_id, base_unit_id)
    references public.foods (id, base_unit_id) on delete restrict
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_kind public.catalog_actor_kind not null,
  actor_user_id uuid references auth.users (id) on delete restrict,
  actor_identifier text,
  action text not null check (action ~ '^[a-z][a-z0-9_]*$'),
  entity_type text not null check (entity_type ~ '^[a-z][a-z0-9_]*$'),
  entity_id uuid not null,
  before_summary jsonb,
  after_summary jsonb,
  created_at timestamptz not null default now(),
  check (
    (actor_kind = 'admin_user' and actor_user_id is not null and actor_identifier is null)
    or (
      actor_kind = 'trusted_operation'
      and actor_user_id is null
      and char_length(btrim(actor_identifier)) between 1 and 120
    )
  ),
  check (before_summary is null or octet_length(before_summary::text) <= 4000),
  check (after_summary is null or octet_length(after_summary::text) <= 4000)
);

create index admin_audit_log_entity_created_idx
on public.admin_audit_log (entity_type, entity_id, created_at desc);

create table private.catalog_transition_context (
  backend_pid integer not null,
  transaction_id bigint not null,
  primary key (backend_pid, transaction_id)
);

revoke all on table private.catalog_transition_context from public, anon, authenticated, service_role;

create function private.begin_catalog_transition()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into private.catalog_transition_context (backend_pid, transaction_id)
  values (pg_backend_pid(), txid_current())
  on conflict do nothing;
$$;

create function private.end_catalog_transition()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from private.catalog_transition_context
  where backend_pid = pg_backend_pid() and transaction_id = txid_current();
$$;

create function private.catalog_transition_is_trusted()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.catalog_transition_context
    where backend_pid = pg_backend_pid() and transaction_id = txid_current()
  );
$$;

revoke all on function private.begin_catalog_transition() from public, anon, authenticated, service_role;
revoke all on function private.end_catalog_transition() from public, anon, authenticated, service_role;
revoke all on function private.catalog_transition_is_trusted() from public, anon, authenticated;

create function private.assert_catalog_admin(p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from auth.users as actor
    where actor.id = p_actor_user_id
      and actor.raw_app_meta_data ->> 'role' = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
end;
$$;

revoke all on function private.assert_catalog_admin(uuid) from public, anon, authenticated;

create function private.prevent_household_price_region_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.price_region_id := coalesce(
      new.price_region_id,
      '70060000-0000-0000-0000-000000000001'::uuid
    );
  elsif new.price_region_id is distinct from old.price_region_id then
    raise exception using errcode = '23514', message = 'PRICE_REGION_MANAGED_BY_DATABASE';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_household_price_region_change()
from public, anon, authenticated;

create trigger households_protect_price_region
before insert or update of price_region_id on public.households
for each row execute function private.prevent_household_price_region_change();

create function private.prevent_category_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id or exists (
    with recursive ancestors(id, parent_id) as (
      select category.id, category.parent_id
      from public.food_categories as category
      where category.id = new.parent_id
      union all
      select parent.id, parent.parent_id
      from public.food_categories as parent
      join ancestors on ancestors.parent_id = parent.id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception using errcode = '23514', message = 'FOOD_CATEGORY_CYCLE';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_category_cycle() from public, anon, authenticated;

create trigger food_categories_prevent_cycle
before insert or update of parent_id on public.food_categories
for each row execute function private.prevent_category_cycle();

create function private.protect_food_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.current_fact_version_id is not null or new.retired_at is not null then
      raise exception using errcode = '23514', message = 'FOOD_MUST_START_DRAFT';
    end if;
    return new;
  end if;
  if private.catalog_transition_is_trusted() then
    return new;
  end if;
  if new.status is distinct from old.status
    or new.current_fact_version_id is distinct from old.current_fact_version_id
    or new.retired_at is distinct from old.retired_at then
    raise exception using errcode = '42501', message = 'FOOD_LIFECYCLE_RPC_REQUIRED';
  end if;
  if exists (select 1 from public.food_fact_versions where food_id = old.id)
    and (
      new.code is distinct from old.code
      or new.base_dimension is distinct from old.base_dimension
      or new.base_unit_id is distinct from old.base_unit_id
    ) then
    raise exception using errcode = '23514', message = 'FOOD_CALCULATION_IDENTITY_IMMUTABLE';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.protect_food_identity() from public, anon, authenticated;

create trigger foods_protect_identity
before insert or update on public.foods
for each row execute function private.protect_food_identity();

create function private.protect_recipe_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.current_version_id is not null or new.retired_at is not null then
      raise exception using errcode = '23514', message = 'RECIPE_MUST_START_DRAFT';
    end if;
    return new;
  end if;
  if private.catalog_transition_is_trusted() then
    return new;
  end if;
  if new.status is distinct from old.status
    or new.current_version_id is distinct from old.current_version_id
    or new.retired_at is distinct from old.retired_at then
    raise exception using errcode = '42501', message = 'RECIPE_LIFECYCLE_RPC_REQUIRED';
  end if;
  if exists (select 1 from public.recipe_versions where recipe_id = old.id)
    and new.code is distinct from old.code then
    raise exception using errcode = '23514', message = 'RECIPE_CODE_IMMUTABLE';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.protect_recipe_identity() from public, anon, authenticated;

create trigger recipes_protect_identity
before insert or update on public.recipes
for each row execute function private.protect_recipe_identity();

create function private.protect_catalog_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.publication_status <> 'draft' or new.content_hash is not null or new.published_at is not null then
      raise exception using errcode = '23514', message = 'CATALOG_VERSION_MUST_START_DRAFT';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.publication_status = 'published' then
      raise exception using errcode = '23514', message = 'PUBLISHED_CATALOG_VERSION_IMMUTABLE';
    end if;
    return old;
  end if;
  if private.catalog_transition_is_trusted() then
    return new;
  end if;
  if old.publication_status = 'published' then
    raise exception using errcode = '23514', message = 'PUBLISHED_CATALOG_VERSION_IMMUTABLE';
  end if;
  if new.publication_status is distinct from old.publication_status
    or new.content_hash is distinct from old.content_hash
    or new.published_at is distinct from old.published_at then
    raise exception using errcode = '42501', message = 'CATALOG_PUBLICATION_RPC_REQUIRED';
  end if;
  if tg_table_name = 'food_fact_versions' then
    if new.assessment_completed_at is distinct from old.assessment_completed_at then
      raise exception using errcode = '42501', message = 'CATALOG_PUBLICATION_RPC_REQUIRED';
    end if;
  end if;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.protect_catalog_version() from public, anon, authenticated;

create trigger food_fact_versions_protect_lifecycle
before insert or update or delete on public.food_fact_versions
for each row execute function private.protect_catalog_version();
create trigger recipe_versions_protect_lifecycle
before insert or update or delete on public.recipe_versions
for each row execute function private.protect_catalog_version();

create function private.protect_price_book()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.publication_status <> 'draft' or new.content_hash is not null
      or new.published_at is not null or new.retired_at is not null then
      raise exception using errcode = '23514', message = 'PRICE_BOOK_MUST_START_DRAFT';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.publication_status = 'published' then
      raise exception using errcode = '23514', message = 'PUBLISHED_PRICE_BOOK_IMMUTABLE';
    end if;
    return old;
  end if;
  if private.catalog_transition_is_trusted() then
    return new;
  end if;
  if old.publication_status = 'published' then
    raise exception using errcode = '23514', message = 'PUBLISHED_PRICE_BOOK_IMMUTABLE';
  end if;
  if new.publication_status is distinct from old.publication_status
    or new.content_hash is distinct from old.content_hash
    or new.published_at is distinct from old.published_at
    or new.retired_at is distinct from old.retired_at then
    raise exception using errcode = '42501', message = 'PRICE_BOOK_LIFECYCLE_RPC_REQUIRED';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.protect_price_book() from public, anon, authenticated;

create trigger price_books_protect_lifecycle
before insert or update or delete on public.price_books
for each row execute function private.protect_price_book();

create function private.protect_price_region_pointer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.current_price_book_id is distinct from old.current_price_book_id
    and not private.catalog_transition_is_trusted() then
    raise exception using errcode = '42501', message = 'PRICE_BOOK_DISCOVERY_RPC_REQUIRED';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_price_region_pointer() from public, anon, authenticated;

create trigger price_regions_protect_pointer
before update of current_price_book_id on public.price_regions
for each row execute function private.protect_price_region_pointer();

create function private.protect_food_fact_child()
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
    v_old_parent := old.food_fact_version_id;
    if exists (
      select 1 from public.food_fact_versions
      where id = v_old_parent and publication_status = 'published'
    ) then
      raise exception using errcode = '23514', message = 'PUBLISHED_FOOD_FACT_CHILD_IMMUTABLE';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_parent := new.food_fact_version_id;
    if exists (
      select 1 from public.food_fact_versions
      where id = v_new_parent and publication_status = 'published'
    ) then
      raise exception using errcode = '23514', message = 'PUBLISHED_FOOD_FACT_CHILD_IMMUTABLE';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_food_fact_child() from public, anon, authenticated;

create trigger food_fact_conversions_protect_published
before insert or update or delete on public.food_fact_unit_conversions
for each row execute function private.protect_food_fact_child();
create trigger food_fact_assessments_protect_published
before insert or update or delete on public.food_fact_allergen_assessments
for each row execute function private.protect_food_fact_child();
create trigger food_fact_tags_protect_published
before insert or update or delete on public.food_fact_dietary_tags
for each row execute function private.protect_food_fact_child();
create trigger food_fact_nutrients_protect_published
before insert or update or delete on public.food_fact_nutrients
for each row execute function private.protect_food_fact_child();

create function private.protect_recipe_child()
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
    v_old_parent := old.recipe_version_id;
    if exists (
      select 1 from public.recipe_versions
      where id = v_old_parent and publication_status = 'published'
    ) then
      raise exception using errcode = '23514', message = 'PUBLISHED_RECIPE_CHILD_IMMUTABLE';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_parent := new.recipe_version_id;
    if exists (
      select 1 from public.recipe_versions
      where id = v_new_parent and publication_status = 'published'
    ) then
      raise exception using errcode = '23514', message = 'PUBLISHED_RECIPE_CHILD_IMMUTABLE';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_recipe_child() from public, anon, authenticated;

create trigger recipe_ingredients_protect_published
before insert or update or delete on public.recipe_ingredients
for each row execute function private.protect_recipe_child();
create trigger recipe_steps_protect_published
before insert or update or delete on public.recipe_steps
for each row execute function private.protect_recipe_child();
create trigger recipe_step_ingredients_protect_published
before insert or update or delete on public.recipe_step_ingredients
for each row execute function private.protect_recipe_child();
create trigger recipe_version_tags_protect_published
before insert or update or delete on public.recipe_version_tags
for each row execute function private.protect_recipe_child();

create function private.validate_recipe_step_timer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_elapsed smallint;
begin
  select elapsed_minutes into v_elapsed
  from public.recipe_versions where id = new.recipe_version_id;
  if new.timer_minutes is not null and new.timer_minutes > v_elapsed then
    raise exception using errcode = '23514', message = 'RECIPE_STEP_TIMER_EXCEEDS_ELAPSED_TIME';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_recipe_step_timer() from public, anon, authenticated;

create trigger recipe_steps_validate_timer
before insert or update on public.recipe_steps
for each row execute function private.validate_recipe_step_timer();

create function private.protect_price_child()
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
    v_old_parent := old.price_book_id;
    if exists (
      select 1 from public.price_books
      where id = v_old_parent and publication_status = 'published'
    ) then
      raise exception using errcode = '23514', message = 'PUBLISHED_PRICE_IMMUTABLE';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_parent := new.price_book_id;
    if exists (
      select 1 from public.price_books
      where id = v_new_parent and publication_status = 'published'
    ) then
      raise exception using errcode = '23514', message = 'PUBLISHED_PRICE_IMMUTABLE';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_price_child() from public, anon, authenticated;

create trigger food_prices_protect_published
before insert or update or delete on public.food_prices
for each row execute function private.protect_price_child();

create function private.validate_food_price_normalization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_unit_id uuid;
  v_base_quantity_per_unit numeric(18, 6);
  v_fact_status public.catalog_publication_status;
begin
  if new.observed_at > current_date then
    raise exception using errcode = '23514', message = 'FUTURE_PRICE';
  end if;
  select food.base_unit_id into v_base_unit_id
  from public.foods as food where food.id = new.food_id;
  if v_base_unit_id is distinct from new.base_unit_id then
    raise exception using errcode = '23514', message = 'PRICE_BASE_UNIT_MISMATCH';
  end if;
  select conversion.base_quantity_per_unit, fact.publication_status
  into v_base_quantity_per_unit, v_fact_status
  from public.food_fact_unit_conversions as conversion
  join public.food_fact_versions as fact on fact.id = conversion.food_fact_version_id
  where conversion.food_fact_version_id = new.food_fact_version_id
    and conversion.unit_id = new.package_unit_id;
  if not found or v_fact_status <> 'published' then
    raise exception using errcode = '23514', message = 'PRICE_REQUIRES_PUBLISHED_FACT_CONVERSION';
  end if;
  if new.package_base_quantity <> new.package_quantity * v_base_quantity_per_unit then
    raise exception using errcode = '23514', message = 'PRICE_PACKAGE_NORMALIZATION_MISMATCH';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_food_price_normalization() from public, anon, authenticated;

create trigger food_prices_validate_normalization
before insert or update on public.food_prices
for each row execute function private.validate_food_price_normalization();

create function private.prevent_catalog_mapping_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '23514', message = 'CATALOG_MAPPING_IMMUTABLE';
end;
$$;

revoke all on function private.prevent_catalog_mapping_mutation() from public, anon, authenticated;

create trigger household_rule_catalog_targets_immutable
before insert or update or delete on public.household_rule_catalog_targets
for each row execute function private.prevent_catalog_mapping_mutation();

create function private.assert_hard_rule_catalog_mapping_complete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.household_rule_options as option
    left join public.household_rule_catalog_targets as target on target.rule_code = option.code
    where option.rule_kind <> 'soft_preference' and target.rule_code is null
  ) or exists (
    select 1
    from public.household_rule_options as option
    join public.household_rule_catalog_targets as target on target.rule_code = option.code
    where option.rule_kind = 'soft_preference'
  ) then
    raise exception using errcode = '23514', message = 'INCOMPLETE_HARD_RULE_CATALOG_MAPPING';
  end if;
  return null;
end;
$$;

revoke all on function private.assert_hard_rule_catalog_mapping_complete()
from public, anon, authenticated;

create constraint trigger household_rule_options_require_catalog_mapping
after insert or update or delete on public.household_rule_options
deferrable initially immediate
for each row execute function private.assert_hard_rule_catalog_mapping_complete();
create constraint trigger household_rule_targets_require_complete_mapping
after insert or update or delete on public.household_rule_catalog_targets
deferrable initially immediate
for each row execute function private.assert_hard_rule_catalog_mapping_complete();

create function private.prevent_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '23514', message = 'CATALOG_AUDIT_APPEND_ONLY';
end;
$$;

revoke all on function private.prevent_audit_mutation() from public, anon, authenticated;

create trigger admin_audit_log_append_only
before update or delete on public.admin_audit_log
for each row execute function private.prevent_audit_mutation();

create function public.publish_food_fact_version(
  p_food_fact_version_id uuid,
  p_content_hash text,
  p_actor_user_id uuid,
  p_expected_revision integer
)
returns public.food_fact_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fact public.food_fact_versions;
  v_food public.foods;
begin
  perform private.assert_catalog_admin(p_actor_user_id);
  if p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_CONTENT_HASH';
  end if;
  select * into v_fact
  from public.food_fact_versions
  where id = p_food_fact_version_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'FOOD_FACT_NOT_FOUND';
  end if;
  if v_fact.publication_status <> 'draft' or v_fact.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'STALE_CATALOG_REVISION';
  end if;
  select * into v_food from public.foods where id = v_fact.food_id for update;

  if (
    select count(*) <> (select count(*) from public.allergens)
      or bool_or(assessment = 'unknown')
    from public.food_fact_allergen_assessments
    where food_fact_version_id = v_fact.id
  ) then
    raise exception using errcode = '23514', message = 'INCOMPLETE_ALLERGEN_LINEAGE';
  end if;
  if (
    select count(*) <> (select count(*) from public.nutrients where required_for_publication)
    from public.food_fact_nutrients as amount
    join public.nutrients as nutrient on nutrient.id = amount.nutrient_id
    where amount.food_fact_version_id = v_fact.id
      and nutrient.required_for_publication
  ) then
    raise exception using errcode = '23514', message = 'INCOMPLETE_NUTRITION';
  end if;
  if not exists (
    select 1 from public.food_fact_unit_conversions
    where food_fact_version_id = v_fact.id and unit_id = v_food.base_unit_id
  ) then
    raise exception using errcode = '23514', message = 'MISSING_BASE_UNIT_CONVERSION';
  end if;
  if exists (
    select 1
    from public.food_fact_unit_conversions as conversion
    join public.units as source_unit on source_unit.id = conversion.unit_id
    join public.units as base_unit on base_unit.id = v_food.base_unit_id
    where conversion.food_fact_version_id = v_fact.id
      and (
        (
          source_unit.dimension = base_unit.dimension
          and conversion.base_quantity_per_unit <> source_unit.to_dimension_base / base_unit.to_dimension_base
        )
        or (
          source_unit.dimension = 'mass'
          and conversion.gross_grams_per_unit <> source_unit.to_dimension_base
        )
      )
  ) then
    raise exception using errcode = '23514', message = 'INVALID_UNIT_CONVERSION';
  end if;

  perform private.begin_catalog_transition();
  update public.food_fact_versions
  set
    publication_status = 'published',
    content_hash = p_content_hash,
    assessment_completed_at = now(),
    published_at = now(),
    revision = revision + 1,
    updated_at = now()
  where id = v_fact.id
  returning * into v_fact;
  update public.foods
  set
    status = 'published',
    current_fact_version_id = v_fact.id,
    retired_at = null,
    revision = revision + 1,
    updated_at = now()
  where id = v_fact.food_id;
  insert into public.admin_audit_log (
    actor_kind, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    'admin_user', p_actor_user_id, 'publish', 'food_fact_version', v_fact.id,
    jsonb_build_object('contentHash', p_content_hash, 'versionNumber', v_fact.version_number)
  );
  perform private.end_catalog_transition();
  return v_fact;
end;
$$;

create function public.publish_recipe_version(
  p_recipe_version_id uuid,
  p_content_hash text,
  p_actor_user_id uuid,
  p_expected_revision integer
)
returns public.recipe_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.recipe_versions;
  v_ingredient_count integer;
  v_step_count integer;
begin
  perform private.assert_catalog_admin(p_actor_user_id);
  if p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_CONTENT_HASH';
  end if;
  select * into v_version
  from public.recipe_versions
  where id = p_recipe_version_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'RECIPE_VERSION_NOT_FOUND';
  end if;
  if v_version.publication_status <> 'draft' or v_version.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'STALE_CATALOG_REVISION';
  end if;
  perform 1 from public.recipes where id = v_version.recipe_id for update;

  select count(*)::integer into v_ingredient_count
  from public.recipe_ingredients where recipe_version_id = v_version.id;
  if v_ingredient_count < 1 or exists (
    select 1
    from public.recipe_ingredients as ingredient
    join public.food_fact_versions as fact on fact.id = ingredient.food_fact_version_id
    left join public.food_fact_unit_conversions as conversion
      on conversion.food_fact_version_id = ingredient.food_fact_version_id
      and conversion.unit_id = ingredient.unit_id
    where ingredient.recipe_version_id = v_version.id
      and (fact.publication_status <> 'published' or conversion.unit_id is null)
  ) or (
    select coalesce(min(sort_order), 0) <> 1
      or coalesce(max(sort_order), 0) <> v_ingredient_count
      or count(distinct sort_order) <> v_ingredient_count
    from public.recipe_ingredients
    where recipe_version_id = v_version.id
  ) then
    raise exception using errcode = '23514', message = 'INCOMPLETE_STRUCTURED_INGREDIENTS';
  end if;

  select count(*)::integer into v_step_count
  from public.recipe_steps where recipe_version_id = v_version.id;
  if v_step_count < 1 or exists (
    select 1 from public.recipe_steps
    where recipe_version_id = v_version.id
      and timer_minutes is not null
      and timer_minutes > v_version.elapsed_minutes
  ) or exists (
    select 1
    from public.recipe_step_ingredients
    where recipe_version_id = v_version.id
    group by recipe_step_id
    having min(reference_order) <> 1
      or max(reference_order) <> count(*)
      or count(distinct reference_order) <> count(*)
  ) or (
    select coalesce(min(sort_order), 0) <> 1
      or coalesce(max(sort_order), 0) <> v_step_count
      or count(distinct sort_order) <> v_step_count
    from public.recipe_steps
    where recipe_version_id = v_version.id
  ) then
    raise exception using errcode = '23514', message = 'INVALID_RECIPE_STEPS';
  end if;

  perform private.begin_catalog_transition();
  update public.recipe_versions
  set
    publication_status = 'published',
    content_hash = p_content_hash,
    published_at = now(),
    revision = revision + 1,
    updated_at = now()
  where id = v_version.id
  returning * into v_version;
  update public.recipes
  set
    status = 'published',
    current_version_id = v_version.id,
    retired_at = null,
    revision = revision + 1,
    updated_at = now()
  where id = v_version.recipe_id;
  insert into public.admin_audit_log (
    actor_kind, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    'admin_user', p_actor_user_id, 'publish', 'recipe_version', v_version.id,
    jsonb_build_object('contentHash', p_content_hash, 'versionNumber', v_version.version_number)
  );
  perform private.end_catalog_transition();
  return v_version;
end;
$$;

create function public.publish_price_book(
  p_price_book_id uuid,
  p_content_hash text,
  p_actor_user_id uuid,
  p_expected_revision integer
)
returns public.price_books
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.price_books;
begin
  perform private.assert_catalog_admin(p_actor_user_id);
  if p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_CONTENT_HASH';
  end if;
  select * into v_book
  from public.price_books
  where id = p_price_book_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PRICE_BOOK_NOT_FOUND';
  end if;
  if v_book.publication_status <> 'draft' or v_book.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'STALE_CATALOG_REVISION';
  end if;
  perform 1 from public.price_regions where id = v_book.region_id for update;
  if not exists (select 1 from public.food_prices where price_book_id = v_book.id)
    or exists (
      select 1
      from public.food_prices as price
      join public.food_fact_versions as fact on fact.id = price.food_fact_version_id
      where price.price_book_id = v_book.id
        and (fact.publication_status <> 'published' or price.observed_at > current_date)
    ) then
    raise exception using errcode = '23514', message = 'INCOMPLETE_PRICE_BOOK';
  end if;

  perform private.begin_catalog_transition();
  update public.price_books
  set
    publication_status = 'published',
    content_hash = p_content_hash,
    published_at = now(),
    revision = revision + 1,
    updated_at = now()
  where id = v_book.id
  returning * into v_book;
  update public.price_regions
  set current_price_book_id = v_book.id
  where id = v_book.region_id;
  insert into public.admin_audit_log (
    actor_kind, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    'admin_user', p_actor_user_id, 'publish', 'price_book', v_book.id,
    jsonb_build_object('contentHash', p_content_hash, 'versionNumber', v_book.version_number)
  );
  perform private.end_catalog_transition();
  return v_book;
end;
$$;

create function public.retire_catalog_identity(
  p_entity_type text,
  p_entity_id uuid,
  p_actor_user_id uuid,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_region_id uuid;
  v_revision integer;
begin
  perform private.assert_catalog_admin(p_actor_user_id);
  perform private.begin_catalog_transition();
  if p_entity_type = 'food' then
    update public.foods
    set status = 'retired', retired_at = now(), revision = revision + 1, updated_at = now()
    where id = p_entity_id and status = 'published' and revision = p_expected_revision
    returning revision into v_revision;
  elsif p_entity_type = 'recipe' then
    update public.recipes
    set status = 'retired', retired_at = now(), revision = revision + 1, updated_at = now()
    where id = p_entity_id and status = 'published' and revision = p_expected_revision
    returning revision into v_revision;
  elsif p_entity_type = 'price_book' then
    update public.price_books
    set retired_at = now(), revision = revision + 1, updated_at = now()
    where id = p_entity_id
      and publication_status = 'published'
      and retired_at is null
      and revision = p_expected_revision
    returning region_id, revision into v_region_id, v_revision;
    if found then
      update public.price_regions
      set current_price_book_id = null
      where id = v_region_id and current_price_book_id = p_entity_id;
    end if;
  else
    raise exception using errcode = '22023', message = 'UNSUPPORTED_CATALOG_ENTITY';
  end if;
  if v_revision is null then
    raise exception using errcode = 'P0001', message = 'STALE_CATALOG_REVISION';
  end if;
  insert into public.admin_audit_log (
    actor_kind, actor_user_id, action, entity_type, entity_id, after_summary
  ) values (
    'admin_user', p_actor_user_id, 'retire', p_entity_type, p_entity_id,
    jsonb_build_object('revision', v_revision)
  );
  perform private.end_catalog_transition();
  return jsonb_build_object('entityType', p_entity_type, 'entityId', p_entity_id, 'revision', v_revision);
end;
$$;

create function public.get_current_price_book(p_region_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'regionId', region.id,
    'regionCode', region.code,
    'priceBookId', book.id,
    'versionNumber', book.version_number,
    'contentHash', book.content_hash,
    'effectiveFrom', book.effective_from,
    'effectiveTo', book.effective_to
  )
  from public.price_regions as region
  join public.price_books as book on book.id = region.current_price_book_id
  where region.id = p_region_id
    and book.region_id = region.id
    and book.publication_status = 'published'
    and book.retired_at is null;
$$;

create function public.get_published_recipe_calculation_input(
  p_recipe_version_id uuid,
  p_price_book_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'recipe', jsonb_build_object(
      'recipeId', recipe.id,
      'recipeCode', recipe.code,
      'recipeNameVi', recipe.name_vi,
      'recipeVersionId', version.id,
      'versionNumber', version.version_number,
      'contentHash', version.content_hash,
      'yieldAdultEquivalent', trim(trailing '.' from trim(trailing '0' from version.yield_adult_equivalent::text)),
      'activeMinutes', version.active_minutes,
      'elapsedMinutes', version.elapsed_minutes,
      'ingredients', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'recipeIngredientId', ingredient.id,
            'order', ingredient.sort_order,
            'quantity', trim(trailing '.' from trim(trailing '0' from ingredient.quantity::text)),
            'unitId', ingredient.unit_id,
            'food', jsonb_build_object(
              'foodId', food.id,
              'code', food.code,
              'nameVi', food.name_vi,
              'baseUnitId', food.base_unit_id,
              'baseDimension', food.base_dimension
            ),
            'fact', jsonb_build_object(
              'foodFactVersionId', fact.id,
              'versionNumber', fact.version_number,
              'contentHash', fact.content_hash,
              'edibleFraction', trim(trailing '.' from trim(trailing '0' from fact.edible_fraction::text)),
              'categoryCode', category.code,
              'categoryAncestry', coalesce((
                with recursive ancestry(id, code, parent_id, depth) as (
                  select initial.id, initial.code, initial.parent_id, 0
                  from public.food_categories as initial
                  where initial.id = fact.category_id
                  union all
                  select parent.id, parent.code, parent.parent_id, ancestry.depth + 1
                  from public.food_categories as parent
                  join ancestry on ancestry.parent_id = parent.id
                )
                select jsonb_agg(ancestry.code order by ancestry.depth)
                from ancestry
              ), '[]'::jsonb),
              'conversion', jsonb_build_object(
                'unitId', conversion.unit_id,
                'baseQuantityPerUnit', trim(trailing '.' from trim(trailing '0' from conversion.base_quantity_per_unit::text)),
                'grossGramsPerUnit', trim(trailing '.' from trim(trailing '0' from conversion.gross_grams_per_unit::text)),
                'displayStep', trim(trailing '.' from trim(trailing '0' from conversion.display_step::text))
              ),
              'nutrients', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'nutrientCode', nutrient.code,
                    'unitCode', nutrient.unit_code,
                    'displayPrecision', nutrient.display_precision,
                    'amountPer100g', trim(trailing '.' from trim(trailing '0' from amount.amount_per_100g::text))
                  ) order by nutrient.code
                )
                from public.food_fact_nutrients as amount
                join public.nutrients as nutrient on nutrient.id = amount.nutrient_id
                where amount.food_fact_version_id = fact.id
              ), '[]'::jsonb),
              'allergenAssessments', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'allergenCode', allergen.code,
                    'status', assessment.assessment
                  ) order by allergen.code
                )
                from public.food_fact_allergen_assessments as assessment
                join public.allergens as allergen on allergen.id = assessment.allergen_id
                where assessment.food_fact_version_id = fact.id
              ), '[]'::jsonb),
              'dietaryTagCodes', coalesce((
                select jsonb_agg(tag.code order by tag.code)
                from public.food_fact_dietary_tags as link
                join public.dietary_tags as tag on tag.id = link.dietary_tag_id
                where link.food_fact_version_id = fact.id
              ), '[]'::jsonb)
            )
          ) order by ingredient.sort_order, ingredient.id
        )
        from public.recipe_ingredients as ingredient
        join public.foods as food on food.id = ingredient.food_id
        join public.food_fact_versions as fact on fact.id = ingredient.food_fact_version_id
        join public.food_categories as category on category.id = fact.category_id
        join public.food_fact_unit_conversions as conversion
          on conversion.food_fact_version_id = fact.id
          and conversion.unit_id = ingredient.unit_id
        where ingredient.recipe_version_id = version.id
      ), '[]'::jsonb)
    ),
    'priceBook', jsonb_build_object(
      'regionId', region.id,
      'regionCode', region.code,
      'priceBookId', book.id,
      'versionNumber', book.version_number,
      'contentHash', book.content_hash,
      'prices', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'foodPriceId', price.id,
            'foodId', price.food_id,
            'foodFactVersionId', price.food_fact_version_id,
            'packageQuantity', trim(trailing '.' from trim(trailing '0' from price.package_quantity::text)),
            'packageUnitId', price.package_unit_id,
            'packageBaseQuantity', trim(trailing '.' from trim(trailing '0' from price.package_base_quantity::text)),
            'baseUnitId', price.base_unit_id,
            'packagePriceVnd', price.package_price_vnd,
            'purchaseIncrement', trim(trailing '.' from trim(trailing '0' from price.purchase_increment::text)),
            'observedAt', price.observed_at
          ) order by price.food_id, price.id
        )
        from public.food_prices as price
        where price.price_book_id = book.id
      ), '[]'::jsonb)
    )
  )
  from public.recipe_versions as version
  join public.recipes as recipe on recipe.id = version.recipe_id
  cross join public.price_books as book
  join public.price_regions as region on region.id = book.region_id
  where version.id = p_recipe_version_id
    and version.publication_status = 'published'
    and book.id = p_price_book_id
    and book.publication_status = 'published';
$$;

create function public.get_catalog_aggregate_for_publication(
  p_aggregate_type text,
  p_aggregate_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_aggregate_type = 'food_fact_version' then
    select jsonb_build_object(
      'aggregateType', 'food_fact_version',
      'food', jsonb_build_object(
        'foodId', food.id,
        'code', food.code,
        'nameVi', food.name_vi,
        'baseDimension', food.base_dimension,
        'baseUnitId', food.base_unit_id,
        'revision', food.revision
      ),
      'fact', jsonb_build_object(
        'foodFactVersionId', fact.id,
        'versionNumber', fact.version_number,
        'revision', fact.revision,
        'categoryId', fact.category_id,
        'edibleFraction', trim(trailing '.' from trim(trailing '0' from fact.edible_fraction::text)),
        'nutritionBasis', fact.nutrition_basis,
        'provenance', fact.provenance,
        'publicationStatus', fact.publication_status,
        'contentHash', fact.content_hash
      ),
      'conversions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'unitId', conversion.unit_id,
            'unitCode', unit.code,
            'sourceDimension', unit.dimension,
            'sourceToDimensionBase', trim(trailing '.' from trim(trailing '0' from unit.to_dimension_base::text)),
            'baseQuantityPerUnit', trim(trailing '.' from trim(trailing '0' from conversion.base_quantity_per_unit::text)),
            'grossGramsPerUnit', trim(trailing '.' from trim(trailing '0' from conversion.gross_grams_per_unit::text)),
            'displayStep', trim(trailing '.' from trim(trailing '0' from conversion.display_step::text)),
            'provenance', conversion.provenance
          ) order by unit.code, conversion.unit_id
        )
        from public.food_fact_unit_conversions as conversion
        join public.units as unit on unit.id = conversion.unit_id
        where conversion.food_fact_version_id = fact.id
      ), '[]'::jsonb),
      'assessments', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'allergenId', assessment.allergen_id,
            'allergenCode', allergen.code,
            'status', assessment.assessment,
            'provenance', assessment.provenance
          ) order by allergen.code
        )
        from public.food_fact_allergen_assessments as assessment
        join public.allergens as allergen on allergen.id = assessment.allergen_id
        where assessment.food_fact_version_id = fact.id
      ), '[]'::jsonb),
      'nutrients', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'nutrientId', amount.nutrient_id,
            'nutrientCode', nutrient.code,
            'unitCode', nutrient.unit_code,
            'displayPrecision', nutrient.display_precision,
            'amountPer100g', trim(trailing '.' from trim(trailing '0' from amount.amount_per_100g::text)),
            'provenance', amount.provenance
          ) order by nutrient.code
        )
        from public.food_fact_nutrients as amount
        join public.nutrients as nutrient on nutrient.id = amount.nutrient_id
        where amount.food_fact_version_id = fact.id
      ), '[]'::jsonb),
      'dietaryTags', coalesce((
        select jsonb_agg(
          jsonb_build_object('dietaryTagId', tag.id, 'code', tag.code)
          order by tag.code
        )
        from public.food_fact_dietary_tags as link
        join public.dietary_tags as tag on tag.id = link.dietary_tag_id
        where link.food_fact_version_id = fact.id
      ), '[]'::jsonb)
    ) into v_result
    from public.food_fact_versions as fact
    join public.foods as food on food.id = fact.food_id
    where fact.id = p_aggregate_id;
  elsif p_aggregate_type = 'recipe_version' then
    select jsonb_build_object(
      'aggregateType', 'recipe_version',
      'recipe', jsonb_build_object(
        'recipeId', recipe.id,
        'code', recipe.code,
        'nameVi', recipe.name_vi,
        'revision', recipe.revision
      ),
      'version', jsonb_build_object(
        'recipeVersionId', version.id,
        'versionNumber', version.version_number,
        'revision', version.revision,
        'yieldAdultEquivalent', trim(trailing '.' from trim(trailing '0' from version.yield_adult_equivalent::text)),
        'activeMinutes', version.active_minutes,
        'elapsedMinutes', version.elapsed_minutes,
        'publicationStatus', version.publication_status,
        'contentHash', version.content_hash
      ),
      'ingredients', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'recipeIngredientId', ingredient.id,
            'foodId', ingredient.food_id,
            'foodFactVersionId', ingredient.food_fact_version_id,
            'foodFactContentHash', fact.content_hash,
            'foodFactPublicationStatus', fact.publication_status,
            'quantity', trim(trailing '.' from trim(trailing '0' from ingredient.quantity::text)),
            'unitId', ingredient.unit_id,
            'preparationNoteVi', ingredient.preparation_note_vi,
            'order', ingredient.sort_order,
            'hasPinnedConversion', conversion.unit_id is not null
          ) order by ingredient.sort_order, ingredient.id
        )
        from public.recipe_ingredients as ingredient
        join public.food_fact_versions as fact on fact.id = ingredient.food_fact_version_id
        left join public.food_fact_unit_conversions as conversion
          on conversion.food_fact_version_id = fact.id and conversion.unit_id = ingredient.unit_id
        where ingredient.recipe_version_id = version.id
      ), '[]'::jsonb),
      'steps', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'recipeStepId', step.id,
            'order', step.sort_order,
            'instructionVi', step.instruction_vi,
            'timerMinutes', step.timer_minutes
          ) order by step.sort_order, step.id
        )
        from public.recipe_steps as step
        where step.recipe_version_id = version.id
      ), '[]'::jsonb),
      'stepIngredients', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'recipeStepId', link.recipe_step_id,
            'recipeIngredientId', link.recipe_ingredient_id,
            'referenceOrder', link.reference_order
          ) order by link.recipe_step_id, link.reference_order
        )
        from public.recipe_step_ingredients as link
        where link.recipe_version_id = version.id
      ), '[]'::jsonb),
      'tags', coalesce((
        select jsonb_agg(
          jsonb_build_object('recipeTagId', tag.id, 'code', tag.code, 'kind', tag.tag_kind)
          order by tag.code
        )
        from public.recipe_version_tags as link
        join public.recipe_tags as tag on tag.id = link.recipe_tag_id
        where link.recipe_version_id = version.id
      ), '[]'::jsonb)
    ) into v_result
    from public.recipe_versions as version
    join public.recipes as recipe on recipe.id = version.recipe_id
    where version.id = p_aggregate_id;
  elsif p_aggregate_type = 'price_book' then
    select jsonb_build_object(
      'aggregateType', 'price_book',
      'book', jsonb_build_object(
        'priceBookId', book.id,
        'regionId', book.region_id,
        'versionNumber', book.version_number,
        'revision', book.revision,
        'effectiveFrom', book.effective_from,
        'effectiveTo', book.effective_to,
        'publicationStatus', book.publication_status,
        'contentHash', book.content_hash
      ),
      'prices', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'foodPriceId', price.id,
            'foodId', price.food_id,
            'foodFactVersionId', price.food_fact_version_id,
            'foodFactContentHash', fact.content_hash,
            'packageQuantity', trim(trailing '.' from trim(trailing '0' from price.package_quantity::text)),
            'packageUnitId', price.package_unit_id,
            'packageBaseQuantity', trim(trailing '.' from trim(trailing '0' from price.package_base_quantity::text)),
            'baseUnitId', price.base_unit_id,
            'packagePriceVnd', price.package_price_vnd,
            'purchaseIncrement', trim(trailing '.' from trim(trailing '0' from price.purchase_increment::text)),
            'observedAt', price.observed_at,
            'sourceReference', price.source_reference
          ) order by price.food_id, price.id
        )
        from public.food_prices as price
        join public.food_fact_versions as fact on fact.id = price.food_fact_version_id
        where price.price_book_id = book.id
      ), '[]'::jsonb)
    ) into v_result
    from public.price_books as book
    where book.id = p_aggregate_id;
  else
    raise exception using errcode = '22023', message = 'UNSUPPORTED_CATALOG_AGGREGATE';
  end if;
  return v_result;
end;
$$;

alter table public.units enable row level security;
alter table public.food_categories enable row level security;
alter table public.allergens enable row level security;
alter table public.dietary_tags enable row level security;
alter table public.nutrients enable row level security;
alter table public.price_regions enable row level security;
alter table public.foods enable row level security;
alter table public.food_fact_versions enable row level security;
alter table public.food_fact_unit_conversions enable row level security;
alter table public.food_fact_allergen_assessments enable row level security;
alter table public.food_fact_dietary_tags enable row level security;
alter table public.food_fact_nutrients enable row level security;
alter table public.household_rule_catalog_targets enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_versions enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.recipe_step_ingredients enable row level security;
alter table public.recipe_tags enable row level security;
alter table public.recipe_version_tags enable row level security;
alter table public.price_books enable row level security;
alter table public.food_prices enable row level security;
alter table public.admin_audit_log enable row level security;

create policy units_authenticated_read
on public.units for select to authenticated using (true);
create policy food_categories_authenticated_read
on public.food_categories for select to authenticated using (true);
create policy allergens_authenticated_read
on public.allergens for select to authenticated using (true);
create policy dietary_tags_authenticated_read
on public.dietary_tags for select to authenticated using (true);
create policy nutrients_authenticated_read
on public.nutrients for select to authenticated using (true);
create policy price_regions_authenticated_read
on public.price_regions for select to authenticated using (true);
create policy hard_rule_targets_authenticated_read
on public.household_rule_catalog_targets for select to authenticated using (true);
create policy recipe_tags_authenticated_read
on public.recipe_tags for select to authenticated using (true);

create policy foods_authenticated_published_read
on public.foods for select to authenticated
using (status in ('published', 'retired'));
create policy food_fact_versions_authenticated_published_read
on public.food_fact_versions for select to authenticated
using (publication_status = 'published');
create policy food_fact_conversions_authenticated_published_read
on public.food_fact_unit_conversions for select to authenticated
using (
  exists (
    select 1 from public.food_fact_versions as fact
    where fact.id = food_fact_version_id and fact.publication_status = 'published'
  )
);
create policy food_fact_assessments_authenticated_published_read
on public.food_fact_allergen_assessments for select to authenticated
using (
  exists (
    select 1 from public.food_fact_versions as fact
    where fact.id = food_fact_version_id and fact.publication_status = 'published'
  )
);
create policy food_fact_tags_authenticated_published_read
on public.food_fact_dietary_tags for select to authenticated
using (
  exists (
    select 1 from public.food_fact_versions as fact
    where fact.id = food_fact_version_id and fact.publication_status = 'published'
  )
);
create policy food_fact_nutrients_authenticated_published_read
on public.food_fact_nutrients for select to authenticated
using (
  exists (
    select 1 from public.food_fact_versions as fact
    where fact.id = food_fact_version_id and fact.publication_status = 'published'
  )
);

create policy recipes_authenticated_published_read
on public.recipes for select to authenticated
using (status in ('published', 'retired'));
create policy recipe_versions_authenticated_published_read
on public.recipe_versions for select to authenticated
using (publication_status = 'published');
create policy recipe_ingredients_authenticated_published_read
on public.recipe_ingredients for select to authenticated
using (
  exists (
    select 1 from public.recipe_versions as version
    where version.id = recipe_version_id and version.publication_status = 'published'
  )
);
create policy recipe_steps_authenticated_published_read
on public.recipe_steps for select to authenticated
using (
  exists (
    select 1 from public.recipe_versions as version
    where version.id = recipe_version_id and version.publication_status = 'published'
  )
);
create policy recipe_step_ingredients_authenticated_published_read
on public.recipe_step_ingredients for select to authenticated
using (
  exists (
    select 1 from public.recipe_versions as version
    where version.id = recipe_version_id and version.publication_status = 'published'
  )
);
create policy recipe_version_tags_authenticated_published_read
on public.recipe_version_tags for select to authenticated
using (
  exists (
    select 1 from public.recipe_versions as version
    where version.id = recipe_version_id and version.publication_status = 'published'
  )
);

create policy price_books_authenticated_historical_read
on public.price_books for select to authenticated
using (publication_status = 'published');
create policy food_prices_authenticated_historical_read
on public.food_prices for select to authenticated
using (
  exists (
    select 1 from public.price_books as book
    where book.id = price_book_id and book.publication_status = 'published'
  )
);

revoke all on table public.units from anon, authenticated, service_role;
revoke all on table public.food_categories from anon, authenticated, service_role;
revoke all on table public.allergens from anon, authenticated, service_role;
revoke all on table public.dietary_tags from anon, authenticated, service_role;
revoke all on table public.nutrients from anon, authenticated, service_role;
revoke all on table public.price_regions from anon, authenticated, service_role;
revoke all on table public.foods from anon, authenticated, service_role;
revoke all on table public.food_fact_versions from anon, authenticated, service_role;
revoke all on table public.food_fact_unit_conversions from anon, authenticated, service_role;
revoke all on table public.food_fact_allergen_assessments from anon, authenticated, service_role;
revoke all on table public.food_fact_dietary_tags from anon, authenticated, service_role;
revoke all on table public.food_fact_nutrients from anon, authenticated, service_role;
revoke all on table public.household_rule_catalog_targets from anon, authenticated, service_role;
revoke all on table public.recipes from anon, authenticated, service_role;
revoke all on table public.recipe_versions from anon, authenticated, service_role;
revoke all on table public.recipe_ingredients from anon, authenticated, service_role;
revoke all on table public.recipe_steps from anon, authenticated, service_role;
revoke all on table public.recipe_step_ingredients from anon, authenticated, service_role;
revoke all on table public.recipe_tags from anon, authenticated, service_role;
revoke all on table public.recipe_version_tags from anon, authenticated, service_role;
revoke all on table public.price_books from anon, authenticated, service_role;
revoke all on table public.food_prices from anon, authenticated, service_role;
revoke all on table public.admin_audit_log from anon, authenticated, service_role;

grant select on table
  public.units,
  public.food_categories,
  public.allergens,
  public.dietary_tags,
  public.nutrients,
  public.price_regions,
  public.foods,
  public.food_fact_versions,
  public.food_fact_unit_conversions,
  public.food_fact_allergen_assessments,
  public.food_fact_dietary_tags,
  public.food_fact_nutrients,
  public.household_rule_catalog_targets,
  public.recipes,
  public.recipe_versions,
  public.recipe_ingredients,
  public.recipe_steps,
  public.recipe_step_ingredients,
  public.recipe_tags,
  public.recipe_version_tags,
  public.price_books,
  public.food_prices
to authenticated;

grant select on table
  public.units,
  public.food_categories,
  public.allergens,
  public.dietary_tags,
  public.nutrients,
  public.price_regions,
  public.foods,
  public.food_fact_versions,
  public.food_fact_unit_conversions,
  public.food_fact_allergen_assessments,
  public.food_fact_dietary_tags,
  public.food_fact_nutrients,
  public.household_rule_catalog_targets,
  public.recipes,
  public.recipe_versions,
  public.recipe_ingredients,
  public.recipe_steps,
  public.recipe_step_ingredients,
  public.recipe_tags,
  public.recipe_version_tags,
  public.price_books,
  public.food_prices,
  public.admin_audit_log
to service_role;

grant insert, delete on table public.foods, public.recipes to service_role;
grant update (code, name_vi, base_dimension, base_unit_id) on public.foods to service_role;
grant update (code, name_vi) on public.recipes to service_role;
grant insert, delete on table public.food_fact_versions, public.recipe_versions, public.price_books
to service_role;
grant update (category_id, edible_fraction, provenance) on public.food_fact_versions to service_role;
grant update (yield_adult_equivalent, active_minutes, elapsed_minutes) on public.recipe_versions
to service_role;
grant update (effective_from, effective_to) on public.price_books to service_role;
grant insert, update, delete on table
  public.food_fact_unit_conversions,
  public.food_fact_allergen_assessments,
  public.food_fact_dietary_tags,
  public.food_fact_nutrients,
  public.recipe_ingredients,
  public.recipe_steps,
  public.recipe_step_ingredients,
  public.recipe_version_tags,
  public.food_prices
to service_role;

revoke all on function public.publish_food_fact_version(uuid, text, uuid, integer)
from public, anon, authenticated;
revoke all on function public.publish_recipe_version(uuid, text, uuid, integer)
from public, anon, authenticated;
revoke all on function public.publish_price_book(uuid, text, uuid, integer)
from public, anon, authenticated;
revoke all on function public.retire_catalog_identity(text, uuid, uuid, integer)
from public, anon, authenticated;
revoke all on function public.get_current_price_book(uuid) from public, anon;
revoke all on function public.get_published_recipe_calculation_input(uuid, uuid)
from public, anon;
revoke all on function public.get_catalog_aggregate_for_publication(text, uuid)
from public, anon, authenticated;

grant execute on function public.publish_food_fact_version(uuid, text, uuid, integer)
to service_role;
grant execute on function public.publish_recipe_version(uuid, text, uuid, integer)
to service_role;
grant execute on function public.publish_price_book(uuid, text, uuid, integer)
to service_role;
grant execute on function public.retire_catalog_identity(text, uuid, uuid, integer)
to service_role;
grant execute on function public.get_catalog_aggregate_for_publication(text, uuid)
to service_role;
grant execute on function public.get_current_price_book(uuid) to authenticated, service_role;
grant execute on function public.get_published_recipe_calculation_input(uuid, uuid)
to authenticated, service_role;
