# Phase 4 Shopping List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-first, owner-scoped “Đi chợ” experience for the current immutable meal-plan revision by projecting the existing authoritative Phase 3 purchase basket into a traceable persisted shopping list with separate checked state, without adding pantry or any other Phase 5 behavior.

**Architecture:** Keep `calculatePurchaseBasket` as the only package-rounded cost implementation. During authoritative server-side plan generation or replacement, build a label-free `ShoppingListSnapshotV1` from the normalized exact planner input and the already-calculated Phase 3 basket, include that projection in the immutable calculation snapshot, and persist revision, plan items, shopping list, sources, and checked-state carry-forward in the existing restricted PostgreSQL transaction. Browser code reads the owner-scoped result through a security-invoker RPC and toggles only separate mutable check-state rows through a narrowly scoped ownership-checking security-definer RPC; it never authors or recalculates quantities, costs, provenance, or fingerprints.

**Tech Stack:** Node 24, strict TypeScript, Decimal.js, React/Vite, Vitest/React Testing Library, Supabase/PostgreSQL migrations and pgTAP, Supabase JS, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-25-bep-nha-design.md`

## Global Constraints

- Work only on `codex/phase-4-shopping-list`. Do not merge `main`, deploy, link Supabase/Vercel, run remote or production migrations, or mutate remote/production data.
- Exact approved Phase 3 HEAD `00380a677fb3c1d8eba8043f6e4745a6b0d242e2` must remain an ancestor of every implementation commit. Never reconstruct Phase 0–3 files manually.
- Preserve `calculatePurchaseBasket` in `src/domain/pricing/calculate-purchase-basket.ts` as the sole package/purchase-increment rounding algorithm. Phase 4 may validate and project its output, but must not calculate a second authoritative total.
- Generate shopping data only from the exact normalized plan input and immutable ready-plan/revision snapshot. Never query `foods.current_fact_version_id`, recipe/meal-option current pointers, or a region current-price-book pointer to reinterpret a revision.
- Mutable food and recipe display labels are read/presentation data only. They are excluded from canonical shopping snapshots and every calculation fingerprint.
- Every newly generated, regenerated, or replaced Phase 4 revision uses the single production constant `PLANNER_ENGINE_VERSION = "planner-engine-v2"`. Historical Phase 3 rows remain `planner-engine-v1` and are never rewritten.
- Domain code remains deterministic and framework-independent: no React, Supabase, Vercel, environment access, wall clock, random ordering, AI, NLP, or free-text interpretation.
- All authoritative quantities remain canonical, unrounded Decimal strings until presentation. VND values remain safe non-negative integers. Missing/unusable price or incompatible unit dimension fails the whole result; it never becomes zero or a partial total.
- Use TDD for deterministic shopping behavior and browser state. Write pgTAP assertions before migration implementation when local Docker is available. If Docker is unavailable, record `LOCAL_DB_VERIFICATION_UNAVAILABLE` and `DATABASE_RLS_GATE_PENDING_CI`; do not claim local database RED/GREEN.
- Local Docker absence does not block non-database tasks. Database/RLS/type-drift/integration verification must pass locally or in exact-final-HEAD GitHub Actions. Never use remote Supabase as a substitute.
- Each implementation task ends with focused verification, `git diff --check`, status inspection, and one task-only conventional commit. Do not weaken inherited tests, constraints, grants, RLS, or validations.
- Explicitly defer pantry, custom grocery items, retailer workflows, price comparison, delivery, payment, receipt/barcode/OCR, notifications, collaboration/offline sync, AI/ML, and every Phase 5+ behavior.

---

## 0. Approved Base, Branch, and Gate 0

### 0.1 Plan-writing evidence

At plan-writing time:

- `origin` was fetched with pruning;
- `codex/phase-4-shopping-list` was created directly from exact approved Phase 3 HEAD `00380a677fb3c1d8eba8043f6e4745a6b0d242e2`;
- `git merge-base --is-ancestor 00380a6... HEAD` succeeded;
- the tracked and untracked worktree was clean before this plan file;
- approved Phase 3 exact-HEAD evidence is [GitHub Actions run 33063159047](https://github.com/ntgiang1235-ux/Bepnha/actions/runs/33063159047), with `web = success` and `database = success`.

No foundation merge is required. Do not merge `main` or another moving branch.

### 0.2 Mandatory implementation-start prerequisite

Before Gate 0 or Task 1:

```powershell
$phase3Head = "00380a677fb3c1d8eba8043f6e4745a6b0d242e2"
git fetch origin --prune
git switch codex/phase-4-shopping-list
git cat-file -e "$phase3Head^{commit}"
if ($LASTEXITCODE -ne 0) { throw "PHASE_4_BLOCKED_APPROVED_PHASE_3_HEAD_MISSING" }
git merge-base --is-ancestor $phase3Head HEAD
if ($LASTEXITCODE -ne 0) { throw "PHASE_4_BLOCKED_PHASE_3_NOT_IN_ANCESTRY" }
git diff --quiet --
if ($LASTEXITCODE -ne 0) { throw "PHASE_4_BLOCKED_TRACKED_WORKTREE_NOT_CLEAN" }
git diff --cached --quiet --
if ($LASTEXITCODE -ne 0) { throw "PHASE_4_BLOCKED_INDEX_NOT_CLEAN" }
git status --short
```

Inspect every untracked path. Stop with `PHASE_4_BLOCKED_UNTRACKED_FILE_COLLISION` if any path collides with an expected Phase 4 path. Do not delete or overwrite unrelated files.

If ancestry fails in a future environment, fetch only the approved Phase 3 branch, verify its remote HEAD is the exact approved SHA, and integrate that exact SHA as a separate prerequisite commit:

```powershell
git fetch origin codex/phase-3-planner
if ((git rev-parse origin/codex/phase-3-planner) -ne $phase3Head) {
  throw "PHASE_4_BLOCKED_REMOTE_PHASE_3_HEAD_MISMATCH"
}
git merge --no-ff --no-edit $phase3Head
git merge-base --is-ancestor $phase3Head HEAD
```

Run inherited Phase 3 non-database gates, push the integration commit, and require `web` and `database` success for that exact integration HEAD before Task 1. Never recreate prior-phase files.

### 0.3 Capability and inherited verification gate

```powershell
node --version
npm --version
npm ci
npm run preflight
npm run verify:non-db
docker version
```

- Node must satisfy `>=24 <25`; otherwise report `PHASE_4_BLOCKED_NODE_24_REQUIRED`.
- `preflight` and inherited non-database verification must pass before implementation.
- `docker version` is capability detection only. Record `LOCAL_DB_VERIFICATION_AVAILABLE` when usable; otherwise record `LOCAL_DB_VERIFICATION_UNAVAILABLE`, continue non-database tasks, and require exact-final-HEAD CI database success.
- If Docker is available, run the inherited clean local database gate before Task 1:

  ```powershell
  npm run supabase:start
  npm run supabase:reset
  npm run supabase:lint
  npm run supabase:test
  npm run db:types:check
  npm run test:integration
  npm run test:integration:catalog-admin
  npm run test:integration:planner
  npm run test:e2e:onboarding
  npm run test:e2e:planner
  npm run supabase:stop
  ```

Stop on any inherited regression. Do not alter Phase 0–3 behavior to conceal it.

---

## 1. Current Phase 3 Architecture Assessment

The implementation must extend these actual contracts rather than copy the design specification's earlier illustrative tables:

- `meal_plans` identifies one household/week and points to `current_revision_id`.
- `meal_plan_revisions` is immutable after `state = 'ready'` and stores exact input/calculation snapshots, config versions, fingerprints, budget, cost, warnings, and replacement ancestry.
- `meal_plan_items` stores exactly seven distinct day slots and exact meal-option versions. Its item snapshot already carries the scaled selected candidate.
- `public.persist_meal_plan_revision(...)` is the sole service-role-only transaction that creates revisions/items, enforces seven days and replacement invariants, seals a revision, and advances the current pointer.
- `private.plan_transition_context` and history-protection triggers prevent out-of-band mutation of plan evidence.
- `private.assert_plan_summary_row(...)` already verifies plan/revision fingerprint and total consistency and the persisted `calculation_snapshot.purchaseBasket` line sum.
- generation and replacement both call `calculatePurchaseBasket`; replacement recomputes the complete seven-day basket rather than applying line deltas.
- the basket line already contains exact `foodId`, `baseUnitId`, required/package/purchase/leftover quantities, price/book/fact IDs, observation date, freshness, and line cost.
- `scaleMealOption` already emits exact `mealOptionRecipeId` and `recipeIngredientId`, but `EligibleMealOption.scaledIngredients` currently narrows those fields away. Phase 4 must retain them explicitly; it must never parse the colon-delimited `sourceId`.
- `PlannerIngredientLineageInput` already carries pinned fact ID/hash, exact category ancestry, allergen data, nutrients, and base unit. Phase 4 must add the food's permanent `baseDimension` from the authoritative food identity to this normalized lineage so incompatible dimensions can be rejected without a later catalog lookup.
- no Phase 3 GET endpoint loads a persisted plan. Existing planner Functions are POST-only generation/replacement boundaries; the browser already owns a user-scoped Supabase client suitable for narrow owner-read/check RPCs.

Consequences:

1. A shopping list is one immutable projection per exact `meal_plan_revision_id`, not one mutable row per `meal_plan_id`.
2. The projection is produced before the calculation fingerprint and included inside `calculation_snapshot`; the fingerprint therefore covers shopping quantities, exact sources, categories, and warnings but no mutable labels or check state.
3. The existing persistence RPC is extended to derive relational shopping rows from that snapshot in the same transaction. There is no second “recalculate shopping cost” endpoint.
4. Existing Phase 3 revisions created before the Phase 4 migration are not reconstructed from current catalog data. An exact legacy revision without a stored `shoppingList` projection returns typed `SHOPPING_LIST_NOT_AVAILABLE_FOR_LEGACY_REVISION`; generating/regenerating a new revision produces Phase 4 evidence.
5. Adding the authoritative shopping projection changes canonical calculation output, so all new Phase 4 revisions use `planner-engine-v2`; the version is part of canonical input before `inputFingerprint` is calculated.

---

## 2. Fixed Phase 4 Domain Contracts

### 2.1 Engine and fingerprint version boundary

Add `src/domain/planner/planner-engine-version.ts` with the one production-write constant:

```typescript
export const PLANNER_ENGINE_VERSION = "planner-engine-v2" as const
export type PersistedPlannerEngineVersion = "planner-engine-v1" | typeof PLANNER_ENGINE_VERSION
```

Generation, regeneration, and replacement import this constant for both snapshot construction and `PersistPlannerRevisionCommand.engineVersion`; they must not repeat a `planner-engine-v2` string literal. The v1 union member exists only to type/read/replay persisted legacy evidence. No migration updates those rows and no new write uses v1.

Extend `PlannerSnapshotSource` and its canonical `inputPayload` with:

```typescript
readonly engineVersion: PersistedPlannerEngineVersion
```

Canonical input construction becomes:

```text
inputSnapshot = {
  engineVersion: PLANNER_ENGINE_VERSION,
  ...normalized household/date/config/catalog input,
  catalogFingerprint
}
inputFingerprint = sha256(canonical(inputSnapshot))
calculationSnapshot.inputFingerprint = inputFingerprint
calculationFingerprint = sha256(canonical(calculationSnapshot))
```

Therefore identical household/catalog/business input evaluated under legacy v1 versus Phase 4 v2 cannot share an `inputFingerprint`, and the calculation fingerprint transitively identifies the engine through its embedded input fingerprint. Persisted `meal_plan_revisions.engine_version`, `input_snapshot.engineVersion`, and the application persistence command must agree or the transaction fails.

Do not change `PortionConfigV1`, `PriceFreshnessConfigV1`, or `PlannerConfigV1`: Phase 4 does not alter their algorithms. The engine-version increment accounts for the new canonical shopping output/input contract.

### 2.2 Authoritative snapshot

Add `ShoppingListSnapshotV1` with only calculation-bearing immutable data:

```typescript
interface ShoppingListSnapshotV1 {
  readonly version: "shopping-list-v1"
  readonly groceryCategoryConfigVersion: "grocery-category-v1"
  readonly lines: readonly ShoppingListSnapshotLineV1[]
  readonly totalEstimatedCostVnd: number
  readonly warnings: readonly ShoppingWarning[]
}
```

Each `ShoppingListSnapshotLineV1`, canonically ordered by `foodId`, contains:

- every numeric/provenance field copied exactly from the matching Phase 3 `PurchaseBasketLine`;
- deterministic `groceryCategoryCode`;
- sorted unique exact fact refs `{ foodFactVersionId, contentHash }`;
- sorted sources containing `dayIndex`, `mealOptionId`, `mealOptionVersionId`, `mealOptionRecipeId`, `recipeVersionId`, `recipeIngredientId`, `foodId`, `foodFactVersionId`, `baseUnitId`, and canonical unrounded `requiredBaseQuantity`;
- no food/recipe/meal-option display names, preparation text, checked state, retailer data, pantry deduction, or presentation rounding.

The builder consumes normalized exact `PlannerInputV1` plus `ReadyPlan`. It does not call `calculatePurchaseBasket`; it validates that the ready plan's basket has exactly one line for each aggregated stable food and copies those authoritative purchase results.

### 2.3 Canonical consolidation and source integrity

For each of seven selected items:

1. read its retained scaled ingredients and exact pinned lineage, including permanent `baseDimension` loaded with the authoritative planner input;
2. match by explicit `mealOptionRecipeId + recipeIngredientId + foodId + foodFactVersionId`, rejecting absent, duplicate, or conflicting lineage;
3. aggregate unrounded `requiredBaseQuantity` by stable `foodId` only after confirming every contribution has the same permanent `baseUnitId` and catalog dimension;
4. reject incompatible base units/dimensions with typed `INCOMPATIBLE_CANONICAL_DIMENSION`;
5. compare each canonical aggregate byte-for-byte with the corresponding `purchaseBasket.requiredBaseQuantity` and compare every other basket field without recalculation;
6. reject absent/extra/duplicate basket lines or any mismatch with typed `PURCHASE_BASKET_PROJECTION_MISMATCH`;
7. preserve every source and every exact fact ID/hash in stable order.

Preparation text is never an identity key. Contributions with the same stable `foodId` remain one line even when preparation text, recipes, or pinned historical fact versions differ.

### 2.4 Multiple pinned fact versions and grocery categories

Add code-versioned `GROCERY_CATEGORY_CONFIG_V1`; do not create an editable database configuration table for MVP. It maps exact pinned Phase 2 category ancestry codes to these stable shopping groups and order:

| Order | Code | Vietnamese label | Exact Phase 2 category codes |
|---:|---|---|---|
| 10 | `fresh_produce` | Rau củ | `vegetable` |
| 20 | `meat_seafood` | Thịt, cá & hải sản | `pork`, `beef`, `poultry`, `seafood`, `fish`, `crustacean`, `mollusc` |
| 30 | `eggs_tofu_dairy` | Trứng, đậu hũ & sữa | `egg`, `tofu`, `dairy` |
| 40 | `staples` | Lương thực chính | `staple` |
| 50 | `seasonings` | Gia vị | `seasoning` |
| 60 | `other` | Khác | root-only `food`, unknown mapping, or ambiguity fallback |

Resolve each contribution from its pinned `categoryAncestry`, preferring the most-specific mapped code; do not read mutable current facts. If all contributions for a stable food resolve to the same group, persist that group. If pinned historical fact versions resolve to different groups, persist `other` and `CATEGORY_AMBIGUITY` with sorted fact/category evidence. An unmapped ancestry also produces `other` plus `CATEGORY_UNMAPPED`. These warnings affect neither required quantity nor cost.

This exact config version and resolved code enter the shopping snapshot/fingerprint. Vietnamese labels and display order are code presentation metadata keyed by that version; mutable food names do not enter the snapshot.

### 2.5 Price outcomes

Reuse `PriceFreshnessConfigV1` exactly:

- 0–30 days: `current`, usable;
- 31–90 days: `stale_usable`, successful with `STALE_PRICE` and exact `observedAt`;
- >90 days, future, or missing: fatal and therefore impossible in a ready Phase 3 basket.

Phase 4 validates/copies the basket's exact `foodPriceId`, `priceBookId`, `priceFoodFactVersionId`, observation date, freshness, package values, and cost. It never substitutes a current book, treats stale as fatal, or creates a zero/partial line.

### 2.6 Cost and fingerprint invariants

At domain, application, and transaction boundaries require:

```text
shoppingSnapshot.totalEstimatedCostVnd
== sum(shoppingSnapshot.lines[*].lineCostVnd)
== calculationSnapshot.purchaseBasket.totalEstimatedCostVnd
== meal_plan_revisions.total_estimated_cost_vnd
== meal_plans.total_estimated_cost_vnd when that revision is current
== shopping_lists.estimated_purchase_cost_vnd
== sum(shopping_list_items.line_cost_vnd)
```

Each shopping line's purchase fields must be byte-equivalent to the corresponding persisted Phase 3 basket line. Any mismatch aborts the whole persistence transaction, leaving neither a revision nor a partial list.

`ShoppingListSnapshotV1` is inserted into the calculation payload before `calculationFingerprint` is hashed. `shopping_lists.calculation_fingerprint` stores exactly the revision fingerprint. Check state and mutable display labels are loaded after calculation and never affect this hash.

For every newly written Phase 4 revision:

```text
meal_plan_revisions.engine_version
== input_snapshot.engineVersion
== PLANNER_ENGINE_VERSION
== "planner-engine-v2"
```

Because `calculation_snapshot.inputFingerprint` is calculation-bearing, the calculation fingerprint transitively commits to this engine version. Historical v1 rows retain their original snapshots/fingerprints and are never normalized into v2 after the fact.

### 2.7 Authoritative output versus user state

Authoritative and immutable after persistence:

- list/revision relationship;
- stable food, base unit, exact fact refs, exact price provenance;
- canonical required/package/purchase/leftover quantities;
- package count, line/total cost, category code, warnings, and source links;
- calculation fingerprint.

Mutable owner state:

- only whether a shopping item is checked and its `checked_at` timestamp.

Use separate `shopping_item_check_states` rows. Authenticated users receive no INSERT/UPDATE/DELETE grants on authoritative list/item/source tables or direct DML grants on check-state rows. A narrowly scoped security-definer RPC with an empty search path verifies exact ownership before inserting/deleting one check-state row.

For a new replacement/regeneration revision, copy a prior checked state only when:

```text
new.food_id == prior.food_id
AND new.base_unit_id == prior.base_unit_id
AND new.required_base_quantity_text === prior.required_base_quantity_text
```

The final comparison is exact PostgreSQL text equality on canonical Decimal strings. Any requirement or base-unit change resets state. Package-count-only differences cannot occur when exact requirement and exact pinned calculation input are unchanged; if provenance/price changes while requirement stays equal, preserving the user's “already picked this amount” state is still intentional because the approved rule keys carry-forward only on stable food plus byte-equivalent requirement.

---

## 3. Database Design

Create `supabase/migrations/20260827000000_phase_4_shopping_list.sql`.

### 3.1 Tables and keys

`shopping_lists`:

- `id uuid primary key default gen_random_uuid()`;
- `meal_plan_id uuid not null` and `meal_plan_revision_id uuid not null unique`;
- composite FK `(meal_plan_id, meal_plan_revision_id)` to `meal_plan_revisions(meal_plan_id, id)` with `on delete cascade` only for household/plan teardown;
- `snapshot_version text not null check (= 'shopping-list-v1')`;
- `grocery_category_config_version text not null check (= 'grocery-category-v1')`;
- `calculation_fingerprint text not null` lowercase SHA-256;
- `estimated_purchase_cost_vnd bigint not null` safe, non-negative;
- `warnings jsonb not null` array;
- `created_at timestamptz not null default now()`;
- unique `(id, meal_plan_revision_id)` for context-bearing child FKs.

`shopping_list_items`:

- `id uuid primary key default gen_random_uuid()`;
- `shopping_list_id uuid not null` and `meal_plan_revision_id uuid not null`;
- composite FK `(shopping_list_id, meal_plan_revision_id)` to `shopping_lists(id, meal_plan_revision_id)`;
- `food_id uuid not null`, `base_unit_id uuid not null`, with composite FK to `foods(id, base_unit_id)`;
- canonical Decimal text columns for `required_base_quantity`, `package_base_quantity`, `purchase_increment`, `purchase_package_count`, `purchase_base_quantity`, and `leftover_base_quantity`;
- `package_price_vnd bigint not null` positive safe integer and `line_cost_vnd bigint not null` non-negative safe integer;
- exact `food_price_id uuid not null`, `price_book_id uuid not null`, `price_food_fact_version_id uuid not null`, `observed_at date not null`, and `freshness text check in ('current','stale_usable')`;
- FK `(food_id, price_food_fact_version_id)` to `food_fact_versions(food_id,id)`;
- add a non-destructive unique key `(price_book_id,id)` on `food_prices`, then composite FK `(price_book_id,food_price_id)` to it;
- `grocery_category_code` constrained to the six V1 codes;
- unique `(shopping_list_id, food_id)` and unique `(shopping_list_id, id)`.

Use a private immutable `is_canonical_decimal_text(text, allow_zero boolean)` helper for the Decimal text checks. Canonical form is plain non-negative decimal without exponent, leading zeros, trailing fractional zeros, or a decimal point without a fractional digit. Required/package/increment/package-count/purchase quantities are positive; leftover may be zero. DB validation also requires `purchase_base_quantity >= required_base_quantity`, `leftover = purchase - required`, and VND line-cost/package-price consistency as exact numeric/integer relationships using stored values. These checks validate the persisted primitive output; they do not become another application cost algorithm.

`shopping_list_item_sources` is the only new relational provenance graph and is justified because generated `meal_plan_item_id` values do not exist until the persistence transaction:

- `shopping_list_item_id uuid not null`, `shopping_list_id uuid not null`, `meal_plan_revision_id uuid not null`;
- `meal_plan_item_id uuid not null` with a direct FK to the exact revision item;
- `meal_option_recipe_id uuid not null` with a direct FK to `meal_option_recipes(id)`;
- `recipe_version_id uuid not null`, `recipe_ingredient_id uuid not null` with the existing composite FK target `recipe_ingredients(recipe_version_id,id)`;
- `food_id uuid not null`, `food_fact_version_id uuid not null`, and exact `base_unit_id uuid not null`;
- composite FKs `(food_id, food_fact_version_id)` to `food_fact_versions(food_id,id)` and `(food_id,base_unit_id)` to the permanent food identity `foods(id,base_unit_id)`;
- canonical positive `required_base_quantity text not null`;
- primary key `(shopping_list_item_id, meal_plan_item_id, meal_option_recipe_id, recipe_ingredient_id)`;
- composite FK `(shopping_list_id, shopping_list_item_id)` to `shopping_list_items(shopping_list_id,id)` and composite FK `(shopping_list_id,meal_plan_revision_id)` to `shopping_lists(id,meal_plan_revision_id)`;
- a narrowly scoped `private.assert_shopping_source_row()` integrity trigger proves the complete cross-table chain that the remaining direct FKs cannot express without duplicating `meal_option_version_id`.

For every source row, that trigger must prove all of the following from existing rows:

1. `meal_plan_item_id` belongs to the source/list's exact `meal_plan_revision_id`;
2. `meal_option_recipe_id` has `meal_option_version_id = meal_plan_items.meal_option_version_id`;
3. that exact component's `recipe_version_id` equals the source `recipe_version_id`;
4. `(recipe_version_id, recipe_ingredient_id)` identifies the exact recipe ingredient;
5. the recipe ingredient's `food_id` and `food_fact_version_id` equal the source values;
6. source `food_id` equals `shopping_list_items.food_id`;
7. source `base_unit_id` equals both `shopping_list_items.base_unit_id` and permanent `foods.base_unit_id`.

The trigger must **not** compare source `base_unit_id` to `recipe_ingredients.unit_id`. The latter is an editorial recipe measurement unit such as `kg` or `tbsp`; source/list `base_unit_id` is the permanent canonical unit such as `g`, `ml`, or `item` after exact conversion/scaling.

This minimal table gives `shopping line -> exact meal_plan_item -> exact meal_option_recipe -> exact recipe_version -> exact recipe_ingredient -> exact food/fact`. Recipe and fact details remain recoverable from existing immutable catalog rows. Do not duplicate `meal_option_version_id`, recipe steps, nutrients, allergens, or full plan-item snapshots merely to simplify a foreign key.

`shopping_item_check_states`:

- `shopping_list_item_id uuid primary key` with `on delete cascade` only for household/plan teardown;
- `checked_at timestamptz not null`;
- no authoritative quantity, price, category, source, fingerprint, or redundant household ownership columns.

### 3.2 Transaction and invariant enforcement

Extend `public.persist_meal_plan_revision(...)` in place without broadening its grants:

1. require `p_revision.engineVersion = 'planner-engine-v2'`, `p_revision.inputSnapshot.engineVersion = 'planner-engine-v2'`, and exact equality between them for every new write; retain existing v1 rows untouched;
2. require `calculationSnapshot.shoppingList.version = 'shopping-list-v1'` for every newly persisted revision after this migration;
3. keep `portionConfigVersion = 'portion-v1'`, `priceFreshnessConfigVersion = 'price-freshness-v1'`, and `plannerConfigVersion = 'planner-v1'` unless their existing validations already permit equivalent typed values; Phase 4 does not introduce new config algorithms;
4. validate shopping line count, unique food IDs, canonical ordering, exact basket-field equality, total, warnings, categories, fact refs, and sources before writing;
5. insert revision and seven plan items as today;
6. insert one list, its lines, and its minimal source rows from the same calculation snapshot, mapping each source `dayIndex` to the newly created `meal_plan_item_id`;
7. validate every source through `private.assert_shopping_source_row()` and call `private.assert_revision_shopping_row(revision_id)` to verify source sums, full provenance, item ownership/context, fingerprint, line sums, basket equality, and revision/list totals;
8. for a replacement/regeneration parent, carry checked rows only for exact stable food/base-unit/required-text matches;
9. seal the revision and advance `meal_plans.current_revision_id` only after all assertions pass.

Extend `private.assert_plan_summary_row(...)` so a current Phase 4 revision also requires its exact shopping list and all cost/fingerprint invariants. A revision without Phase 4 snapshot remains valid historical Phase 3 evidence but cannot become current through the revised persistence path.

Add history-protection triggers for lists/items/sources that permit writes only inside `private.plan_transition_context`; ready calculation rows are otherwise immutable even to a direct service-role table statement. Add deferrable integrity triggers or equivalent private assertions so direct writes cannot leave a ready revision with missing/extra/mismatched shopping rows. The checked-state table is excluded from calculation-history immutability and is protected by ownership/RPC policy instead.

All engine, fingerprint, provenance, quantity, and cost mismatch paths raise stable typed SQL messages and roll back revision, list, lines, sources, check carry-forward, and current-pointer update atomically.

### 3.3 Read and toggle RPCs

Add two user-scoped functions:

```sql
public.get_shopping_list(p_plan_id uuid, p_revision_id uuid default null) returns jsonb
public.set_shopping_item_checked(p_shopping_list_item_id uuid, p_checked boolean) returns jsonb
```

`get_shopping_list`:

- is `security invoker` and relies on the caller's owner-scoped SELECT RLS;
- requires authenticated ownership through plan -> household;
- selects `meal_plans.current_revision_id` when `p_revision_id` is null;
- when an exact revision ID is supplied, returns that owned historical revision without substituting the current revision;
- returns typed `SHOPPING_LIST_NOT_AVAILABLE_FOR_LEGACY_REVISION` for an exact Phase 3 revision with no stored projection;
- returns week, budget/status/total, revision/fingerprint, warnings, immutable line fields, current `foods.name_vi` as presentation-only `foodNameVi`, source day/meal labels, and current checked state;
- returns sources in stable exact-ID order; no display name is copied into stored evidence.

`set_shopping_item_checked`:

- is a narrowly scoped `security definer` with `search_path = ''` because authenticated callers deliberately receive no direct DML grant on the check-state table;
- requires authenticated ownership by joining item -> list -> plan -> household;
- inserts/upserts a check row with DB `now()` only when `p_checked = true`, or deletes it when false;
- returns only item ID and checked state/timestamp;
- cannot update authoritative item columns and is idempotent.

No Phase 4 Vercel Function is added. Existing planner Functions remain the trusted authoritative generation boundary; owner reads/checks use user JWT + narrow Supabase RPCs and RLS. This is the smallest surface and introduces no browser service-role key.

### 3.4 RLS and grants

Enable RLS on all four tables.

- owner SELECT policies traverse exact list/revision/plan/household ownership;
- other households and anonymous users see no rows;
- authoritative tables receive SELECT only for authenticated owners through RLS; no authenticated INSERT/UPDATE/DELETE grants;
- check-state rows may be SELECTed by owners, but receive no direct authenticated DML grants; only the explicit-ownership, security-definer `set_shopping_item_checked` is executable by authenticated/service role;
- persistence/history functions remain revoked from `public`, `anon`, and `authenticated`, executable only by `service_role`;
- read/toggle RPCs are revoked from `public`/`anon` and granted only to `authenticated` and `service_role`;
- security-definer helpers have empty search paths, explicit qualification, and are not client-executable;
- no browser/service-role secret or broad catalog/plan mutation grant is introduced.

---

## 4. Application, Infrastructure, and UI Contracts

### 4.1 Server calculation/persistence boundary

Add `buildShoppingListSnapshot` to the pure domain and call it from the existing planner `snapshots(...)` function after `ReadyPlan` exists and before calculation hashing. Import `PLANNER_ENGINE_VERSION` into that shared path, add it to canonical input before `inputFingerprint`, and update `PersistPlannerRevisionCommand` to require that exact engine type plus the shopping projection.

Generation and replacement must use the identical path:

```text
normalized exact input
  -> eligible selected seven meals
  -> existing calculatePurchaseBasket
  -> buildShoppingListSnapshot (validate/project only)
  -> canonical input with PLANNER_ENGINE_VERSION
  -> input fingerprint
  -> calculation snapshot (including input fingerprint) + calculation fingerprint
  -> existing service persistence RPC transaction
```

Generation, regeneration, and replacement all call this shared path and therefore write `planner-engine-v2`; no branch-local literal is permitted. If projection validation fails, return a fatal structured planner/application failure and persist nothing. The browser cannot submit an engine version, shopping snapshot, or any of its fields.

### 4.2 Browser application port

Add a small application port:

```typescript
interface ShoppingListRepository {
  load(input: { planId: string; revisionId?: string }): Promise<ShoppingListLoadResult>
  setChecked(input: { shoppingListItemId: string; checked: boolean }): Promise<CheckStateResult>
}
```

`SupabaseShoppingListRepository` invokes only the two user-scoped RPCs using the established browser Supabase client. It parses unknown JSON into strict DTOs and maps authorization/not-found/legacy/transient failures. It performs no calculation or fallback catalog lookup.

### 4.3 “Đi chợ” UI

Add authenticated route `/shopping/:planId`; an optional `revision` query parameter supports explicit owner-readable history, while normal navigation omits it and loads the plan's current revision.

The compact mobile-first screen displays:

- week label, “Chi phí ước tính”, seven-meal budget, within/over-budget state, and exact overage when applicable;
- a stale-price banner when any line is `stale_usable` and each affected line's observation date;
- groups by V1 grocery category display order;
- within each group, presentation sort by Vietnamese current food name and final stable `foodId` tie-break;
- checkbox, food name, required amount, purchase amount/package count, estimated line cost, and useful package leftover;
- collapsed “Dùng cho” details listing contributing planned days/meals; exact IDs remain data traceability but are not noisy default UI;
- loading, empty/legacy, forbidden, transient error, and toggle-pending states.

Display formatting may round for readability but must consume immutable canonical quantities and never write rounded values back. Labels say “ước tính”; do not claim live/exact retailer pricing.

After successful generation/replacement, `WeeklyPlanPage` links to `/shopping/{planId}`. Replacement already returns the same plan ID and advances its current revision, so revisiting/refetching the route loads the new list. The old list remains reachable only by explicit historical revision ID and remains unchanged.

Optimistic checkbox UI may be used only for the checked boolean. On RPC failure it rolls back that boolean; it never changes an authoritative line.

---

## 5. Implementation File Map

Expected additions:

- `src/domain/planner/planner-engine-version.ts`
- `src/domain/shopping/grocery-category-config.ts`
- `src/domain/shopping/shopping-list.ts`
- `src/domain/shopping/build-shopping-list-snapshot.ts`
- `src/domain/shopping/build-shopping-list-snapshot.test.ts`
- `src/application/shopping/shopping-list-repository.ts`
- `src/infrastructure/supabase/supabase-shopping-list-repository.ts`
- `src/infrastructure/supabase/supabase-shopping-list-repository.test.ts`
- `src/features/shopping/shopping-list-page.tsx`
- `src/features/shopping/shopping-list-page.test.tsx`
- `supabase/migrations/20260827000000_phase_4_shopping_list.sql`
- `supabase/tests/database/phase_4_shopping_schema.test.sql`
- `supabase/tests/database/phase_4_shopping_integrity.test.sql`
- `supabase/tests/database/phase_4_shopping_rls.test.sql`
- `tests/integration/shopping-list.integration.test.ts`
- `tests/shopping-list.spec.ts`

Expected focused modifications:

- `src/domain/planner/evaluate-eligibility.ts` and its tests: retain explicit ingredient/source fields already emitted by `scaleMealOption`;
- `src/domain/planner/planner-input.ts`, `src/infrastructure/server/supabase-planner-input-loader.ts`, and focused tests: load permanent `baseDimension` with exact ingredient lineage;
- `src/domain/planner/planner-outcome.ts`: add only shopping projection fatal codes required by authoritative generation;
- `src/domain/planner/planner-snapshot.ts` and tests: add engine version to canonical input;
- `src/application/planner/planner-use-cases.ts` and tests: add shopping projection before fingerprint/persistence;
- `src/infrastructure/server/supabase-planner-repository.ts` and tests: serialize the required new snapshot without accepting browser-authored data;
- `src/infrastructure/supabase/database.types.ts`: generated from clean schema only;
- `src/app/App.tsx`, `src/app/router.tsx`, `src/app/App.test.tsx`, `src/main.tsx`: inject the shopping repository and authenticated route;
- `src/features/plans/weekly-plan-page.tsx` and test: expose the “Đi chợ” navigation for a persisted plan;
- `package.json`: add `test:integration:shopping` and `test:e2e:shopping` scripts only;
- `.github/workflows/ci.yml`: add Phase 4 database/integration/E2E gates;
- `README.md`: document local/CI Phase 4 verification and legacy-revision behavior without claiming pantry support.

Do not add `api/shopping/*`, another pricing module, a pantry table, a manual-item table, or Phase 5 scaffolding.

---

## 6. Ordered TDD Tasks

### Task 1: Preserve explicit ingredient provenance in eligible planner output

**Files**

- Modify: `src/domain/planner/evaluate-eligibility.ts`
- Modify: `src/domain/planner/evaluate-eligibility.test.ts`
- Modify: `src/domain/planner/planner-input.ts`
- Modify: `src/infrastructure/server/supabase-planner-input-loader.ts`
- Modify: `src/infrastructure/server/supabase-planner-input-loader.test.ts`
- Modify only if fixture data needs explicit assertions: `src/domain/planner/planner-test-fixture.ts`

**Consumes:** existing `scaleMealOption` output.

**Produces:** `EligibleMealOption.scaledIngredients` retaining `mealOptionRecipeId`, `recipeIngredientId`, component order, and ingredient order, plus normalized exact lineage carrying the stable food's permanent `baseDimension`.

- [ ] Write failing tests proving eligibility output retains each explicit source key, the loader supplies the matching permanent `baseDimension`, malformed/mismatched dimension data is rejected, and output stays identical under shuffled catalog result order.
- [ ] Make the type expose the already-calculated fields; do not parse or change `sourceId`, quantities, or planner eligibility.
- [ ] Run:

  ```powershell
  npx vitest run src/domain/planner/evaluate-eligibility.test.ts src/domain/meal-option/scale-meal-option.test.ts src/infrastructure/server/supabase-planner-input-loader.test.ts
  npm run typecheck
  git diff --check
  git status --short
  ```

- [ ] Commit only these files: `refactor: retain planner ingredient provenance`.

**Safety:** This is a type/data-preservation change. Golden plan choice, cost, frontier, and calculation output must remain unchanged until the shopping projection is intentionally added in Task 3.

### Task 2: Build the deterministic shopping snapshot projection

**Files**

- Create: `src/domain/shopping/grocery-category-config.ts`
- Create: `src/domain/shopping/shopping-list.ts`
- Create: `src/domain/shopping/build-shopping-list-snapshot.ts`
- Create: `src/domain/shopping/build-shopping-list-snapshot.test.ts`

**Consumes:** normalized `PlannerInputV1`, `ReadyPlan`, existing `PurchaseBasketLine`, canonical JSON/Decimal utilities.

**Produces:** `ShoppingListSnapshotV1` or typed fatal projection error.

- [ ] Write failing tests for:
  - same food across all seven items consolidates to one line;
  - shuffled candidates, days' source input, and database result order produce byte-equivalent canonical output;
  - preparation/editorial text cannot split a stable food line;
  - aggregation occurs before presentation rounding and exact source quantities sum to the canonical requirement;
  - differing canonical base units/dimensions fail deterministically;
  - basket fields and total are copied exactly from the Phase 3 primitive, and a mismatch fails rather than recalculates;
  - stale usable prices and observation dates propagate as warnings; unusable prices cannot appear as a successful projection;
  - changing current/display food names cannot alter canonical bytes or fingerprint input;
  - sources and fact refs remain stable and sorted;
  - one stable food using multiple pinned fact versions retains all facts;
  - equal category resolution gives one deterministic group, while conflicting historical categories give `other` + `CATEGORY_AMBIGUITY` without changing quantities/cost;
  - unmapped pinned category gives `other` + `CATEGORY_UNMAPPED`;
  - output line order is stable `foodId`, independent of Vietnamese UI sort.
- [ ] Implement the smallest pure validator/projector. Import the basket types; do not import/call `calculatePurchaseBasket` or duplicate package formulas.
- [ ] Run:

  ```powershell
  npx vitest run src/domain/shopping/build-shopping-list-snapshot.test.ts src/domain/pricing/calculate-purchase-basket.test.ts
  npm run typecheck
  git diff --check
  git status --short
  ```

- [ ] Commit: `feat: add deterministic shopping snapshot projection`.

### Task 3: Include shopping evidence in authoritative planner snapshots

**Files**

- Create: `src/domain/planner/planner-engine-version.ts`
- Modify: `src/domain/planner/planner-outcome.ts`
- Modify: `src/domain/planner/planner-snapshot.ts`
- Modify: `src/application/planner/planner-use-cases.ts`
- Modify: `src/application/planner/planner-use-cases.test.ts`
- Modify: `src/domain/planner/planner-snapshot.test.ts`
- Modify: `src/infrastructure/server/supabase-planner-repository.ts`
- Modify: `src/infrastructure/server/supabase-planner-repository.test.ts`

**Consumes:** Task 2 projection, existing generation/replacement `ReadyPlan`.

**Produces:** `PLANNER_ENGINE_VERSION = "planner-engine-v2"`, canonical input/fingerprint containing that version, calculation snapshot/fingerprint containing exact `shoppingList`, and persistence payload inaccessible to browser authorship.

- [ ] Write failing tests proving:
  - legacy `planner-engine-v1` snapshots remain readable as stored historical evidence;
  - every new Phase 4 generation, regeneration, and replacement command persists `planner-engine-v2`;
  - the canonical input snapshot contains engine version before hashing;
  - identical business/household/catalog/config input represented as v1 versus v2 has a different canonical `inputFingerprint`;
  - calculation fingerprint transitively changes because `calculationSnapshot.inputFingerprint` changes;
  - generation and replacement import/use the same `PLANNER_ENGINE_VERSION` constant rather than local literals;
  - generation and replacement both include the shopping projection before calculation hashing;
  - list/basket/revision totals agree, mutable display-name changes do not alter the shopping portion, and projection failure persists nothing.
- [ ] Test replacement on a non-additive package boundary to prove the new list comes from the whole recomputed week, not a line delta.
- [ ] Test browser HTTP intent remains unchanged and contains no engine version, shopping quantities, costs, source IDs, or fingerprints.
- [ ] Add the single production constant, pass it through `buildPlannerSnapshotPayloads`, add it to `inputPayload`, and use it in the shared `snapshots(...)` and persistence-command paths.
- [ ] Add the projection in the same shared `snapshots(...)` path and require it in `PersistPlannerRevisionCommand`.
- [ ] Keep `PortionConfigV1`, `PriceFreshnessConfigV1`, and `PlannerConfigV1` byte-equivalent to Phase 3.
- [ ] Keep the existing Phase 3 primitive call sites and budget ranking untouched.
- [ ] Run:

  ```powershell
  npx vitest run src/application/planner/planner-use-cases.test.ts src/domain/planner/planner-snapshot.test.ts src/infrastructure/server/supabase-planner-repository.test.ts src/infrastructure/server/planner-http.test.ts
  npm run typecheck
  git diff --check
  git status --short
  ```

- [ ] Commit: `feat: attach shopping evidence to plan revisions`.

### Task 4: Add authoritative shopping persistence, invariants, RLS, and RPCs

**Files**

- Create: `supabase/tests/database/phase_4_shopping_schema.test.sql`
- Create: `supabase/tests/database/phase_4_shopping_integrity.test.sql`
- Create: `supabase/tests/database/phase_4_shopping_rls.test.sql`
- Create: `supabase/migrations/20260827000000_phase_4_shopping_list.sql`

**Consumes:** exact calculation snapshot from Task 3 and actual Phase 3 revision transaction.

**Produces:** tables, triggers/helpers, extended persistence RPC, owner read/toggle RPCs, least-privilege grants/RLS.

- [ ] Write pgTAP expectations first for schema, constraints, grants, policies, and function execution privileges.
- [ ] Add failing integrity tests proving:
  - newly persisted generation/regeneration/replacement revisions require `engine_version = 'planner-engine-v2'` and matching `input_snapshot.engineVersion`, while pre-existing v1 rows remain unchanged/readable;
  - exactly one authoritative list per exact revision;
  - unique stable food per list;
  - canonical positive required/package/purchase fields and non-negative leftover/cost;
  - list line fields byte-match the embedded purchase basket;
  - sum line costs = list total = revision total; fingerprint equals revision fingerprint;
  - every source belongs to the same list/revision/item and exact recipe ingredient/fact/food;
  - a `meal_plan_item_id` from another revision is rejected;
  - an unrelated `meal_option_recipe_id` is rejected;
  - a component belonging to another meal-option version than `meal_plan_items.meal_option_version_id` is rejected;
  - a source `recipe_version_id` differing from the exact component pin is rejected;
  - a recipe ingredient whose `food_id` or `food_fact_version_id` differs from the source is rejected;
  - a source `food_id` differing from its shopping line is rejected;
  - a source canonical `base_unit_id` differing from either the shopping line or permanent `foods.base_unit_id` is rejected;
  - a valid ingredient authored in `kg` persists successfully when the stable food's permanent/source/list base unit is `g`, proving no false comparison to `recipe_ingredients.unit_id`;
  - source requirements sum exactly to the line requirement;
  - every provenance mismatch and every invalid/missing/extra source or total/fingerprint mismatch rolls the entire revision/list transaction back;
  - completed authoritative list/item/source rows are immutable;
  - a legacy Phase 3 revision stays historical and returns the typed legacy outcome rather than being rebuilt from current pointers.
- [ ] Add failing RLS/grant tests proving owner read, cross-owner/anonymous denial, browser authoritative-write denial, and that check RPC cannot alter quantities/cost/provenance.
- [ ] Add failing replacement tests proving old list remains unchanged, new full-week list matches new revision, and check state carries only on exact `foodId + baseUnitId + required text` equality.
- [ ] Implement migration and extend the existing persistence transaction; do not create a second persistence/cost RPC.
- [ ] With local Docker available, run RED before migration and GREEN after:

  ```powershell
  npm run supabase:reset
  npm run supabase:lint
  npm run supabase:test
  git diff --check
  git status --short
  ```

  Without Docker, record `DATABASE_RLS_GATE_PENDING_CI`, inspect SQL statically, run `git diff --check`, and defer PASS to exact-HEAD CI.

- [ ] Commit: `feat: persist immutable revision shopping lists`.

**Rollback/safety:** The migration is additive and forward-only. It does not mutate published catalog facts, price books, Phase 3 snapshots, or production. Existing revisions receive no fabricated list. A migration failure rolls back locally/CI; do not edit an applied migration later.

### Task 5: Generate database types and add the browser repository

**Files**

- Modify generated: `src/infrastructure/supabase/database.types.ts`
- Create: `src/application/shopping/shopping-list-repository.ts`
- Create: `src/infrastructure/supabase/supabase-shopping-list-repository.ts`
- Create: `src/infrastructure/supabase/supabase-shopping-list-repository.test.ts`

**Consumes:** Task 4 read/toggle RPCs.

**Produces:** typed owner-scoped browser read/check boundary.

- [ ] Write failing repository tests for current revision read, exact historical read, legacy/no-list, cross-owner/unauthorized mapping, strict malformed-response rejection, check/uncheck, and transient errors.
- [ ] Implement only the two RPC calls; do not add a Vercel endpoint or browser calculation.
- [ ] Generate types only after a clean local `supabase:reset`:

  ```powershell
  npm run db:types:generate
  npm run db:types:check
  npx vitest run src/infrastructure/supabase/supabase-shopping-list-repository.test.ts
  npm run typecheck
  git diff --check
  git status --short
  ```

  If Docker is unavailable, push Task 4 first, obtain the generated types artifact from successful exact-HEAD CI, inspect it, copy only the generated file, commit/push a new HEAD, and require CI again for that new exact HEAD. Never hand-edit `database.types.ts`.

- [ ] Commit: `feat: add shopping list data boundary`.

### Task 6: Prove generation, read, replacement, and ownership integration

**Files**

- Create: `tests/integration/shopping-list.integration.test.ts`
- Modify: `package.json`
- Modify only for shared fixture support: `tests/integration/planner-api.integration.test.ts`

**Consumes:** real local Supabase, existing planner Functions/use cases, Task 4 RPCs.

**Produces:** `test:integration:shopping`.

- [ ] Write integration tests for:
  - generate plan -> shopping list exists for exact revision;
  - new generation and replacement revisions both persist `planner-engine-v2` from the shared constant, with matching `input_snapshot.engineVersion`;
  - an unchanged legacy Phase 3 `planner-engine-v1` revision remains owner-readable as historical evidence and receives no fabricated shopping list;
  - otherwise identical canonical business/catalog input under v1 and v2 produces different input fingerprints;
  - plan/revision/snapshot/list/line sum totals and fingerprint agree;
  - owner reads current and exact historical lists; second user cannot read either;
  - current mutable food display name may change through the trusted catalog boundary while stored shopping evidence/fingerprint remains unchanged and read DTO may show the corrected name;
  - stale price line remains successful with exact observation warning;
  - toggle and refresh persist check state while authoritative columns remain unchanged;
  - replacement creates a new list from the complete week, preserves old list, changes only target meal provenance, and applies exact carry/reset rules;
  - malformed service persistence payload fails atomically with no revision/list/current-pointer advance;
  - each of other-revision plan item, unrelated component, other meal-option version component, mismatched component recipe version, mismatched ingredient food/fact, source/line food mismatch, and mismatched canonical base unit fails atomically with no revision/list/current-pointer advance;
  - a recipe ingredient measured in `kg` with food permanent canonical unit `g` persists and reports the converted `g` source/list unit;
  - retiring/changing catalog current pointers does not alter exact historical shopping read.
- [ ] Reuse existing catalog/planner fixture helpers; do not seed pantry or custom items.
- [ ] Add script:

  ```json
  "test:integration:shopping": "npm run preflight:db && node scripts/local-supabase-admin-env.mjs -- npx vitest run --config vitest.integration.config.ts tests/integration/shopping-list.integration.test.ts"
  ```

- [ ] With Docker available run:

  ```powershell
  npm run supabase:reset
  npm run test:integration
  npm run test:integration:catalog-admin
  npm run test:integration:planner
  npm run test:integration:shopping
  git diff --check
  git status --short
  ```

  Otherwise record pending CI evidence.

- [ ] Commit: `test: verify shopping list integration`.

### Task 7: Add mobile-first shopping UI and check-state interaction

**Files**

- Create: `src/features/shopping/shopping-list-page.tsx`
- Create: `src/features/shopping/shopping-list-page.test.tsx`
- Modify: `src/features/plans/weekly-plan-page.tsx`
- Modify: `src/features/plans/weekly-plan-page.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/main.tsx`

**Consumes:** `ShoppingListRepository` and owner session.

**Produces:** authenticated `/shopping/:planId` route and “Đi chợ” navigation.

- [ ] Write failing RTL tests for grouped stable category order, Vietnamese name presentation sort with food-ID tie-break, total/budget/overage, required/purchase/package/leftover labels, stale banner/date, collapsed sources, legacy state, errors/loading, and compact mobile semantics.
- [ ] Write failing interaction tests for check/uncheck, refresh persistence, pending state, failed-toggle rollback, and proof that no authoritative field changes in submitted input.
- [ ] Write route/navigation tests proving unauthenticated protection, plan link, current-revision default, and explicit historical revision read.
- [ ] Implement accessible semantic controls and existing project styling/components. Do not add a state/data-fetching dependency.
- [ ] Run:

  ```powershell
  npx vitest run src/features/shopping/shopping-list-page.test.tsx src/features/plans/weekly-plan-page.test.tsx src/app/App.test.tsx
  npm run lint
  npm run typecheck
  npm run build
  git diff --check
  git status --short
  ```

- [ ] Commit: `feat: add mobile shopping list experience`.

### Task 8: Add shopping Playwright coverage

**Files**

- Create: `tests/shopping-list.spec.ts`
- Modify: `package.json`

**Consumes:** seeded local Supabase and running Vite/API harness already used by planner E2E.

**Produces:** `test:e2e:shopping`.

- [ ] Write a failing end-to-end flow that signs in, opens “Đi chợ”, observes consolidated category groups and estimated total/budget, checks/unchecks and refreshes, sees a stale fixture warning, applies one-meal replacement, then sees the new current list while the prior exact revision remains unchanged through integration evidence.
- [ ] Assert no pantry/manual-item/purchase/delivery controls exist.
- [ ] Add script:

  ```json
  "test:e2e:shopping": "npm run preflight:db && node scripts/local-supabase-env.mjs -- npx playwright test tests/shopping-list.spec.ts"
  ```

- [ ] With Docker available run:

  ```powershell
  npm run supabase:reset
  npm run test:e2e:shopping
  git diff --check
  git status --short
  ```

  Otherwise require exact-final-HEAD CI.

- [ ] Commit: `test: add shopping list browser flow`.

### Task 9: Extend CI and documentation without deployment

**Files**

- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

**Consumes:** Tasks 4–8 scripts.

**Produces:** authoritative Phase 4 exact-HEAD verification contract and local instructions.

- [ ] Add database-job steps after inherited gates:

  ```yaml
  - run: npm run test:integration:shopping
  - run: npm run test:e2e:shopping
  ```

  Preserve clean Supabase start/reset, fatal SQL lint, all inherited pgTAP, generated type drift, inherited Auth/household/catalog/admin/planner integrations, onboarding/planner E2E, artifact upload, and always-run cleanup.

- [ ] Keep the web job unchanged except that new domain/component tests naturally run through `verify:web`.
- [ ] Document the “Đi chợ” route, immutable revision binding, estimated-price/stale semantics, separate check state, local Docker capability model, CI authority, legacy-revision regeneration message, and explicit absence of pantry/retailer features.
- [ ] Do not add deployment, Vercel linking, remote Supabase, production migration, or secrets.
- [ ] Run:

  ```powershell
  npm run format:check
  npm run lint
  npm run typecheck
  git diff --check
  git status --short
  ```

- [ ] Commit: `ci: verify Phase 4 shopping lists`.

### Task 10: Full Phase 4 exit gate, audit, push, and exact-HEAD CI

**Files:** No new functional files. Fix only Phase 4 defects found by verification, in a coherent fix commit with focused tests.

- [ ] Run the mandatory local non-database gate:

  ```powershell
  npm run env:check
  npm run secrets:check
  npm run security:dependencies
  npm run format:check
  npm run lint
  npm run typecheck
  npm run test:coverage
  npm run build
  npm run test:e2e
  ```

- [ ] If Docker is available, run the complete local database/browser gate from a clean reset:

  ```powershell
  npm run supabase:start
  npm run supabase:reset
  npm run supabase:lint
  npm run supabase:test
  npm run db:types:check
  npm run test:integration
  npm run test:integration:catalog-admin
  npm run test:integration:planner
  npm run test:integration:shopping
  npm run test:e2e:onboarding
  npm run test:e2e:planner
  npm run test:e2e:shopping
  npm run supabase:stop
  ```

- [ ] Inspect the full Phase 4 delta and scope:

  ```powershell
  git diff --stat 00380a677fb3c1d8eba8043f6e4745a6b0d242e2...HEAD
  git diff --name-status 00380a677fb3c1d8eba8043f6e4745a6b0d242e2...HEAD
  rg -n "pantry|receipt|barcode|ocr|delivery|payment|retailer|manual grocery|VITE_.*SERVICE|service_role" src api supabase tests README.md
  rg -n '"planner-engine-v2"' src --glob '!**/*.test.*'
  git diff --check 00380a677fb3c1d8eba8043f6e4745a6b0d242e2...HEAD
  git status --short --branch
  ```

  Review every match; allowed matches are explicit exclusions/tests or existing server-only service-role usage. The non-test TypeScript engine search must resolve to the one version constant rather than generation/replacement literals. Confirm there is one package-rounded algorithm, the complete source trigger chain, no `source.base_unit_id = recipe_ingredients.unit_id` comparison, no current-pointer replay, no mutable label in calculation snapshots, no pantry field/table, no browser authoritative DML, and no unrelated change.

- [ ] Push without force:

  ```powershell
  git push -u origin codex/phase-4-shopping-list
  $finalHead = git rev-parse HEAD
  ```

- [ ] Inspect GitHub Actions for `$finalHead` and require both `web` and `database` to conclude `success`. The database job must show clean reset, lint, inherited + Phase 4 pgTAP/RLS/integrity, generated type drift, inherited integrations/E2E, shopping integration/E2E, and cleanup.
- [ ] If a generated type artifact is required because local Docker was unavailable, download/inspect it, commit only `database.types.ts`, push the new HEAD, and repeat exact-HEAD CI. The prior CI run cannot approve the newer SHA.
- [ ] Report `PHASE_4_PASS` and `TASK_COMPLETE_PUSHED` only after local non-database gates, database evidence (local or exact-final-HEAD CI), both exact-final-HEAD jobs, type drift, and push all pass. Otherwise report `PHASE_4_BLOCKED` with the exact pending/failed gate.

---

## 7. Exact Verification Command Reference

Focused non-database:

```powershell
npx vitest run src/domain/shopping/build-shopping-list-snapshot.test.ts
npx vitest run src/application/planner/planner-use-cases.test.ts src/domain/planner/planner-snapshot.test.ts
npx vitest run src/infrastructure/supabase/supabase-shopping-list-repository.test.ts
npx vitest run src/features/shopping/shopping-list-page.test.tsx src/features/plans/weekly-plan-page.test.tsx src/app/App.test.tsx
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run test:e2e
```

Database/integration when local Docker is usable, otherwise exact-HEAD CI:

```powershell
npm run preflight:db
npm run supabase:start
npm run supabase:reset
npm run supabase:lint
npm run supabase:test
npm run db:types:check
npm run test:integration
npm run test:integration:catalog-admin
npm run test:integration:planner
npm run test:integration:shopping
npm run test:e2e:onboarding
npm run test:e2e:planner
npm run test:e2e:shopping
npm run supabase:stop
```

Final repository checks:

```powershell
git merge-base --is-ancestor 00380a677fb3c1d8eba8043f6e4745a6b0d242e2 HEAD
git diff --check 00380a677fb3c1d8eba8043f6e4745a6b0d242e2...HEAD
git status --short --branch
```

---

## 8. Phase 4 Exit Criteria

`PHASE_4_PASS` requires all of the following for the exact pushed HEAD:

- exact approved Phase 3 SHA remains in ancestry and all inherited Phase 0–3 gates pass;
- same normalized input and ready plan produce byte-equivalent shopping snapshots regardless of source/result order;
- every new generation/regeneration/replacement revision uses the shared `planner-engine-v2` constant in both persisted metadata and canonical input, while historical v1 evidence remains unchanged/readable;
- identical business/catalog/config input under v1 versus v2 has different canonical input fingerprints, and calculation fingerprints transitively commit to those input fingerprints;
- one stable food produces one line after base-unit aggregation, with every exact fact/source retained;
- incompatible dimensions and basket/projection mismatches are typed fatal failures with no partial output;
- `calculatePurchaseBasket` remains the only package-rounded cost implementation;
- plan, revision, embedded basket, shopping snapshot/list, and line-sum totals/fingerprints satisfy the invariant transactionally;
- stale prices remain usable warnings with observation date; missing/future/>90-day prices never produce partial or zero lists;
- current catalog pointer/retirement and mutable display-name changes do not alter stored historical shopping evidence/fingerprint;
- one immutable authoritative list exists per new exact revision; replacement creates a new list and never mutates the prior revision/list;
- every persisted source proves the full line -> exact plan item -> exact meal-option component -> exact recipe version -> exact ingredient -> exact food/fact chain;
- unrelated/wrong-version components, mismatched recipe versions, mismatched ingredient food/facts, and mismatched canonical base units are rejected atomically, while recipe `kg` -> permanent `g` conversion remains valid;
- checked state is separate and carries only for same food/base unit plus byte-equivalent canonical required amount;
- source links trace line -> plan item -> exact recipe ingredient/fact without a duplicate provenance graph;
- category ambiguity is deterministic, reproducible, warning-bearing, and cost-neutral;
- owner/current and owner/historical reads work; cross-household reads and browser authoritative writes fail;
- browser can toggle only checked state and refresh persistence works;
- mobile “Đi chợ” UI shows grouped quantities, packages, leftovers, estimates, budget/overage, stale warnings, and sources;
- generated database types are clean and never hand-edited;
- full local non-database gate passes;
- database/RLS/integrations/E2E pass locally or in exact-final-HEAD GitHub Actions, and both exact-final-HEAD `web` and `database` jobs succeed;
- no pantry, manual grocery item, retailer, delivery/payment, receipt/OCR, collaboration/offline, AI/ML, or Phase 5 behavior was added;
- current branch was pushed without force and the worktree is clean.

`PHASE_4_BLOCKED` applies when any required verification fails, database/RLS evidence has not passed anywhere, exact-final-HEAD CI is pending/failing, generated types drift, push fails, or unrelated changes prevent a safe commit. Do not report PASS for a skipped gate.

---

## 9. Self-Review and YAGNI Audit

- **Duplicate cost logic:** The shopping builder compares/project-copies the Phase 3 basket; it never calls a parallel package formula. SQL consistency checks validate stored fields but do not select or round packages.
- **Engine reproducibility:** Phase 4 intentionally advances only the planner engine to v2 because canonical input/calculation evidence changes. One production constant feeds generation and replacement; v1 history is typed/readable and never rewritten. Portion, freshness, and planner configs stay V1 because their algorithms do not change.
- **Mutable replay:** Exact facts, prices, configs, sources, categories, and basket come from normalized/revision evidence. Current food names are presentation-only read DTO fields and do not enter stored calculation rows or fingerprints.
- **Multiple fact versions:** All exact facts/hashes remain attached to the stable-food line. Base-unit incompatibility is fatal; category disagreement is deterministic `other` + warning and cannot split or reprice the line.
- **Pantry boundary:** No pantry table/input/deduction exists. There is no retained zero-valued pantry field because nothing structurally requires it.
- **Authority:** Browser roles cannot write list arithmetic or provenance. Generation remains in the existing trusted planner path; browser RPCs cover only owner read and separate check state.
- **Atomic invariant:** Revision, items, list, lines, sources, carry-forward, seal, and current-pointer update share one transaction; mismatch leaves no partial evidence.
- **Complete provenance:** Direct composite FKs enforce exact ingredient and food/fact/base-unit identities; the narrow trigger verifies the cross-table meal-item/component/version chain. It compares canonical source base unit to the shopping line and permanent food base unit, never to the recipe measurement unit.
- **Check-state isolation:** Checked state lives outside immutable calculation rows/snapshot/fingerprint. Carry-forward compares canonical requirement text exactly and never changes prior state.
- **Replacement immutability:** A new revision receives a full-week list; old revisions/lists/sources remain untouched. No additive delta assumption is introduced.
- **RLS/grants:** Every exposed table has owner-scoped SELECT RLS; authoritative DML remains unavailable to browser roles; narrow RPCs do not broaden service-role access.
- **Presentation ordering:** Canonical snapshot/fingerprint order is stable IDs. Category + Vietnamese display-name ordering is UI-only, so label corrections cannot alter calculation bytes.
- **Legacy revisions:** The plan does not fabricate historical shopping evidence from mutable current catalog. Legacy exact revisions return a typed unavailable state and require a new authoritative revision for a list.
- **Scope:** No shopping-list manual editing, pantry, retailer/live price, delivery/payment, receipt/barcode/OCR, notifications, collaboration/offline sync, AI/ML, or Phase 5 scaffold is planned.

The plan preserves Phase 0–3 architecture and security and implements only the fully specified Phase 4 shopping outcome.
