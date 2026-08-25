# Bếp Nhà — Product and System Design Specification

**Status:** Proposed for approval  
**Date:** 2026-08-25  
**Scope:** MVP architecture and phased delivery boundaries  
**Implementation:** Not started

## 1. Executive summary

Bếp Nhà is a mobile-first weekly meal-planning application for Vietnamese households. Its core is a deterministic planning system backed by structured food, recipe, nutrition, price, and household data. The same validated inputs, catalog versions, and engine version must produce the same plan and calculations.

The recommended architecture is a modular monolith:

- a React/Vite single-page application for onboarding, planning, shopping, recipes, pantry, and administration;
- a framework-independent TypeScript domain core for portion, nutrition, cost, planning, replacement, and shopping-list logic;
- thin trusted Vercel Functions that authenticate requests, load catalog data, execute the domain core, and persist immutable calculation snapshots;
- Supabase Auth and PostgreSQL for identity, persistence, constraints, migrations, and row-level authorization;
- no LLM, vector database, microservices, event bus, background job system, or recommendation ML in the MVP.

PostgreSQL is the source of truth, but it does not contain the meal-planning algorithms. The browser presents and edits user intent, but it is not trusted to author authoritative cost, nutrition, allergy, portion, or ingredient calculations.

## 2. Repository assessment

At the time of this specification:

- `D:\IT\bepnha` is empty;
- it is not a Git repository;
- no `AGENTS.md`, README, source code, schema, tests, or other project documentation exists;
- there are therefore no existing conventions or compatibility constraints to preserve.

The first approved implementation plan may initialize Git and scaffold the application. This document itself does not initialize the repository or create application code.

## 3. Product definition

### 3.1 Primary outcome

A signed-in household completes a short onboarding flow and receives a useful seven-day plan that answers:

1. What is the primary cooked family meal each day?
2. How much of each ingredient is required for this household?
3. What should the household buy after consolidation and, later, pantry deduction?
4. What is the estimated basket cost, and is it within the configured plan budget?

### 3.2 MVP planning unit

The MVP produces **seven primary cooked family meals: one meal per day**. Breakfasts, snacks, drinks, and a second cooked meal are excluded. The weekly budget entered during onboarding applies to these seven planned meals only.

This is an intentional scope decision. Calling a seven-dinner estimate a full household food budget would be misleading. The model retains a `meal_slot` field so a later version can support lunch and dinner without redesigning plan storage.

### 3.3 Meal composition

A Vietnamese family meal is often a set of dishes rather than one standalone recipe. The catalog therefore distinguishes:

- **food:** a canonical ingredient, such as chicken thigh, water spinach, fish sauce, or rice;
- **recipe:** one cookable dish with ingredients and ordered instructions;
- **meal option:** an editorially curated complete meal containing one or more recipe versions, with total time and suitability metadata;
- **meal plan item:** one scaled meal option assigned to one day for one household.

The planner selects curated meal options; it does not attempt to invent arbitrary dish combinations. This gives editors control over culinary coherence, cooking time, nutrition coverage, and realistic preparation.

### 3.4 Success criteria for the first useful planner release

For a supported household and complete catalog:

- onboarding can be completed on a narrow mobile viewport without domain knowledge;
- generation returns seven feasible meals or a typed explanation that distinguishes provable hard-filter exhaustion from a bounded search that did not discover a complete plan;
- all hard exclusions and allergens are absent from every selected food and recipe;
- quantities are derived from versioned serving rules and recipe data;
- weekly cost is based on the consolidated purchase basket and identifies missing or stale price coverage;
- every calculation reports its data completeness instead of silently treating unknown data as zero;
- replacing one meal leaves the other six plan items unchanged;
- refreshing or regenerating with identical normalized inputs and catalog/engine versions yields the same result;
- the generated list can be traced back from grocery line to plan item and recipe ingredient.

## 4. Goals and non-goals

### 4.1 MVP goals

- household profile and compact member-group input;
- plan-budget, food preference, exclusion/allergy, and maximum cooking-time configuration;
- structured food, recipe, meal-option, nutrition, unit-conversion, allergen, and price catalogs;
- deterministic portion, nutrition, cost, meal-planning, replacement, and shopping-list engines;
- seven-day plan, meal details, quick instructions, and consolidated grocery list;
- pantry deduction after the core shopping flow is stable;
- minimal admin workflow for catalog drafting, validation, publishing, and retiring;
- production-oriented authorization, migrations, auditability, tests, and observability.

### 4.2 Explicit non-goals

- chat, prompt-driven plan generation, or LLM-authored calculations;
- personalized medical or therapeutic nutrition guidance;
- calorie prescriptions based on sex, weight, activity, pregnancy, or medical conditions;
- automatic recipe generation or arbitrary dish composition;
- images as a correctness dependency;
- social accounts beyond authentication, household collaboration, community content, ratings, or comments;
- live retailer integrations, grocery ordering, payments, receipt scanning, computer vision, or OCR;
- price forecasting, recommendation ML, embeddings, vector search, or multi-agent systems;
- offline-first synchronization or native mobile applications;
- multiple active households per account in the MVP;
- localization beyond Vietnamese copy and VND in the MVP.

### 4.3 YAGNI cuts

The original feature list is retained as a roadmap, but the following complexity is removed from the first slices:

- one owner and one active household per user, rather than household invitations and roles;
- grouped household counts, rather than names and personal profiles for every family member;
- seven primary meals, rather than 21 meal slots;
- curated meal options, rather than a general constraint solver that composes individual dishes;
- one maintained baseline price region at launch, rather than retailer-by-retailer comparisons;
- raw-ingredient nutrient estimates, rather than cooking-retention simulation;
- current pantry quantities, rather than inventory lots, expiry dates, and barcode workflows;
- simple admin screens, rather than a separate CMS;
- synchronous generation, rather than queues and background workers;
- a modular monolith, rather than separately deployed services.

## 5. Ambiguous and risky requirements

The following interpretations are resolved by this specification and should be approved before Phase 0.

| Topic | Risk | MVP decision |
|---|---|---|
| Meaning of “7-day plan” | Seven dinners and 21 meals have very different cost and data needs. | Seven primary cooked meals, one per day. |
| Meaning of weekly budget | A dinner-only plan cannot honestly represent all household food spending. | Budget covers the seven generated meals only; UI copy says so. |
| “Healthy” | Without individual clinical inputs, nutrient adequacy claims can be unsafe. | Use transparent food-group diversity and recipe-level nutrient estimates; make no medical or individualized adequacy claim. |
| Elderly portions | Age alone does not determine appetite or clinical nutrition needs. | Use a conservative adult-equivalent serving coefficient, labeled as a planning estimate; no clinical adjustment. |
| Child ages | Broad age ranges can hide substantial appetite variation. | Store counts in explicit supported age bands and use versioned coefficients. |
| Food prices | Prices vary by city, shop, season, brand, and date. | Launch with one named baseline price book; show region, observation date, coverage, and staleness. Never label an estimate as a quote. |
| Under 30 minutes | Dish times do not simply add when work overlaps. | Editors publish a measured/validated total elapsed time for each complete meal option; planner filters on it. |
| Allergy safety | Free text and incomplete ingredient metadata can create false confidence. | Hard safety checks use only canonical allergen IDs and complete published lineage. Free text is notes only and never drives safety. |
| Quantity accuracy | “1 bunch” and “1 piece” are food-specific. | Non-mass units require food-specific conversion records before publication. |
| Cost versus pantry | Basket cost differs from consumed-food cost. | Show purchase-basket estimate after package rounding; pantry deductions enter in Phase 5. |
| Recipe edits | Mutable recipes would change old plans. | Published recipe versions are immutable; edits create a new version. |
| Meal replacement | Reoptimizing the whole plan violates user expectation. | Lock six items, score replacements against them, and change one item only. |
| Insufficient catalog | A planner can fail even when code is correct. | Return typed insufficiency reasons and define catalog coverage gates before launch. |

## 6. Architecture options considered

### 6.1 Recommended: shared TypeScript domain core with trusted server execution

Pure calculation modules live outside React and are invoked by thin Vercel Functions. PostgreSQL supplies validated records; the function authenticates the caller, runs the engine, and writes a transactionally consistent result snapshot.

Advantages:

- authoritative calculations cannot be replaced with client-supplied totals;
- algorithms are easy to unit and property test with Vitest;
- UI, persistence, and deployment concerns remain replaceable;
- TypeScript types can be shared across API contracts and tests;
- the architecture stays a single deployable product rather than microservices.

Trade-off: local development and deployment must include both Vite and Vercel Function behavior.

### 6.2 Rejected: calculate everything in the browser

This is initially simpler and supports instant interaction, but authoritative persisted outputs can be tampered with, catalog rules may be scraped wholesale, and different client versions can store inconsistent results. Browser-side preview calculations may be added later, but the server result remains authoritative.

### 6.3 Rejected: implement engines in PostgreSQL functions

This centralizes data and transactions, but a planning algorithm, fixed-point calculations, typed error model, and rich property tests are much harder to maintain in PL/pgSQL. PostgreSQL functions remain appropriate for small atomic persistence operations and authorization helpers, not domain planning.

## 7. System structure and dependency rule

```text
React feature UI
      |
      v
HTTP contracts / query adapters
      |
      v
Trusted Vercel Functions -----> Supabase Auth verification
      |
      v
Application use cases
      |
      v
Pure TypeScript domain engines
      ^
      |
Repository interfaces <-------> Supabase/PostgreSQL
```

Dependencies point inward. Domain modules do not import React, Supabase, Vercel, browser APIs, environment variables, or generated database clients.

### 7.1 Suggested source boundaries

Exact files belong in the later implementation plan, but the stable conceptual boundaries are:

- `app`: routing, layouts, authentication state, design system, and feature screens;
- `features/household`: onboarding and household settings;
- `features/plans`: generation, week view, meal details, and replacement;
- `features/shopping`: consolidated list and pantry-aware display;
- `features/admin`: catalog editing and publication validation;
- `domain/catalog`: canonical food, recipe, meal-option, unit, allergen, and price types;
- `domain/portion`: adult-equivalent demand and ingredient scaling;
- `domain/nutrition`: nutrient aggregation and coverage;
- `domain/cost`: price selection, package rounding, and cost coverage;
- `domain/planner`: eligibility, constraint evaluation, scoring, search, and explanation;
- `domain/shopping`: canonical aggregation, pantry subtraction, and purchase rounding;
- `application`: generate-plan, replace-meal, publish-recipe, and generate-shopping-list use cases;
- `infrastructure`: Supabase repositories, auth verification, telemetry, and HTTP adapters.

### 7.2 Stable engine contract

Every calculation request includes:

- normalized household inputs;
- `engine_version`;
- exact IDs/versions of the eligible catalog records;
- the price-book version and effective date;
- the week start date in the household time zone;
- a canonical ordering for all collections.

The catalog fingerprint hashes the sorted IDs and immutable content hashes of all referenced food-fact versions, recipe versions, meal-option versions, and price-book records. Moving a food's current-fact pointer changes future eligibility/fingerprints but cannot change an already fingerprinted calculation.

Every calculation response includes:

- output data;
- warnings and typed failure reasons;
- nutrition and cost coverage percentages;
- catalog and engine versions;
- a deterministic input fingerprint;
- a human-readable explanation suitable for the UI, generated from predefined message keys and parameters rather than an LLM.

## 8. Domain model and invariants

### 8.1 Household

A household is owned by one authenticated user in the MVP. It stores a time zone (`Asia/Ho_Chi_Minh` by default), VND plan budget, maximum elapsed cooking minutes, and preference configuration.

Members are stored as anonymous groups to minimize personal data:

| Member group | Allowed age band | Adult-equivalent coefficient |
|---|---|---:|
| Adult | `adult` | 1.00 |
| Child | `1_3` | 0.40 |
| Child | `4_6` | 0.55 |
| Child | `7_9` | 0.70 |
| Child | `10_12` | 0.85 |
| Child | `13_17` | 1.00 |
| Elderly | `elderly` | 0.85 |

Age under one is unsupported because infant feeding needs a separate safety model. A household containing an infant may still plan for the remaining members, but the UI must state that the infant is excluded from quantities. Coefficients estimate shared-meal portions only; they are not nutrient recommendations.

For MVP, these coefficients are an immutable `PortionConfigV1` constant in the code-versioned deterministic engine, not rows in a database table. Generation copies the exact coefficient map and its configuration version into `input_snapshot`; changing a coefficient requires a new engine/configuration version and golden-test review. A database-managed coefficient table is deferred unless operations later demonstrate a real need to change coefficients independently of an engine release. A later appetite adjustment can be added only with evidence that the default causes systematic waste or shortage.

### 8.2 Catalog publication invariants

A `food` is a stable shopping identity with a permanent base dimension. Mutable scientific and dietary facts do not live on that identity. They live in immutable `food_fact_versions`, each of which owns the food category, edible fraction, nutrient values, allergen assessment/relations, dietary facts, and food-specific unit conversions used by a calculation. `foods.current_fact_version_id` points to the fact version offered to new recipe drafts; moving this pointer never changes an existing recipe ingredient reference.

Every recipe ingredient stores both stable `food_id` and immutable `food_fact_version_id`, protected by a composite foreign key proving that the version belongs to that food. Calculations and safety filters use the referenced fact version; shopping aggregation uses the stable food identity after each ingredient has been converted to that food's permanent base dimension. Plan snapshots copy both IDs and all derived canonical quantities.

Publishing a replacement food-fact version produces a dependency-impact report. Allergen or dietary-suitability corrections require affected published recipe/meal-option versions to be explicitly reviewed and, when newly unsafe, retired before the new current pointer becomes active. Publication never silently rebinds a recipe.

A food fact version can be used in a published recipe only if it has:

- a parent food with a canonical Vietnamese name, stable ID, and permanent base dimension;
- an allergen assessment, including an explicit “none known” result rather than missing data;
- a food category and dietary flags;
- a gram conversion when it contributes nutrition;
- complete launch-nutrient records for its edible form;
- at least one usable price record in every region where the recipe is offered for budget-aware generation.

A recipe version can be published only if:

- yield in adult servings is greater than zero;
- every ingredient references a published food and resolvable unit conversion;
- every ingredient quantity is positive;
- instructions are ordered and non-empty;
- active time and elapsed time are positive and plausible;
- allergen closure can be derived through all ingredients;
- unit conversion, allergen lineage, and all six launch-nutrient calculations are 100% complete; price validation is 100% complete for each launch price book in which the recipe is made available.

A meal option can be published only if:

- it contains one or more published recipe versions;
- its total elapsed minutes have been editorially validated, rather than calculated by adding dish times;
- serving basis and recipe yields can be reconciled;
- it declares meal roles/food groups used by diversity rules;
- its derived allergen closure is complete;
- it has 100% unit-conversion and allergen-lineage coverage;
- it has 100% coverage for the six launch nutrients across all required edible ingredients;
- every required food has a usable price in the target generation price book. Price availability is checked again at generation time because it is region- and date-specific.

Published recipe versions, meal-option versions, food-fact versions, and price books are immutable. Corrections create new immutable versions; they never update payload fields used by an existing published recipe. Old plans retain their authoritative input/output snapshots, while the catalog fingerprint identifies the exact version set used for new calculations.

### 8.3 Hard and soft preferences

- **Allergies and exclusions** are hard constraints. Unknown lineage is not safe and makes a candidate ineligible.
- **Disliked foods/categories** are hard constraints when the user explicitly chooses “exclude.”
- **Preferred foods/categories** are soft score inputs and never override budget, time, or safety.
- Free-text notes are displayed to the user/admin but do not participate in deterministic safety or filtering.

## 9. Database design

### 9.1 Conventions

- UUID primary keys use database defaults.
- Timestamps are `timestamptz` in UTC; household presentation uses its IANA time zone.
- Calendar planning uses `date`; week start is Monday.
- VND is stored as integer `bigint`; no floating-point money.
- Ingredient and nutrient amounts use constrained PostgreSQL `numeric`, not `real` or `double precision`.
- TypeScript parses database numerics as decimal strings and calculates with an explicit decimal arithmetic library and rounding mode.
- Catalog slugs/codes are stable, lowercase machine identifiers; Vietnamese display names are data.
- Mutable user rows have `created_at`, `updated_at`, and optimistic `version` integers where concurrent edits matter.
- Deletion of user data is explicit and cascading where safe. Catalog versions are retired, not hard-deleted, once referenced.
- All schema changes are migrations. Production is never edited ad hoc through the dashboard.

### 9.2 Identity and household tables

#### `profiles`

- `user_id uuid primary key references auth.users(id) on delete cascade`
- `display_name text null`
- `locale text not null default 'vi-VN'`
- `created_at`, `updated_at`

No authorization role is stored in user-editable profile data.

#### `households`

- `id uuid primary key`
- `owner_user_id uuid not null unique references auth.users(id) on delete cascade`
- `name text not null default 'Nhà mình'`
- `timezone text not null default 'Asia/Ho_Chi_Minh'`
- `currency_code text not null check (currency_code = 'VND')`
- `weekly_plan_budget_vnd bigint not null check (> 0)`
- `max_elapsed_minutes smallint not null check (between 10 and 180)`
- `price_region_id uuid not null references price_regions(id)`
- `onboarding_completed_at timestamptz null`
- `version integer not null default 1`
- `created_at`, `updated_at`

#### `household_member_groups`

- `id uuid primary key`
- `household_id uuid not null references households(id) on delete cascade`
- `member_kind text check in ('adult','child','elderly')`
- `age_band text` constrained to the kind-compatible values in Section 8.1
- `member_count smallint not null check (between 1 and 20)`
- unique `(household_id, member_kind, age_band)`

#### `household_food_rules`

- `id uuid primary key`
- `household_id uuid not null references households(id) on delete cascade`
- exactly one of `food_id`, `food_category_id`, `allergen_id`, or `dietary_tag_id` is non-null
- `rule_kind text check in ('exclude','prefer')`
- unique logical target per household/rule kind

Allergen targets permit only `exclude`. An application-level schema and a database check enforce the one-target invariant.

#### `household_notes`

- `household_id uuid primary key references households(id) on delete cascade`
- `dietary_notes text not null default ''` with a conservative length limit

Notes are deliberately separate from executable food rules.

### 9.3 Food and measurement catalog

#### `units`

- `id uuid primary key`
- `code text unique not null`
- `dimension text check in ('mass','volume','count')`
- `to_dimension_base numeric(18,6) not null check (> 0)`
- `display_name_vi text not null`

Dimension bases are gram, millilitre, and item. Generic mass/volume conversions belong here; food-specific conversions do not. After a unit is referenced by any published fact, recipe, or price book, its `code`, `dimension`, and `to_dimension_base` are immutable; a correction creates a new unit ID. Display-label corrections do not affect calculations and old plan snapshots retain their label.

#### `food_categories`

- `id uuid primary key`
- `code text unique not null`
- `name_vi text not null`
- `parent_id uuid null references food_categories(id)`

The launch taxonomy remains shallow and is used for UI grouping and planner diversity. Category `code` and `parent_id` become immutable after a published food fact references the category; semantic corrections create a new category ID.

#### `foods`

- `id uuid primary key`
- `code text unique not null`
- `name_vi text not null`
- `base_dimension text check in ('mass','volume','count')`
- `base_unit_id uuid not null references units(id)` with a matching dimension
- `current_fact_version_id uuid null`
- `status text check in ('draft','published','retired')`
- `created_at`, `updated_at`

`foods` is the permanent identity used to consolidate shopping needs. Its base dimension/unit cannot change after any fact or recipe references the food. Preparation forms that materially change nutrition, cost, or aggregation—such as dry versus cooked noodles—are separate food identities.

#### `food_fact_versions`

- `id uuid primary key`
- `food_id uuid not null references foods(id)`
- `version_number integer not null check (> 0)`
- `category_id uuid not null references food_categories(id)`
- `nutrition_basis text not null check (nutrition_basis = 'per_100g_edible')`
- `edible_fraction numeric(6,5) not null check (> 0 and <= 1)`
- `allergen_assessed_at timestamptz not null`
- `publication_status text check in ('draft','published')`
- `content_hash text null`
- `data_source text not null`
- `source_reference text null`
- `published_at timestamptz null`
- `created_by uuid references auth.users(id)`
- `created_at`, `updated_at`
- unique `(food_id, version_number)` and unique `(food_id, id)` for composite references

Draft facts may be edited. Publishing computes `content_hash` over the canonical fact row plus its nutrient, allergen, dietary-tag, and unit-conversion children, then performs the single allowed `draft -> published` transition. Database triggers reject later update/delete of a published fact row and reject insert/update/delete of its child nutrient, allergen, dietary-tag, or conversion rows, including attempts through privileged catalog paths; corrections require a new version. `foods.current_fact_version_id` is constrained with `(foods.id, current_fact_version_id) -> food_fact_versions(food_id, id)`; only the trusted publication transaction may move the pointer.

#### `food_fact_unit_conversions`

- `food_fact_version_id uuid references food_fact_versions(id)`
- `unit_id uuid references units(id)`
- `grams_per_unit numeric(18,6) not null check (> 0)`
- `source_note text not null`
- primary key `(food_fact_version_id, unit_id)`

Examples include grams per egg, bunch, tablespoon of fish sauce, or millilitre of cooking oil. Generic volume-to-gram conversion is not assumed across foods.

#### `allergens`

- `id uuid primary key`
- `code text unique not null`
- `name_vi text not null`

Allergen code/identity is immutable after a published fact references it; display-name corrections do not change safety semantics.

#### `food_fact_allergens`

- `food_fact_version_id uuid references food_fact_versions(id)`
- `allergen_id uuid references allergens(id)`
- `presence text check in ('contains','may_contain')`
- primary key `(food_fact_version_id, allergen_id)`

Zero allergen rows plus `food_fact_versions.allergen_assessed_at` means “assessed, none known.” A draft without a completed assessment cannot be published.

#### `dietary_tags` and `food_fact_dietary_tags`

- `dietary_tags`: `id`, unique stable `code`, and `name_vi`
- `food_fact_dietary_tags`: `food_fact_version_id`, `dietary_tag_id`, primary key on both IDs

Presence means the immutable fact version satisfies the deterministic tag, such as vegetarian suitability. Absence means it does not; these tables do not model subjective health claims. A dietary tag's code/meaning is immutable after reference; semantic corrections create a new tag ID.

#### `nutrients`

- `id uuid primary key`
- `code text unique not null`
- `name_vi text not null`
- `unit_code text check in ('kcal','g','mg','mcg')`
- `display_precision smallint not null`

Launch nutrients are energy, protein, carbohydrate, fat, fibre, and sodium. Additional micronutrients can be loaded later without changing the engine.

Nutrient `code` and `unit_code` are immutable after a published food fact references the nutrient; corrections create a new nutrient ID.

#### `food_fact_nutrients`

- `food_fact_version_id uuid references food_fact_versions(id)`
- `nutrient_id uuid references nutrients(id)`
- `amount_per_100g numeric(18,6) not null check (>= 0)`
- `source_reference text not null`
- primary key `(food_fact_version_id, nutrient_id)`

### 9.4 Recipe and meal catalog

#### `recipes`

- `id uuid primary key`
- `code text unique not null`
- `name_vi text not null`
- `status text check in ('draft','published','retired')`
- `created_at`, `updated_at`

#### `recipe_versions`

- `id uuid primary key`
- `recipe_id uuid not null references recipes(id)`
- `version_number integer not null check (> 0)`
- `yield_adult_servings numeric(8,3) not null check (> 0)`
- `active_minutes smallint not null check (> 0)`
- `elapsed_minutes smallint not null check (>= active_minutes)`
- `publication_status text check in ('draft','published','retired')`
- `published_at timestamptz null`
- `created_by uuid references auth.users(id)`
- unique `(recipe_id, version_number)`

#### `recipe_ingredients`

- `id uuid primary key`
- `recipe_version_id uuid not null references recipe_versions(id) on delete restrict`
- `food_id uuid not null references foods(id)`
- `food_fact_version_id uuid not null references food_fact_versions(id)`
- `quantity numeric(18,6) not null check (> 0)`
- `unit_id uuid not null references units(id)`
- `preparation_note_vi text null`
- `sort_order smallint not null`
- unique `(recipe_version_id, sort_order)`

A composite foreign key `(food_id, food_fact_version_id) -> food_fact_versions(food_id, id)` prevents mismatched stable identities and fact versions. Publication requires the referenced fact version to be published. Later changes to `foods.current_fact_version_id` do not alter the recipe.

Every stored ingredient is required and participates in authoritative nutrition, cost, and shopping calculations. Optional garnish may appear in instruction text but is not a structured ingredient in the MVP; it therefore cannot affect totals.

Recipe ingredient quantities represent as-purchased amounts before inedible trim. Foods that materially differ, such as bone-in and boneless meat, use distinct canonical records. This keeps shopping quantity and edible-fraction nutrition calculations aligned.

#### `recipe_steps`

- `id uuid primary key`
- `recipe_version_id uuid not null references recipe_versions(id) on delete restrict`
- `sort_order smallint not null`
- `instruction_vi text not null`
- `timer_minutes smallint null check (>= 0)`
- unique `(recipe_version_id, sort_order)`

#### `meal_options`

- `id uuid primary key`
- `code text unique not null`
- `name_vi text not null`
- `status text check in ('draft','published','retired')`
- `created_at`, `updated_at`

This is the stable meal-option identity, equivalent to the `recipes` master table.

#### `meal_option_versions`

- `id uuid primary key`
- `meal_option_id uuid not null references meal_options(id)`
- `version_number integer not null`
- `yield_adult_servings numeric(8,3) not null check (> 0)`
- `active_minutes smallint not null check (> 0)`
- `elapsed_minutes smallint not null check (>= active_minutes)`
- `primary_protein_group text not null`
- `publication_status text check in ('draft','published','retired')`
- `published_at timestamptz null`
- `created_by uuid references auth.users(id)`
- unique `(meal_option_id, version_number)`

Published meal-option versions are immutable. Edits create a new version under the stable meal-option identity.

#### `meal_option_recipes`

- `meal_option_version_id uuid references meal_option_versions(id)`
- `recipe_version_id uuid references recipe_versions(id)`
- `quantity_multiplier numeric(8,4) not null default 1 check (> 0)`
- `meal_role text check in ('staple','main','vegetable','soup','side')`
- `sort_order smallint not null`
- primary key `(meal_option_version_id, recipe_version_id)`

`quantity_multiplier` is the number of base recipe batches included in one base-yield meal option. Editors validate that the component batches jointly serve `meal_option_versions.yield_adult_servings`; the portion engine then applies the meal-level scale once.

#### `meal_option_tags`

Tags attach to `meal_option_versions` and support preference scoring and diversity rules. Derived allergen/dietary facts always come from component foods; a tag cannot override ingredient lineage.

### 9.5 Price catalog

#### `price_regions`

- `id uuid primary key`
- `code text unique not null`
- `name_vi text not null`
- `is_launch_default boolean not null default false`

Exactly one region is the launch default. The UI describes it as a baseline estimate region, not the user's exact shop.

#### `price_books`

- `id uuid primary key`
- `region_id uuid not null references price_regions(id)`
- `name text not null`
- `version_number integer not null`
- `effective_from date not null`
- `effective_to date null`
- `status text check in ('draft','published','retired')`
- unique `(region_id, version_number)`

#### `food_prices`

- `id uuid primary key`
- `price_book_id uuid not null references price_books(id)`
- `food_id uuid not null references foods(id)`
- `food_fact_version_id uuid not null references food_fact_versions(id)`
- `package_quantity numeric(18,6) not null check (> 0)`
- `package_unit_id uuid not null references units(id)`
- `package_base_quantity numeric(18,6) not null check (> 0)`
- `package_base_unit_id uuid not null references units(id)` and equal to the food's permanent base unit
- `package_price_vnd bigint not null check (> 0)`
- `purchase_increment smallint not null default 1 check (> 0)`
- `observed_at date not null`
- `source_label text not null`
- unique `(price_book_id, food_id)`

A composite foreign key `(food_id, food_fact_version_id) -> food_fact_versions(food_id, id)` validates the relationship. `package_base_quantity` is an immutable normalized snapshot derived from the referenced fact conversion when the price book is published, so later fact versions cannot alter an old price book's package math. The MVP holds one representative package per food per price book. Brand/retailer comparison is deferred.

### 9.6 Plans and calculation snapshots

#### `meal_plans`

- `id uuid primary key`
- `household_id uuid not null references households(id) on delete cascade`
- `week_start date not null`
- `status text check in ('ready','archived')`
- `engine_version text not null`
- `catalog_fingerprint text not null`
- `input_fingerprint text not null`
- `calculation_fingerprint text not null`
- `input_snapshot jsonb not null`
- `total_estimated_cost_vnd bigint not null check (>= 0)`
- `cost_coverage_percent numeric(5,2) not null check (= 100)`
- `nutrition_coverage_percent numeric(5,2) not null check (= 100)`
- `budget_status text check in ('within','over')`
- `warnings jsonb not null default '[]'`
- `created_at`, `updated_at`
- unique active ready plan per `(household_id, week_start)` enforced with a partial unique index

`input_snapshot` contains only validated structured values and calculation configuration; it is not an arbitrary document API.

#### `meal_plan_items`

- `id uuid primary key`
- `meal_plan_id uuid not null references meal_plans(id) on delete cascade`
- `day_index smallint not null check (between 0 and 6)`
- `meal_slot text not null default 'primary'`
- `meal_option_version_id uuid not null references meal_option_versions(id)`
- `adult_equivalent_servings numeric(8,3) not null`
- `scale_factor numeric(12,6) not null`
- `calculation_snapshot jsonb not null`
- `replacement_of_item_id uuid null references meal_plan_items(id)`
- `is_active boolean not null default true`
- `replaced_at timestamptz null`
- `created_at`
- partial unique index on `(meal_plan_id, day_index, meal_slot)` where `is_active = true`

The immutable calculation snapshot includes each stable food ID, referenced food-fact-version ID/content hash, scaled canonical ingredient quantity, nutrients, meal cost contribution, coverage, price IDs, and explanation codes. It makes old plans reproducible when the current catalog pointer changes. Replacement marks the old item inactive and inserts a new active item that references it, preserving a traceable chain without violating slot uniqueness.

#### `shopping_lists`

- `id uuid primary key`
- `meal_plan_id uuid not null unique references meal_plans(id) on delete cascade`
- `calculation_fingerprint text not null`
- `generated_at timestamptz not null`
- `estimated_purchase_cost_vnd bigint not null check (>= 0)`
- `cost_coverage_percent numeric(5,2) not null check (= 100)`
- `warnings jsonb not null default '[]'`

The restricted persistence RPC derives `shopping_lists.estimated_purchase_cost_vnd` by summing the authoritative shopping line costs, writes that same integer to `meal_plans.total_estimated_cost_vnd`, and writes the same `calculation_fingerprint` to both rows. It rejects any mismatch before commit. Therefore, for every ready plan:

`meal_plans.total_estimated_cost_vnd = shopping_lists.estimated_purchase_cost_vnd`

for the same authoritative calculation snapshot. Browser roles cannot bypass this invariant because they have no write grant on either result.

#### `shopping_list_items`

- `id uuid primary key`
- `shopping_list_id uuid not null references shopping_lists(id) on delete cascade`
- `food_id uuid not null references foods(id)`
- `required_quantity numeric(18,6) not null check (> 0)`
- `required_unit_id uuid not null references units(id)`
- `pantry_deducted_quantity numeric(18,6) not null default 0`
- `purchase_packages bigint not null check (purchase_packages >= 0)`
- `purchase_quantity numeric(18,6) not null check (>= 0)`
- `purchase_unit_id uuid not null references units(id)`
- `estimated_cost_vnd bigint not null check (>= 0)`
- `source_plan_item_ids uuid[] not null`
- `checked_at timestamptz null`
- unique `(shopping_list_id, food_id)`

Checked state is user state; regeneration preserves it only when food identity and required amount are unchanged.

### 9.7 Pantry tables (Phase 5)

#### `pantry_items`

- `id uuid primary key`
- `household_id uuid not null references households(id) on delete cascade`
- `food_id uuid not null references foods(id)`
- `food_fact_version_id uuid not null references food_fact_versions(id)`
- `quantity numeric(18,6) not null check (>= 0)`
- `unit_id uuid not null references units(id)`
- `version integer not null default 1`
- `updated_at`
- unique `(household_id, food_id)`

The composite food/fact-version relationship is enforced so count/volume pantry quantities retain their original conversion meaning. No lots, expiry dates, consumption ledger, or automatic decrement are added. Generation takes a pantry snapshot; checking a shopping item does not mutate pantry.

### 9.8 Administration and audit

#### `admin_audit_log`

- `id uuid primary key`
- `actor_kind text check in ('admin_user','trusted_operation')`
- `actor_user_id uuid null references auth.users(id)`
- `actor_identifier text not null`
- `action text not null`
- `entity_type text not null`
- `entity_id uuid not null`
- `before_summary jsonb null`
- `after_summary jsonb null`
- `created_at timestamptz not null`

`actor_identifier` records the authenticated operator/service principal used for trusted bootstrap even when no administrator user exists yet; `actor_user_id` is required when `actor_kind = 'admin_user'`. Audit summaries exclude secrets and minimize copied catalog content. The log is append-only to clients.

## 10. Deterministic engine definitions

### 10.1 Shared numeric and ordering rules

- Database `numeric` values enter the domain as strings and are parsed into decimal values.
- All rounding modes are named constants, never language defaults.
- Intermediate portion/nutrition quantities retain at least six decimal places.
- Ingredient display rounds only after aggregation; internal values are not rounded at each step.
- VND package costs are integers. Fractional theoretical costs may be used only for scoring, then rounded half-up to VND for display.
- Candidate arrays are sorted by stable IDs before filtering/scoring.
- Score components are integer basis points.
- Ties are resolved by stable meal-option-version ID, not random choice or database row order.
- Canonical JSON uses sorted object keys and sorted ID lists before SHA-256 input fingerprinting.

### 10.2 Portion engine

#### Inputs

- household member groups;
- code-versioned `PortionConfigV1` copied into the request input snapshot;
- meal option adult-serving yield;
- each recipe version yield and meal-option quantity multiplier;
- ingredient quantity, unit, food conversion, and purchase rounding metadata.

#### Algorithm

1. Validate every member group and coefficient.
2. Calculate household demand:

   `adultEquivalentServings = Σ(memberCount × coefficient)`

3. Calculate meal scaling:

   `mealScale = adultEquivalentServings / mealOptionYieldAdultServings`

4. For each component recipe, calculate:

   `recipeScale = mealScale × mealOptionRecipe.quantityMultiplier`

5. For each recipe ingredient:

   `scaledRecipeQuantity = ingredientQuantity × recipeScale`

6. Convert to a canonical food aggregation unit:

   - mass ingredients → grams;
   - volume ingredients → millilitres for shopping and food-specific grams for nutrition;
   - count ingredients → items for shopping and food-specific grams for nutrition.

7. Preserve unrounded canonical requirements. Display rules may show practical kitchen amounts, but shopping aggregation consumes unrounded requirements.

#### Rounding

- grams: display to nearest 5 g below 1 kg and nearest 10 g at/above 1 kg;
- millilitres: display to nearest 5 ml;
- count: display to the food's allowed fractional step; indivisible foods round up to whole items only in the purchase list, not in consumed nutrition;
- packages: always round upward to the configured purchase increment after weekly aggregation and pantry deduction.

#### Failures

An unsupported member band/missing code configuration, invalid yield, dimension mismatch, or missing conversion on the ingredient's referenced food-fact version returns a typed calculation failure. No database fallback and no default `1 piece = 100 g` behavior exists.

### 10.3 Nutrition engine

#### Scope

Nutrition is an estimate from structured edible ingredient quantities. It supports comparison, variety checks, and transparent meal summaries. It does not prescribe intake or claim clinical adequacy.

#### Algorithm

For each ingredient and nutrient:

1. Convert scaled recipe quantity to gross grams using generic or food-specific conversion.
2. Calculate edible grams:

   `edibleGrams = grossGrams × referencedFoodFactVersion.edibleFraction`

3. Calculate nutrient amount:

   `nutrientAmount = edibleGrams / 100 × amountPer100g`

4. Sum nutrient amounts across ingredients, recipes, meal option, and week.
5. Calculate per-adult-equivalent values by dividing meal totals by `adultEquivalentServings`.

Cooking-retention factors are excluded from MVP. Admin source notes and UI copy state that values are estimates based on catalog ingredient data.

#### Coverage

Coverage is nutrient-specific and weight-aware:

`coveragePercent = edible grams belonging to foods with an explicit nutrient record / total edible grams × 100`

Water and zero-calorie seasonings still require explicit assessment so missing records are distinguishable from true zero. Published meal options and ready plans require 100% coverage for all six launch nutrients. The engine can calculate lower coverage for draft/admin diagnostics, but it never substitutes zero for unknown and such a result cannot become a ready user plan.

#### Nutrition-aware planner signals

The planner uses modest, explainable signals:

- each meal is assessed for three curated composition roles: staple, main, and vegetable-or-soup;
- the nutrition-composition penalty is `round(2,500 × missingRoleAssignments / 21)`, where 21 is three roles across seven meals;
- weekly protein-group repetition and cooking-style similarity are handled separately by the diversity score;
- energy, protein, carbohydrate, fat, fibre, and sodium are calculated and displayed, but version 1 does not optimize against numeric nutrient targets;
- no individualized daily nutrient target is inferred from age alone.

This makes version 1 nutrition-aware without turning unvalidated numeric thresholds into medical-looking advice. Any later nutrient-target score requires its own evidence, review, engine version, and user-facing explanation.

### 10.4 Cost engine

#### Price selection

Generation locks one immutable published price book for the household region and week. Freshness is evaluated against the generation date using code-versioned `PriceFreshnessConfigV1 { currentMaxAgeDays: 30, usableMaxAgeDays: 90 }`, copied verbatim into `input_snapshot` and included in the calculation fingerprint:

- **current:** age 0–30 days; usable without a freshness warning;
- **stale-but-usable:** age 31–90 days; usable with `STALE_PRICE` and the observation date;
- **too-old/unusable:** age greater than 90 days; treated as unavailable and returns `MISSING_PRICE_DATA` if the food is required;
- a future `observed_at` date is invalid catalog data and unusable.

Changing either threshold requires a new price-freshness/engine configuration version and golden-test review. A database-editable threshold table is not introduced for MVP.

#### Weekly basket algorithm

1. Receive the consolidated canonical food requirements from all seven plan items.
2. In Phase 5, subtract compatible pantry quantity, floored at zero.
3. Convert the remaining requirement to the price package's unit.
4. Calculate packages:

   `packageCount = ceil(requiredQuantity / packageQuantity / purchaseIncrement) × purchaseIncrement`

5. Calculate line cost:

   `lineCostVnd = packageCount × packagePriceVnd`

6. If any required line lacks a usable price, return `MISSING_PRICE_DATA`; do not persist a ready plan with a misleading partial total.
7. Otherwise, sum all line costs and compare the complete basket with the plan budget.

The displayed weekly estimate is purchase-basket cost, not prorated consumption cost. Leftover package amounts remain visible as `purchaseQuantity - requiredQuantity` and later feed waste-reduction scoring.

#### Cost coverage

`costCoveragePercent = required food lines with an applicable package price / total required food lines × 100`

Grams, millilitres, and items cannot be added meaningfully across dimensions, so the overall percentage is line-based. Diagnostic output also reports required-quantity coverage separately within each dimension.

### 10.5 Meal-planning engine

#### Inputs

- seven primary slots for a Monday-start week;
- household adult-equivalent servings;
- hard exclusions/allergens and soft preferences;
- maximum elapsed minutes;
- budget applying to these seven meals;
- published meal-option and price-book snapshot;
- engine/scoring configuration version;
- optional locked plan items for replacement.

#### Eligibility filters

A candidate is removed if:

- any allergen/excluded food/category/tag is present or allergen lineage is incomplete;
- its published total elapsed time exceeds the preference;
- its component versions are not published or conversions are incomplete;
- it has less than 100% unit, allergen-lineage, six-launch-nutrient, or target-price-book coverage;
- it is the current meal when selecting a replacement.

Preferences do not alter eligibility unless explicitly stored as exclusions.

#### Weekly hard constraints

- exactly seven assigned slots;
- no duplicate meal-option version in the same week;
- no more than two meals with the same primary protein group;
- no identical main recipe on adjacent days;
- all locked items remain on their original day;
- every item satisfies hard household rules and time limit.

Budget is a target with an explicit lexicographic fallback, not a hard eligibility constraint. Selection considers only complete valid plans actually discovered by the bounded deterministic search:

1. If at least one discovered complete plan is within budget, discard all over-budget plans from final ranking and choose among the within-budget plans by quality score.
2. If the search discovers complete plans but none within budget, choose the plan with the minimum **exact package-rounded consolidated purchase-basket cost**. Quality score is only the first tie-breaker after equal exact cost; stable ID sequence is the final tie-breaker.
3. A weighted quality score can never select a more expensive over-budget fallback over a cheaper discovered fallback.

The second outcome is still a successful ready plan with `budget_status = over`, exact overage, and warning codes `PLAN_OVER_BUDGET` and `NO_UNDER_BUDGET_PLAN_FOUND_IN_DETERMINISTIC_SEARCH`.

#### Search

Use deterministic bounded beam search rather than randomness or a general solver:

1. Sort eligible candidates by stable ID.
2. Precompute household-scaled ingredients, nutrition, theoretical basket contribution, and tags.
3. Expand partial plans one day at a time.
4. Reject partial plans that already violate hard variety constraints.
5. At each depth, retain the union of two deterministic frontiers: the first 125 partial plans by quality lower-bound then stable ID sequence, and the first 125 by exact package-rounded partial-basket cost then quality lower-bound then stable ID sequence. Duplicate states are stored once, so the beam contains at most 250 states.
6. For each complete plan, run exact weekly shopping aggregation and package-rounded cost.
7. If no complete plan survives to the final beam, return `NO_COMPLETE_PLAN_FOUND_IN_DETERMINISTIC_SEARCH` and state that the bounded search did not find a plan; do not claim global infeasibility.
8. Otherwise, apply the budget partition and lexicographic selection rules above.

Beam search is incomplete: failure to discover a complete or under-budget plan does not prove that none exists in the full combinatorial space. User-facing copy must say “Không tìm thấy thực đơn trong ngân sách trong phạm vi tìm kiếm xác định” (“No under-budget plan found within the deterministic search”), never “No under-budget plan exists.” Beam width/frontier allocation are code-versioned engine configuration. The catalog launch-size target must be performance-tested; if the 125/125 allocation is insufficient for plan quality or low-cost discovery, change it only with golden-test review and a new engine version. A complete general solver is not added for MVP.

#### Scoring

Quality scores are integer penalties; lower is better. Budget is not a weighted score component. The default quality version allocates 10,000 basis points:

| Component | Weight | Meaning |
|---|---:|---|
| Diversity | 3,500 | Penalize repeated protein groups, categories, cooking styles, and adjacent similar meals. |
| Nutrition composition | 2,500 | Apply the exact missing staple/main/vegetable-or-soup role penalty from Section 10.3. Ready-plan nutrient data coverage itself is always 100%. |
| Ingredient reuse/waste | 2,500 | Reward reuse of canonical perishables and lower package leftovers without rewarding repeated meals. |
| Preferences | 1,500 | Reward preferred foods/tags after safety, time, and diversity. |

Every component produces explanation codes and raw metrics. Scoring configuration is versioned and included in the plan fingerprint. For within-budget plans, exact basket cost is only a tie-breaker after equal quality; for over-budget fallback, exact basket cost is primary and quality is only a tie-breaker.

#### Determinism guarantee

The same normalized input snapshot, eligible catalog records/versions, price book, and engine version produces byte-equivalent canonical output. A newer catalog or engine may intentionally produce a different plan and is identified as such.

### 10.6 Meal replacement engine

Replacement is a constrained one-slot planning operation:

1. Lock the other six plan items.
2. Rebuild eligibility using the same household and plan snapshots.
3. Exclude the current meal-option version.
4. Reject candidates that would violate weekly hard constraints against locked items.
5. Recalculate the whole consolidated basket for each candidate because package rounding and reuse are non-additive.
6. If any candidate produces a complete within-budget week, rank only those candidates by quality score, then exact basket cost and stable ID. Otherwise rank all candidates by minimum exact package-rounded weekly basket cost, then quality score and stable ID.
7. Present candidates with cost delta, budget outcome, and bounded-search explanation; selection replaces only the target item.

The persistence operation is transactional and optimistic: it checks the plan version so two devices cannot silently overwrite one another. The new item references `replacement_of_item_id`; the old calculation remains in the audit trail or event record, while the active slot is unique.

### 10.7 Shopping-list engine

1. Read immutable scaled ingredient snapshots from all active plan items.
2. Convert each ingredient with its referenced immutable food-fact version, then group by stable canonical `food_id` in the food's permanent base dimension; preparation text never creates accidental duplicates. Preserve the contributing fact-version IDs in the authoritative snapshot for traceability.
3. Convert compatible quantities to the food's canonical shopping dimension.
4. Sum before any display or purchase rounding.
5. In Phase 5, subtract the generation-time pantry snapshot.
6. Select the locked price record and round upward to purchasable packages.
7. Emit required quantity, buy quantity, estimated cost, category, package leftover, and source plan-item IDs.
8. Sort by a stable grocery category order, then Vietnamese display name, then food ID.

If two recipe ingredients cannot convert to the same canonical dimension, generation fails catalog validation rather than emitting misleading duplicate lines.

## 11. API and transactional boundaries

### 11.1 Browser-to-server operations

The browser may query and mutate its own simple profile/household rows through Supabase under RLS. Authoritative domain use cases use trusted endpoints:

- `POST /api/plans/generate`
- `POST /api/plans/{planId}/replacements/preview`
- `POST /api/plans/{planId}/replacements/apply`
- `POST /api/admin/recipes/{id}/publish`
- `POST /api/admin/meal-options/{id}/publish`

URLs are illustrative contracts, not application code. Mutation requests include an idempotency key and expected resource version where applicable.

### 11.2 Authentication and authorization

The client sends a Supabase access token. The trusted endpoint verifies signed claims using Supabase's supported server-side method and derives `user_id` from the verified token, never from the request body. It uses a user-scoped Supabase client for reads and ordinary owned-data operations so RLS remains active.

A server secret/service credential is used only for narrowly justified system operations and is never exposed to Vite client environment variables. For plan persistence, the endpoint calls one transactional database RPC whose execute grant is restricted to `service_role`; the RPC validates the passed verified actor against household ownership, archives the prior week plan, and inserts the authoritative snapshots atomically. Browser roles have no execute grant on that RPC and no direct insert/update/delete grants on authoritative plan-item or shopping-result tables. Server-side authorization is repeated even when RLS also applies.

### 11.3 Generate-plan transaction

1. Authenticate and authorize household ownership.
2. Load and normalize household configuration.
3. Lock catalog/price/scoring versions and compute fingerprints.
4. Execute the pure engines in memory.
5. If calculation fails, return a sanitized typed failure and emit structured operational telemetry; do not create a plan row.
6. In one database transaction, archive any current ready plan for the week, then insert the new ready plan, plan items, calculation snapshots, shopping list, and shopping lines.
7. Return the persisted authoritative representation.

Generation is idempotent for `(household, week, input_fingerprint, idempotency_key)`. A retry cannot create duplicate active weeks.

## 12. Error handling and product behavior

Domain outcomes and failures are tagged unions, not thrown strings.

Successful ready-plan warnings include:

- `PLAN_OVER_BUDGET` — generation succeeded; carries exact `overage_vnd`;
- `NO_UNDER_BUDGET_PLAN_FOUND_IN_DETERMINISTIC_SEARCH` — no discovered complete plan was within budget; this is not a global infeasibility claim;
- `STALE_PRICE` — every required price remains within the usable maximum age, with observation dates included.

Fatal/blocked generation categories include:

- `INVALID_HOUSEHOLD_INPUT`
- `UNSUPPORTED_MEMBER_AGE`
- `NO_ELIGIBLE_MEALS`
- `INSUFFICIENT_CATALOG_DIVERSITY`
- `MISSING_UNIT_CONVERSION`
- `INCOMPLETE_ALLERGEN_LINEAGE`
- `MISSING_NUTRITION_DATA`
- `MISSING_PRICE_DATA`
- `NO_COMPLETE_PLAN_FOUND_IN_DETERMINISTIC_SEARCH`
- `STALE_PLAN_VERSION`
- `UNAUTHORIZED`
- `TRANSIENT_DEPENDENCY_FAILURE`

Expected domain failures produce specific Vietnamese UI messages and corrective actions. Examples:

- no meals after an allergy filter → identify the filter category without exposing private notes;
- no under-budget plan discovered by the bounded search → return the discovered valid plan with minimum exact package-rounded basket cost, exact overage, and precise bounded-search warning without claiming none exists globally;
- incomplete pricing → do not persist a ready plan; identify that the price catalog is incomplete and provide a retry/contact action without exposing admin internals;
- missing conversion/allergen assessment → block the affected candidate and alert admins through structured telemetry;
- stale replacement write → reload the current plan and preserve the user's attempted selection for confirmation.

Unknown server errors return a correlation ID, log sanitized context, and never expose SQL, tokens, or catalog administration details.

## 13. Security and RLS strategy

### 13.1 Baseline rules

- RLS is enabled on every table in an exposed schema.
- Grants and policies are both least-privilege; adding a policy is not treated as revoking broad grants.
- `anon` receives no household, plan, pantry, or admin catalog access.
- `authenticated` can read only its own household data and published catalog data needed by the UI.
- server secrets remain server-only; no `VITE_` variable contains a secret.
- separate policies are written and tested for select, insert, update, and delete.
- all foreign-key ownership paths used by RLS have supporting indexes.
- views exposed to clients use `security_invoker = true`.
- database functions default to `security invoker`.
- any required `security definer` helper lives in a non-exposed private schema, sets `search_path = ''`, fully qualifies every object, and has execute privileges explicitly revoked/granted.

These rules follow current [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) and [database-function security guidance](https://supabase.com/docs/guides/database/functions).

### 13.2 Ownership policy shape

- `profiles`: `user_id = auth.uid()`.
- `households`: `owner_user_id = auth.uid()`.
- child household tables: `exists` an owned household with matching ID.
- plans, items, shopping lists, and pantry: ownership is resolved through indexed household/plan joins.
- authenticated users cannot set or change owner IDs to another user; insert/update policies use both `using` and `with check`.
- authenticated users can select their own authoritative plans/lists but cannot directly write calculation snapshots; only the restricted trusted persistence path can do so.

MVP ownership is deliberately simple. A future household-membership table requires a separate authorization design and migration, not an overloaded owner policy.

### 13.3 Catalog and admin policies

- authenticated users can select only published foods, immutable published food-fact versions required by published recipes or their own plan snapshots, published recipe/meal-option versions, active price books, and required reference data; drafts remain inaccessible;
- drafts, retirement operations, publication validation, and audit logs require admin authorization;
- admin status is stored in signed `app_metadata`, not user-editable metadata or `profiles`;
- initial administrator bootstrap and every later administrator assignment/removal are trusted server/operations actions using the Supabase Admin API or an equivalently protected server command with a service credential; normal client APIs, browser code, profile editing, and the MVP admin UI cannot grant or revoke administrator status;
- every administrator-role change records an operational audit event naming the trusted actor and target user; removal also revokes the target's active sessions;
- publishing occurs through a trusted transactional use case that reruns all lineage and coverage checks;
- service credentials are used for migrations and the narrowly scoped trusted plan-persistence operation, never interactive browser administration.

Because JWT role claims can remain valid until token refresh, the trusted removal operation is not complete until active sessions are revoked.

### 13.4 Data minimization and privacy

- collect counts and age bands, not household member names, birth dates, sex, weight, health conditions, or medical diagnoses;
- limit free-text notes and never place them in telemetry;
- avoid logging access tokens, full request bodies, or household rule contents;
- define account deletion to cascade user-owned profile, household, plan, list, and pantry data while retaining only legally/operationally required sanitized audit records;
- document retention and backup behavior before production launch.

### 13.5 Abuse and operational controls

- rate-limit plan generation and replacement preview by verified user and IP;
- cap household counts, catalog candidate counts, request sizes, and free-text lengths;
- set server execution time limits and return retryable errors for transient failures;
- use strict CORS, security headers, dependency scanning, and secret scanning;
- keep production, preview/staging, and local Supabase projects separate;
- apply production schema only through reviewed migrations.

## 14. Testing strategy

### 14.1 Test pyramid

Most tests belong at the pure domain layer, where they are fast and exhaustive. Integration tests cover database and HTTP boundaries. A small Playwright suite covers critical user journeys.

### 14.2 Domain tests with Vitest

#### Example-based tests

- exact adult-equivalent totals for every member age band;
- scale factors above and below recipe yield;
- unit conversions for mass, volume, count, and food-specific gram mappings;
- package rounding at exact boundary, just below, and just above;
- edible-fraction and per-100-g nutrient formulas;
- missing data produces unknown/typed warnings, never numeric zero;
- deterministic tie resolution;
- when any discovered plan is within budget, every over-budget plan is excluded before quality ranking;
- when none discovered is within budget, fallback chooses minimum exact package-rounded basket cost even when a more expensive plan has a better quality score;
- current/stale/too-old price boundaries at 30, 31, 90, and 91 days;
- changing the current food-fact pointer leaves published recipe calculations and old plan snapshots byte-equivalent;
- replacement leaves six item IDs and snapshots unchanged;
- aggregation occurs before purchase rounding;
- pantry deduction floors at zero.

#### Property/invariant tests

Use generated fixtures without requiring a separate property-testing library initially:

- increasing member count never decreases ingredient requirements;
- scaling all member counts by the same positive factor scales unrounded recipe quantities by that factor;
- adding a hard exclusion never increases the eligible candidate set;
- no selected plan contains excluded/allergenic lineage;
- same canonical inputs produce identical fingerprints and results across repeated runs;
- ingredient order and candidate query order do not affect results;
- bounded-search miss outcomes never use global-infeasibility message keys;
- known shopping cost never decreases when a required amount crosses into an additional package, absent pantry changes;
- applying a replacement changes exactly one active slot;
- plan score/explanations correspond to recomputed component metrics.

#### Golden tests

Maintain small, reviewed Vietnamese catalog fixtures and expected seven-day results for representative households:

- two adults;
- two adults plus a young child;
- multigenerational household;
- vegetarian exclusions;
- common allergen exclusion;
- tight but feasible budget;
- infeasible time/catalog combination;
- minimum-exact-cost discovered over-budget fallback;
- high ingredient-reuse opportunity.

Golden output changes require an intentional engine/catalog version note, not blind snapshot updates.

### 14.3 Component tests with React Testing Library

- onboarding validation and accessible error association;
- age-band count editing;
- allergy/exclusion distinction and warning copy;
- budget scope copy (“7 bữa chính”);
- loading, partial-data warning, empty, over-budget, and failure states;
- plan day navigation and recipe quantities;
- replacement preview cost delta and cancel behavior;
- shopping line source details, checking, and package leftover display;
- keyboard navigation and screen-reader labels.

Tests assert user-visible behavior rather than implementation details.

### 14.4 Database and RLS tests

Local Supabase verification requires a working Docker-compatible container runtime. Phase 0 preflight must verify the runtime before relying on `supabase start`, `supabase db reset`, or pgTAP. If unavailable, report `BLOCKED: Docker-compatible container runtime unavailable`; do not silently skip local database/RLS verification, substitute an unapproved remote database, weaken the release gate, or mark Phase 0 complete. Once available, run local Supabase migrations from a clean reset and test with pgTAP and/or client integration tests. Supabase documents pgTAP support specifically for schema, constraints, functions, and RLS [in its testing guidance](https://supabase.com/docs/guides/local-development/testing/overview).

Required cases:

- anonymous user cannot read private data;
- user A cannot select, insert, update, or delete user B's household descendants;
- owner IDs cannot be reassigned;
- ordinary authenticated user cannot see drafts or write catalog data;
- admin can perform only intended catalog operations;
- removed admin claim/session behavior is exercised;
- `security_invoker` views preserve underlying RLS;
- function execution grants are restricted;
- published-version immutability constraints hold;
- published food-fact rows and nutrient/allergen/dietary/conversion children reject mutation, while current-pointer updates do not rewrite recipe references;
- unique active plan/week and recipe-version constraints hold;
- initial/admin role assignment and removal are unavailable to normal client roles;
- cascades remove user-owned data but not referenced catalog history.

### 14.5 API integration tests

- forged/missing/expired token rejection;
- household ID in body cannot override token ownership;
- idempotent generation retry;
- authoritative totals ignore client-supplied computed fields;
- transactional rollback on snapshot/list failure;
- persistence rejects any mismatch between the sum of authoritative shopping lines, shopping-list basket estimate, and meal-plan total;
- stale plan version replacement conflict;
- rate/size limits and typed errors;
- catalog fingerprint changes when an eligible version changes.
- Docker-compatible runtime preflight reports the database gate as blocked rather than skipped when the runtime is unavailable.

### 14.6 Playwright critical paths

Keep end-to-end coverage focused:

1. sign up/sign in → complete onboarding → generate plan → open meal → open shopping list;
2. replace one meal → verify other six remain → verify cost/list changes;
3. configure exclusion/allergy → verify unsafe seeded meal never appears;
4. admin drafts and publishes a valid recipe/meal option → it becomes eligible;
5. mobile viewport accessibility smoke and deep-link refresh.

### 14.7 Non-functional verification

- planner benchmark with launch-size catalog at small, median, and maximum household sizes;
- generation target: p95 trusted endpoint latency below 2 seconds at expected launch catalog size, measured before release;
- responsive checks at 320 px width and common mobile sizes;
- automated accessibility checks plus manual keyboard/screen-reader smoke tests;
- dependency, secret, and SQL linting in CI;
- clean `supabase db reset`, unit/component tests, production build, RLS tests, and Playwright smoke are release gates.

## 15. UX architecture

### 15.1 Onboarding

Use one focused mobile step per decision group:

1. household counts and child age bands;
2. seven-meal budget and baseline price region disclosure;
3. exclusions/allergies and preferences;
4. maximum total cooking time;
5. confirmation with adult-equivalent planning explanation.

Defaults must be obvious, back navigation must preserve answers, and users can finish without free text. Allergy selection uses canonical choices and clearly distinguishes “allergy/exclude” from “prefer.”

### 15.2 Weekly plan

The default screen shows seven compact day cards, cost progress against the seven-meal budget, price/nutrition coverage, and warnings. Each day opens the complete meal set with scaled ingredients and ordered quick instructions. Replacement is an action on one day, not a global regenerate button disguised as replacement.

### 15.3 Trust and explanation

Users should be able to see:

- who quantities are sized for and the adult-equivalent estimate;
- the baseline region/date behind prices;
- confirmation that required lines have complete price/nutrient coverage, plus any stale price observation dates;
- why a meal was selected through short fixed explanation labels;
- exact budget overage or remaining amount;
- the distinction between required and purchasable package quantities.

No UI says “allergy safe,” “nutritionally complete,” or “guaranteed price.” Prefer “filtered using your saved exclusions,” “estimated nutrition,” and “estimated basket cost.”

## 16. Observability and production operations

Emit structured events with correlation ID, engine version, catalog fingerprint, duration, candidate counts, coverage, and typed outcome. Do not include access tokens, member notes, or full food-rule lists.

Core metrics:

- onboarding completion;
- generation success/failure by typed reason;
- eligible candidate count distribution;
- generation latency and search states explored;
- percent within budget and median overage;
- nutrition/price coverage;
- replacement preview/apply rate;
- missing conversion/allergen/price data by catalog entity;
- stale price-book age;
- client and server error rate.

Alerts cover sustained generation failures, authorization anomalies, elevated latency, catalog coverage regression, and missing current price books. Planner quality metrics are product signals, not ML inputs in the MVP.

## 17. Delivery phases and exit gates

### Phase 0 — Foundation

After explicit approval only: initialize the repository, strict TypeScript/Vite/React/Tailwind/shadcn foundation, Vitest/RTL/Playwright, Supabase local development/migrations, Vercel Function harness, CI, environment validation, and architecture boundaries. Environment preflight first verifies a Docker-compatible container runtime. If it is unavailable, local database verification is explicitly `BLOCKED` and the phase cannot satisfy its exit gate; the gate is never skipped or weakened. Exit only when clean install, build, unit test, browser smoke, and clean local database reset/RLS verification all pass.

### Phase 1 — Household and onboarding

Profiles, owned household, grouped members, plan-budget scope, canonical rules, time preference, auth, RLS, and mobile onboarding. Exit when a user can persist and edit a valid household without cross-user access.

### Phase 2 — Food and recipe engine

Units, stable foods, immutable food-fact versions, allergens, nutrients, prices, immutable recipe versions, curated meal options, admin publication validation, portion/nutrition/cost engines, and launch fixtures. Exit when golden calculations, fact-version dependency/immutability checks, and publication/RLS gates pass.

### Phase 3 — Meal planner

Eligibility, deterministic search/scoring, seven-day persistence, explanations, recipe/meal view, and single-slot replacement. Exit when golden plans, determinism, performance, budget fallback, allergy lineage, and replacement invariants pass.

### Phase 4 — Shopping list

Canonical aggregation, package rounding, source traceability, cost coverage, checking, and mobile list UI. Exit when all list lines reconcile to plan snapshots and weekly totals.

### Phase 5 — Pantry and waste reduction

Simple current pantry amounts, generation-time snapshot, deterministic subtraction, and leftover-aware score. Exit when pantry changes never rewrite an existing plan silently and deductions are traceable.

### Phase 6 — UX polish

Accessibility, performance, resilient states, content refinement, observability, production operations, and catalog-quality expansion. Exit against launch SLOs and manual QA.

### Phase 7 — AI assistant (future)

Only after deterministic APIs are stable. AI may translate natural language into proposed structured inputs and explain existing deterministic outputs. It cannot author or override quantities, nutrition, price, allergy, cost, or eligibility results. Structured changes require user confirmation and the same validation as UI input.

Each phase needs its own implementation plan and approval checkpoint. This specification should not become one monolithic implementation plan.

## 18. Catalog launch requirements

Planner usefulness depends more on curated data than algorithm novelty. Before a public MVP, the catalog should contain enough published complete meal options to preserve choice after common exclusions.

The launch gate is scenario-based rather than an arbitrary row count:

- every golden household scenario has at least 21 eligible meal options before weekly constraints;
- each supported primary protein group has enough options to satisfy the two-per-week cap;
- every published option has complete allergen lineage and unit conversions;
- every launch option has 100% coverage for all six launch nutrients across required edible ingredients;
- every candidate counted as eligible for a launch scenario has a current or stale-but-usable price within `PriceFreshnessConfigV1.usableMaxAgeDays` for every required shopping line in the scenario's price book;
- editor review confirms Vietnamese culinary coherence and that published complete-meal elapsed times are plausible.

Allergen, unit conversion, six-launch-nutrient, and selected-price-book completeness are absolute gates for a ready plan. Stale-but-usable prices remain visible with observation dates and warnings; too-old prices fail the gate.

## 19. Key risks and mitigations

| Risk | Mitigation |
|---|---|
| Portion coefficients feel too small/large | Keep coefficients code-versioned with the deterministic engine, copy them into snapshots, instrument replacements/waste feedback later, and change only with tested evidence. |
| Price estimate loses trust | Display region/date/freshness state, reject prices beyond the versioned maximum age, use package-rounded basket cost, alert on stale books, and avoid retailer-quote language. |
| Catalog cannot satisfy exclusions and variety | Enforce scenario-based launch gates and typed catalog-insufficiency errors. |
| Allergy metadata is incomplete | Require explicit assessment and full derived closure before publication; unknown means ineligible. |
| “Healthy” becomes a medical claim | Keep signals recipe-level and explainable; no personalized targets or diagnoses. |
| Beam search misses a better or under-budget plan | State bounded-search outcomes precisely, keep separate quality/cost frontiers, benchmark against exhaustive search on small fixtures, retain deterministic golden cases, and version width/frontier changes. |
| Ingredient reuse rewards monotony | Enforce hard diversity constraints before applying the smaller reuse score. |
| Old plans drift after catalog edits | Stable food identity plus immutable food-fact/recipe/meal/price versions, composite recipe references, content fingerprints, and stored calculation snapshots. |
| Client tampers with calculations | Execute authoritative use cases in trusted functions and ignore client totals. |
| RLS policy gaps expose household data | Default-deny grants/RLS, negative pgTAP tests for every operation, and reviewed migrations. |
| Admin workflow expands into a CMS project | Limit to structured CRUD, validation, publish, retire, and audit; no media workflow in MVP. |
| Vite SPA deep links fail in production | Add the documented Vercel SPA rewrite and test direct route refresh; Vercel documents the required rewrite for Vite SPAs [here](https://vercel.com/docs/frameworks/frontend/vite). |

## 20. Approval decisions

Approval of this specification approves the following design defaults, not implementation:

1. seven primary meals per week, with the entered budget scoped to those seven meals;
2. curated complete meal options composed from versioned dish recipes;
3. one owned household per account and anonymous member groups;
4. adult-equivalent portion coefficients in Section 8.1 as version 1 planning estimates;
5. one transparent baseline price region/book at launch;
6. recipe-level estimated nutrition and diversity signals, with no clinical adequacy claims;
7. shared pure TypeScript engines executed authoritatively in trusted Vercel Functions;
8. stable food identities with immutable food-fact, recipe, meal-option, and price versions plus immutable plan calculation snapshots;
9. deterministic bounded beam search with separate quality/cost frontiers, precise non-proof language, within-budget quality ranking, and minimum-exact-cost over-budget fallback;
10. least-privilege Supabase grants/RLS, server-side verified identity, and trusted-operations-only administrator bootstrap/removal;
11. Docker-compatible runtime as a non-skippable local Supabase verification prerequisite;
12. phase-specific implementation plans and approval gates after this design.

If any decision changes, update this specification before creating the corresponding implementation plan.

## 21. Definition of design completion

This design is complete when the user has reviewed and explicitly approved it. Approval authorizes creation of a Phase 0 implementation plan only. It does not authorize application code, schema migrations, infrastructure provisioning, external accounts, or deployment.
