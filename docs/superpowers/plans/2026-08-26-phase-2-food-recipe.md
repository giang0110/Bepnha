# Phase 2 Food and Recipe Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Add the deterministic, immutable food/recipe/nutrition/price catalog and pure recipe calculation primitives needed by later phases, without implementing meal planning, shopping aggregation, pantry, or AI behavior.

**Architecture:** Extend the modular monolith. Exact decimal, normalization, lineage, scaling, nutrition, freshness, costing, and canonical snapshot rules stay in `src/domain`; application-owned ports/use cases describe catalog reads and allowlisted admin commands; Supabase adapters and Vercel Functions remain outside the domain. PostgreSQL owns structural integrity and published-version immutability. Household users read published catalog data only. A server endpoint verifies signed Supabase `app_metadata` before narrowly scoped catalog operations; database triggers and restricted publication RPCs remain authoritative on that path.

**Tech Stack:** Node 24, strict TypeScript, Decimal.js, React/Vite foundation, Vitest, Supabase/PostgreSQL migrations and pgTAP, Supabase JS, Vercel Functions, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-25-bep-nha-design.md`

## Global Constraints

- Work only on `codex/phase-2-food-recipe`. Do not merge `main`, deploy, link a remote project, run production migrations, or use a remote Supabase database.
- Exact approved Phase 1 HEAD `fd5fe8dcab8a8d80c55f92cb2f14498a9e32e727` must remain an ancestor of every Phase 2 implementation commit. Never recreate Phase 0/1 files manually.
- Include catalog records and recipe-level primitives only. Exclude meal options, beam search, weekly planning, seven-day persistence, replacement, shopping/package aggregation, pantry, user-facing catalog/admin screens, and AI.
- Use TDD for pure domain behavior. Write pgTAP expectations before migration implementation when local Docker is available. Without Docker, do not claim local RED/GREEN; keep the database gate pending for exact-HEAD CI.
- PostgreSQL `numeric` values cross infrastructure boundaries as normalized decimal strings. Domain code must not use JavaScript `number` for quantities, nutrients, conversion factors, or prorated cost. VND package prices are positive safe integers.
- Never turn missing nutrient, allergen, conversion, or price data into zero/default. Unknown and explicit zero are distinct.
- No browser bundle receives a Supabase secret/service-role credential. Administrator assignment/removal remains trusted operations only and has no client/API command.
- Preserve the Phase 0/1 verification model: local Docker is optional for non-database work, but database/RLS/integration must pass locally or in exact-final-HEAD GitHub Actions.
- Each task ends with focused verification, `git diff --check`, status inspection, and one task-only conventional commit. Do not commit unrelated files or a failing required gate.

---

## 0. Approved Base Prerequisite

### 0.1 Plan-writing state

At plan-writing time:

- branch is `codex/phase-2-food-recipe`;
- `HEAD` is exactly `fd5fe8dcab8a8d80c55f92cb2f14498a9e32e727`;
- the approved SHA passes `git merge-base --is-ancestor ... HEAD`;
- the working tree was clean before this plan;
- approved Phase 1 exact-HEAD evidence is [CI run 32933574541](https://github.com/ntgiang1235-ux/Bepnha/actions/runs/32933574541), with `web` and `database` successful.

The plan branch descends directly from approved Phase 1; no integration merge is needed now.

### 0.2 Mandatory implementation-start check

Before Task 1:

```powershell
$phase1Head = "fd5fe8dcab8a8d80c55f92cb2f14498a9e32e727"
git switch codex/phase-2-food-recipe
git status --short --branch
git cat-file -e "$phase1Head^{commit}"
if ($LASTEXITCODE -ne 0) { throw "PHASE_2_BLOCKED_APPROVED_PHASE_1_HEAD_MISSING" }
git merge-base --is-ancestor $phase1Head HEAD
if ($LASTEXITCODE -ne 0) { throw "PHASE_2_BLOCKED_PHASE_1_NOT_IN_ANCESTRY" }
```

If ancestry fails in a future environment, stop implementation. With a clean tree, fetch only the approved branch, verify the fetched object, and integrate the exact approved commit—not `main`—as a separate prerequisite commit:

```powershell
git fetch origin codex/phase-1-household
git rev-parse origin/codex/phase-1-household
git cat-file -e "$phase1Head^{commit}"
git merge --no-ff --no-edit $phase1Head
git merge-base --is-ancestor $phase1Head HEAD
```

Run inherited Phase 1 non-database verification, push that integration commit, and require exact-integration-HEAD `web`/`database` CI success before Task 1. Never resolve conflicts by reconstructing Phase 0/1 files, and never merge `main`.

---

## 1. Fixed Domain and Data Contracts

### 1.1 Numeric and canonical serialization

- Add `decimal.js` as the only runtime calculation dependency and commit its resolved lockfile. Use an internal immutable Decimal constructor with at least 34 significant digits and named `ROUND_HALF_UP`/`ROUND_CEIL` constants; never mutate global Decimal configuration.
- Accept decimal inputs only as canonical strings; reject exponent notation, `NaN`, infinities, commas, whitespace, negative zero, invalid sign/range, and excess scale before calculation.
- `normalizeDecimal` strips insignificant fractional zeroes and serializes zero as `"0"`. Authoritative outputs contain normalized strings, not binary floats.
- Canonical JSON recursively sorts object keys. Ordered recipe arrays retain order; set-like nutrients/assessments/tags/prices are explicitly sorted by stable key.
- Domain returns canonical UTF-8 content. SHA-256 is an application `ContentHasher` port plus Node adapter; domain imports no `node:crypto`, Web Crypto, Supabase, React, or environment globals.
- Hashes are lowercase 64-character SHA-256 hex. Content hashes cover immutable aggregate content. Calculation fingerprints cover exact versions/hashes/config/prices/date.

### 1.2 Stable identities and immutable versions

`foods` and `recipes` are stable display/aggregation identities. Exact published children are calculation identities.

1. Create stable identity `draft` with one editable draft version.
2. Draft aggregate fields/children change only through allowlisted server commands and optimistic `revision`.
3. Publication validates the complete aggregate, computes/stores canonical hash, records `published_at`, moves the current pointer, and appends an audit event atomically.
4. Published versions and calculation-bearing children reject update/delete/late insert even through service-role SQL/Data API. Corrections create the next positive version.
5. Current pointers move only inside matching restricted publication RPCs. Moving a pointer never rewrites older references.
6. Retirement removes stable identity/book from new discovery; it never deletes historical IDs/versions.
7. Food `code`, `base_dimension`, and `base_unit_id` lock when its first fact exists. Recipe `code` locks when its first version exists. Display labels may be corrected, while later snapshots retain copied labels.

There is no generic unpublish or hard-delete command.

### 1.3 Units and food-specific conversions

Dimension bases are gram (`g`), millilitre (`ml`), and item (`item`). Seed:

| Code | Dimension | Factor |
|---|---|---:|
| `g` | mass | `1` |
| `kg` | mass | `1000` |
| `ml` | volume | `1` |
| `l` | volume | `1000` |
| `tsp` | volume | `5` |
| `tbsp` | volume | `15` |
| `item` | count | `1` |

`units.to_dimension_base` is exact only within its dimension. Each `food_fact_unit_conversions` row belongs to one immutable fact and source unit and stores:

- `base_quantity_per_unit` in the food's stable canonical base unit;
- `gross_grams_per_unit`;
- positive `display_step`;
- non-empty provenance.

Rules:

- Same-base-dimension `base_quantity_per_unit` must equal the exact source/base generic-factor ratio. Cross-dimension kitchen units require an explicit food-specific base factor.
- Mass `gross_grams_per_unit` equals the generic gram factor. Volume/count/cross-dimension sources require explicit food-specific grams. No density or piece default exists.
- A published fact contains a conversion for its food base unit. Every unit used by a published recipe ingredient or price row has a conversion on that exact fact.
- Conversion returns exact `quantity × base factor` and `quantity × gram factor`; missing/inconsistent inputs return typed failure.
- Authoritative values remain unrounded. Display mass rounds half-up to 5 g below 1,000 g and 10 g at/above; volume to 5 ml; count/other to `display_step`. A positive value that would show zero displays one quantum without changing raw value. Purchase/package ceiling waits for Phase 4.

### 1.4 Nutrition and edible fraction

- Basis is exactly `per_100g_edible`.
- `edible_fraction` is `(0,1]`, meaning edible grams divided by as-purchased gross grams. Recipe quantities are as-purchased before trim.
- Seed required nutrients: `energy_kcal/kcal`, `protein_g/g`, `carbohydrate_g/g`, `fat_g/g`, `fibre_g/g`, `sodium_mg/mg`.
- `amount_per_100g` is non-negative/non-null. Stored `0` is assessed zero; no row is unknown. Published facts require exactly one row for all six. Optional nutrients may remain absent/unknown.
- Nutrition is `grossGrams × edibleFraction`, then `edibleGrams / 100 × amountPer100g`. Sum Decimal values in stable order and round presentation only at immutable nutrient precision.
- Draft diagnostics may return partial totals plus coverage/`UNKNOWN_NUTRIENT`. Published recipe calculations require 100% coverage for all six. No retention factors, health scores, targets, diagnoses, or medical advice.

### 1.5 Allergens, dietary lineage, and Phase 1 hard rules

Seed allergens `peanut`, `tree_nut`, `dairy`, `egg`, `soy`, `wheat`, `fish`, `crustacean`, `mollusc`, and `sesame`. Each fact has one assessment per supported allergen: `absent`, `contains`, `may_contain`, or `unknown`, with provenance. Publication requires every row and forbids `unknown`. This distinguishes explicit absence from unknown and causes newly added allergens to remain unknown for older facts.

Seed shallow categories sufficient for current exclusions: roots plus `pork`, `beef`, `poultry`, `seafood`, `fish`, `crustacean`, `mollusc`, `egg`, `dairy`, `tofu`, `vegetable`, `staple`, and `seasoning`. Ancestry is cycle-free and semantic links lock after published reference. Seed dietary tag `vegetarian`; absence means “does not satisfy,” never “unknown safe.”

Create immutable `household_rule_catalog_targets`:

| Hard code | Canonical mapping |
|---|---|
| `allergen_peanut` | allergen `peanut` |
| `allergen_tree_nut` | allergen `tree_nut` |
| `allergen_milk` | allergen `dairy` |
| `allergen_egg` | allergen `egg` |
| `allergen_soy` | allergen `soy` |
| `allergen_wheat` | allergen `wheat` |
| `allergen_fish` | allergen `fish` |
| `allergen_crustacean` | allergen `crustacean` |
| `allergen_mollusc` | allergen `mollusc` |
| `allergen_sesame` | allergen `sesame` |
| `allergen_other` | unsupported; no target FK |
| `exclude_pork` | category `pork` |
| `exclude_beef` | category `beef` |
| `exclude_poultry` | category `poultry` |
| `exclude_seafood` | category `seafood` plus descendants |
| `exclude_egg` | category `egg` |
| `exclude_dairy` | category `dairy` |
| `diet_vegetarian` | required tag `vegetarian` |

The table enforces exactly one target for supported mappings and none for unsupported. A deferred assertion proves every Phase 1 hard option has exactly one mapping and no soft option has one. Mapping semantics are immutable.

The pure evaluator returns `eligible`, `excluded`, `unknown_lineage`, or `unsupported_hard_rule` with stable codes. `contains` and `may_contain` exclude. Missing assessment/mapping/ancestry fails closed. `allergen_other` is always unsupported. Soft preferences and free text are never eligibility inputs.

### 1.6 Recipe model and metadata

`recipe_versions` has positive version/revision/yield, positive active time, elapsed time between active and 180, publication status/hash/creator/timestamps, and a composite current-version pointer from stable recipe.

Each ingredient references stable `food_id`, exact `food_fact_version_id`, positive decimal quantity, exact unit, bounded optional Vietnamese preparation label, and positive order. Enforce composite `(food_id,food_fact_version_id)`, unique food and order per version, and published fact before recipe publication. Every structured ingredient is authoritative; optional garnish may appear only in steps.

Steps have positive contiguous order, bounded non-empty Vietnamese instruction, and nullable timer between zero and elapsed time. Publication requires at least one ingredient/step.

Add controlled immutable `recipe_tags` and versioned joins. Seed inert metadata only: cooking styles `style_boil`, `style_braise`, `style_fry`, `style_grill`, `style_steam`, `style_stir_fry`; protein hints `protein_pork`, `protein_beef`, `protein_poultry`, `protein_fish`, `protein_seafood`, `protein_plant`; dish roles `role_staple`, `role_main`, `role_vegetable`, `role_soup`, `role_side`. Tags cannot override ingredient-derived safety. Meal options, protein caps, and scoring wait for Phase 3.

### 1.7 PortionConfigV1 and recipe scaling

```typescript
export const PORTION_CONFIG_V1 = {
  version: "portion-v1",
  coefficients: {
    adult: "1",
    child_1_3: "0.4",
    child_4_6: "0.55",
    child_7_9: "0.7",
    child_10_12: "0.85",
    child_13_17: "1",
    elderly: "0.85"
  }
} as const
```

The pure primitive validates existing Phase 1 groups/count/total, calculates adult equivalents in canonical order, divides by recipe yield, scales each ingredient, and converts via its pinned fact. Output is sorted by ingredient order then stable ID and contains normalized unrounded source/base/gross-gram values.

No artificial minimum authoritative quantity exists. Display-only minimum is one display quantum. Invalid config/group/yield/conversion/dimension/result returns typed failure. This scales one recipe only—no meal option or weekly planner.

### 1.8 Prices, freshness, and consumption cost

Seed immutable launch region `vn_baseline`. Add/backfill non-null `households.price_region_id` with this default and prevent client changes away from it during MVP. There is no onboarding/UI change.

Price books are immutable versions with effective range, status/hash/revision/current-region pointer. Each `food_prices` row carries exact book, stable food, fact provenance, package quantity/unit, normalized stable-base quantity/unit, positive safe-integer VND price, positive purchase increment, non-future observation date, and source. Unique one price per food/book. Publication recomputes/validates normalization from the pinned fact. A price fact may differ from the recipe fact because normalized price provenance and both hashes remain pinned to the stable food.

```typescript
export const PRICE_FRESHNESS_CONFIG_V1 = {
  version: "price-freshness-v1",
  currentMaxAgeDays: 30,
  usableMaxAgeDays: 90
} as const
```

With explicit ISO calculation date and calendar days: future is invalid; age 0–30 is current; 31–90 is stale usable with warning/date; >90 or missing is unusable. Domain never reads wall clock. Threshold changes create a new code version.

Consumption cost aggregates scaled base quantity by stable food, then calculates `requiredBaseQuantity / packageBaseQuantity × packagePriceVnd`. Return raw contributions, warnings, and total rounded half-up once to VND. Wrong/missing/duplicate/future/too-old prices fail; none contribute zero. Ignore `purchase_increment`, ceiling, weekly consolidation, packages, leftovers, and basket cost until Phase 4.

### 1.9 Reproducibility and fingerprint input

`RecipeCalculationInputV1` includes calculation version, full portion/freshness configs, canonical anonymous member groups, recipe identity/version/hash/yield/time, ordered ingredients, stable food/base identity/label, exact fact ID/version/hash, edible fraction, conversion, six nutrients, explicit assessments, category ancestry/tags, selected region/book/version/hash/price rows, and explicit date.

Domain normalizes this object to canonical bytes; application hashing returns SHA-256. Future snapshots copy this input/output rather than re-reading current pointers. Phase 2 creates no plan/snapshot tables.

---

## 2. Database Integrity, RLS, and Admin Boundary

### 2.1 Migration and schema

Create `supabase/migrations/20260826010000_phase_2_food_recipe.sql` with:

| Table/change | Authoritative design |
|---|---|
| `units` | UUID PK, unique code, dimension enum, positive numeric factor, immutable calculation fields after published reference |
| `food_categories` | UUID PK, unique code, nullable parent, no self/cycle, immutable code/parent after published reference |
| `allergens`, `dietary_tags` | UUID PKs, unique semantic code, bounded label, semantic code lock after reference |
| `nutrients` | UUID PK, unique code, canonical unit enum, display precision 0–6, code/unit lock after reference |
| `price_regions` | UUID PK, unique code, one partial-unique launch default, composite current-book pointer |
| `foods` | UUID PK, unique code, base dimension/unit composite FK, status/revision/current-fact pointer, stable calculation identity lock |
| `food_fact_versions` | UUID PK, food, positive version/revision, category, fixed basis, edible fraction, non-null publication assessment date/provenance, status/hash/timestamps; unique `(food_id,version_number)` and `(food_id,id)`; one draft/food partial index |
| `food_fact_unit_conversions` | fact/source-unit PK, positive base/gram factors/display step, provenance; immutable with published parent |
| `food_fact_allergen_assessments` | fact/allergen PK, explicit four-state assessment/provenance; immutable with published parent |
| `food_fact_dietary_tags` | fact/tag PK; immutable with published parent |
| `food_fact_nutrients` | fact/nutrient PK, non-negative amount/non-empty provenance; immutable with published parent |
| `household_rule_catalog_targets` | rule-code PK, mapping kind, exact-one target FK or unsupported-none, hard-option completeness assertion, immutable |
| `recipes` | UUID PK, unique code, status/revision/current-version composite pointer, stable code lock |
| `recipe_versions` | UUID PK, recipe/version uniqueness and `(recipe_id,id)`, yield/time/revision/status/hash; one draft/recipe partial index |
| `recipe_ingredients` | UUID PK, recipe, composite food/fact, quantity/unit, unique food/order, note; immutable with published parent |
| `recipe_steps` | UUID PK, recipe, positive unique order, instruction/timer; immutable with published parent |
| `recipe_tags`, `recipe_version_tags` | stable typed metadata vocabulary and versioned join; immutable semantics/published join |
| `price_books` | UUID PK, region/version uniqueness and `(region_id,id)`, effective range/status/hash/revision; one draft/region partial index |
| `food_prices` | UUID PK, book, composite food/fact, package and normalized quantities/units, VND/increment/date/source, unique food/book; immutable with published parent |
| `admin_audit_log` | UUID PK, admin/trusted actor check, bounded action/entity/summaries, append-only, entity/time index |
| `households` | add/backfill non-null launch `price_region_id`; FK/trigger preserve default without Phase 1 UI change |

Use `numeric(18,6)` for persisted factors/quantities. Hash is null exactly for draft and non-null 64-hex when published. Published timestamp/status/hash consistency is a DB check. Creator/actor references Auth where applicable; audits minimize copied catalog content.

### 2.2 Authoritative triggers and RPCs

Private functions are `security definer set search_path = ''`, fully qualify objects, and revoke execution from `public`, `anon`, and `authenticated`. Triggers enforce:

- stable food/base and recipe identity locks;
- semantic unit/category/allergen/tag/nutrient locks after published reference;
- category acyclicity and complete hard-rule mapping;
- composite fact/current-pointer ownership;
- draft-only child mutation;
- published fact/recipe/book aggregate immutability, including service-role attempts;
- state/hash/timestamp consistency, conversion math, price normalization, and append-only audit;
- current pointer/status/hash/audit columns have no direct client or service-role write grant; only the matching restricted definer RPC can change them, while pointer ownership/state triggers still validate its result.

Restricted `security definer`, empty-search-path RPCs are owned by the migration owner, revoked from `public`, `anon`, `authenticated`, and executable only by `service_role`:

```text
publish_food_fact_version(uuid, text, uuid, integer)
publish_recipe_version(uuid, text, uuid, integer)
publish_price_book(uuid, text, uuid, integer)
retire_catalog_identity(text, uuid, uuid, integer)
```

Each rechecks that `p_actor_user_id` exists with signed Auth app metadata role `admin`, locks the aggregate, checks expected revision/completeness, changes protected status/current-pointer columns, and appends one audit row atomically. Retirement has a closed entity-type allowlist. Draft CRUD uses explicit server repository fields and revision predicates; DB checks/triggers remain authoritative. No RPC accepts arbitrary tables, SQL, roles, actor ownership, hash payload objects, or client audit summaries.

Trusted application reloads under lock-compatible ordering, normalizes, hashes, then passes only the final 64-hex hash. Browser roles cannot write/call RPCs, and published aggregates cannot change afterward.

Because PostgREST can otherwise decode PostgreSQL `numeric` as JavaScript numbers, add two deterministic read RPCs that cast every calculation-bearing numeric to normalized text and build arrays in explicit order:

- `get_published_recipe_calculation_input(uuid, uuid) returns jsonb` is `security invoker`, granted to `authenticated`, and exposes only an RLS-visible published recipe plus the named published price book;
- `get_catalog_aggregate_for_publication(text, uuid) returns jsonb` is service-role-only with a closed aggregate-type allowlist and returns the draft aggregate used for validation/hash.

Both have empty search paths, reject missing/duplicate/unpublished relationships, and perform no calculation or current-pointer substitution. Authoritative domain/adapters use these RPC payloads, never raw numeric table JSON. Direct table `SELECT` remains only a published reference/display contract.

### 2.3 Grants and RLS

- Enable RLS on every public Phase 2 table and `revoke all` from `anon, authenticated` first.
- `anon` receives no catalog access.
- `authenticated` receives `SELECT` only. Policies expose active published stable foods/recipes and published children, launch region/current published price book/prices, and reference/mapping vocabularies required to interpret them.
- Child policies require the published parent/stable identity. Drafts, retired discovery rows, audit rows, and unpublished children return no rows.
- Even authenticated users with admin app metadata get no catalog `INSERT/UPDATE/DELETE` or publication execute grant. An admin token alone cannot bypass Data API protections.
- `service_role` exists only in server infrastructure. Revoke its broad Phase 2 table privileges, then grant only required reads, draft inserts, draft-mutable child/parent columns, and execution of closed publication/read functions. It receives no direct grant for current pointers, publication status/hash/timestamps, retirement, or audit mutation. Its RLS bypass does not bypass grants, constraints, or triggers. Server verifies user with public auth client before using the secret client.
- Existing Phase 1 ownership policies/grants remain unchanged except database-managed launch region default. Clients cannot choose arbitrary regions in Phase 2.
- Administrator bootstrap/removal has no route/RPC. Trusted operations alone set/remove `auth.users.raw_app_meta_data.role='admin'`; `user_metadata` never grants authority.

### 2.4 Vercel admin Function contract

Create one narrow `POST /api/admin/catalog` endpoint with a discriminated allowlist:

- `create_food`, `save_food_fact_draft`, `publish_food_fact`, `retire_food`;
- `create_recipe`, `save_recipe_version_draft`, `publish_recipe`, `retire_recipe`;
- `create_price_book`, `save_price_book_draft`, `publish_price_book`, `retire_price_book`.

Updates carry `expectedRevision`. Publish bodies contain only ID/revision; server reloads, validates, canonicalizes/hashes, then calls restricted RPC. Reject client actor/status/pointer/hash/audit/relation fields.

Return minimal typed identity/version/revision/status/hash. Stable errors: `400` validation, `401 UNAUTHORIZED`, `403 ADMIN_REQUIRED`, `405 METHOD_NOT_ALLOWED`, `409 STALE_CATALOG_REVISION`, `422 PUBLICATION_INCOMPLETE`, sanitized `503 CATALOG_UNAVAILABLE`. Never echo tokens, credentials, SQL, provenance bodies, or Supabase internals.

Verify Bearer token with `auth.getUser`, derive user ID, and accept only signed `app_metadata.role === 'admin'`. Dependency injection keeps tests secret-free. Production composition reads `SUPABASE_SECRET_KEY` inside `api/` only; no `VITE_*` secret or committed secret placeholder exists. Existing Vercel `/api/*` rewrite already preserves this Function.

---

## 3. Typed Source Boundaries

### 3.1 Pure domain files

- `src/domain/shared/decimal.ts`, `canonical-json.ts`
- `src/domain/catalog/catalog.ts`, `normalize-catalog.ts`, `hard-rule-mapping.ts`, `evaluate-hard-rules.ts`
- `src/domain/portion/portion-config.ts`, `calculate-adult-equivalent.ts`
- `src/domain/recipe/recipe.ts`, `scale-recipe.ts`
- `src/domain/nutrition/calculate-recipe-nutrition.ts`
- `src/domain/pricing/pricing.ts`, `classify-price-freshness.ts`, `calculate-recipe-consumption-cost.ts`
- `src/domain/calculation/recipe-calculation-input.ts`

Expected failures are discriminated results, not UI strings. Stable codes include `INVALID_DECIMAL`, `INVALID_PORTION_CONFIG`, `UNSUPPORTED_MEMBER_BAND`, `INVALID_RECIPE_YIELD`, `MISSING_UNIT_CONVERSION`, `DIMENSION_MISMATCH`, `UNKNOWN_NUTRIENT`, `INCOMPLETE_NUTRITION`, `UNKNOWN_ALLERGEN_LINEAGE`, `UNSUPPORTED_HARD_RULE`, `MISSING_PRICE`, `STALE_PRICE`, `PRICE_TOO_OLD`, `FUTURE_PRICE`, `PRICE_FOOD_MISMATCH`, and `DUPLICATE_PRICE`.

### 3.2 Application ports/use cases

- `catalog-read-repository.ts`: published calculation inputs by exact recipe/price-book IDs.
- `catalog-admin-repository.ts`: allowlisted draft operations and restricted publish/retire calls.
- `content-hasher.ts`: SHA-256 port over canonical bytes.
- `load-recipe-calculation-input.ts`: assemble/revalidate pinned records without current-pointer substitution.
- `catalog-admin-command.ts`: closed request/response union.
- `execute-catalog-admin-command.ts`: revision, normalization, reload-before-publish, hash, repository orchestration.

Application imports only domain/application ports. It does not import Supabase, Vercel, React, or operate on DB rows directly.

### 3.3 Infrastructure adapters

- `src/infrastructure/supabase/supabase-catalog-read-repository.ts`: user-scoped typed published reads under RLS.
- `src/infrastructure/server/supabase-catalog-admin-repository.ts`: injected secret client and explicit table/RPC calls.
- `src/infrastructure/server/node-content-hasher.ts`: Node SHA-256.
- `src/infrastructure/supabase/server-admin-auth.ts`: signed app-metadata verification with public server-auth client.

Adapters explicitly convert numeric strings, sort unordered results, detect missing/duplicate children, and preserve exact pinned IDs. Extend architecture lint so `src/app`/`src/features` cannot import `src/infrastructure/server/**`; API may compose it.

Regenerate `src/infrastructure/supabase/database.types.ts` only from reset local/CI schema. Update API/integration tsconfig includes; never hand-edit generated types.

---

## 4. Ordered Implementation Tasks

### Gate 0: Reconfirm approved base, Node, repository health, and DB capability

**Expected files:** None.

- [ ] Run Section 0 ancestry checks. Stop with `PHASE_2_BLOCKED_PHASE_1_NOT_IN_ANCESTRY` on failure.
- [ ] Require Node major 24, then run `npm ci` and `npm run preflight`.
- [ ] Record exactly `LOCAL_DB_VERIFICATION_AVAILABLE` or `LOCAL_DB_VERIFICATION_UNAVAILABLE`. Do not install Docker merely to proceed.
- [ ] Run inherited baseline:

  ```powershell
  npm run verify:non-db
  git status --short --branch
  ```

- [ ] If local DB is available, run inherited DB reset/lint/pgTAP/types/integration/onboarding before Task 1:

  ```powershell
  npm run preflight:db
  npm run supabase:start
  npm run supabase:reset
  npm run supabase:lint
  npm run supabase:test
  npm run db:types:check
  npm run test:integration
  npm run test:e2e:onboarding
  npm run supabase:stop
  ```

No commit. Without Docker continue with `DATABASE_RLS_GATE_PENDING_CI`; do not claim DB PASS.

### Task 1: Add exact decimal and canonical normalization foundations

**TDD:** Yes.

**Expected files:** Modify `package.json`, `package-lock.json`; create `src/domain/shared/decimal.ts`, `decimal.test.ts`, `canonical-json.ts`, `canonical-json.test.ts`.

- [ ] RED-test accepted/rejected decimal syntax, negative zero, exact arithmetic, half-up/ceiling, key ordering, stable set sorting, Unicode, and byte equivalence under input reorder.
- [ ] Install Decimal.js and implement only shared primitives; hashing remains outside domain.
- [ ] Verify and commit:

  ```powershell
  npx vitest run src/domain/shared
  npm run lint
  npm run typecheck
  npm run test:coverage
  git diff --check
  git status --short
  ```

- [ ] Commit `feat: add deterministic decimal primitives`.

**Safety:** No second numeric library, global Decimal mutation, platform hash API, or `number` conversion.

### Task 2: Add PortionConfigV1 and one-recipe scaling

**TDD:** Yes.

**Expected files:** Create `src/domain/catalog/catalog.ts`, `src/domain/recipe/recipe.ts`, `src/domain/portion/portion-config.ts`, `calculate-adult-equivalent.ts` and test, `src/domain/recipe/scale-recipe.ts` and test.

- [ ] RED-test every coefficient and golden case: two adults + child `4_6` + elderly = `3.4`; four-serving scale = `0.85`; `500 g` becomes `425 g`.
- [ ] RED-test group reorder determinism, mass/volume/count and explicit cross-dimension conversion, missing conversion, dimension mismatch, invalid yield, duplicate/unsupported bands, total outside 1–20, and positive below display quantum.
- [ ] Implement frozen config, canonical order, raw/base/gross scaling, and separate display projection. Do not ceil count/packages.
- [ ] Verify and commit:

  ```powershell
  npx vitest run src/domain/portion src/domain/recipe
  npm run lint
  npm run typecheck
  npm run test:coverage
  git diff --check
  git status --short
  ```

- [ ] Commit `feat: add deterministic recipe scaling`.

**Safety:** No meal option, week, budget, shopping, pantry, or planner dependency.

### Task 3: Add fail-closed hard-rule and nutrition calculations

**TDD:** Yes.

**Expected files:** Create `src/domain/catalog/hard-rule-mapping.ts`, `evaluate-hard-rules.ts` and test, `normalize-catalog.ts` and test, `src/domain/nutrition/calculate-recipe-nutrition.ts` and test; modify catalog/recipe contracts.

- [ ] RED-test all 18 hard mappings exhaustively; fail if Phase 1 adds an unmapped hard option or a soft option enters eligibility.
- [ ] RED-test contains/may-contain/absent/unknown, missing assessment, category ancestry, vegetarian requirement, and `allergen_other` always unsupported. Unknown never yields eligible.
- [ ] RED-test gross-to-edible nutrition, explicit zero versus missing, six required nutrients, per-nutrient coverage, stable summation, and golden volume/count result.
- [ ] Implement normalization diagnostics/nutrition only; no targets, health score, or planner nutrition score.
- [ ] Verify and commit:

  ```powershell
  npx vitest run src/domain/catalog src/domain/nutrition
  npm run lint
  npm run typecheck
  npm run test:coverage
  git diff --check
  git status --short
  ```

- [ ] Commit `feat: add catalog lineage and nutrition rules`.

**Safety:** Tags cannot override ingredient lineage; missing allergen/nutrient data remains failure.

### Task 4: Add freshness, consumption cost, and fingerprint contracts

**TDD:** Yes.

**Expected files:** Create `src/domain/pricing/pricing.ts`, `classify-price-freshness.ts` and test, `calculate-recipe-consumption-cost.ts` and test, `src/domain/calculation/recipe-calculation-input.ts` and test.

- [ ] RED-test ages `-1`, `0`, `30`, `31`, `90`, `91`; future/too-old/missing unusable and 31–90 warning stable.
- [ ] RED-test proportional cost, stable-food matching across different fact versions, wrong food/base unit, duplicate/missing price, stale warning, sum-then-half-up VND, and reordered input equivalence.
- [ ] RED-test canonical input includes both configs, all exact IDs/hashes/conversions/nutrients/assessments/prices/date, and changes bytes for any calculation-bearing change.
- [ ] Implement consumption cost only. Assert `purchase_increment` does not affect it and no ceiling/basket/week/budget output exists.
- [ ] Verify and commit:

  ```powershell
  npx vitest run src/domain/pricing src/domain/calculation
  npm run lint
  npm run typecheck
  npm run test:coverage
  git diff --check
  git status --short
  ```

- [ ] Commit `feat: add deterministic recipe costing`.

**Safety:** Consumption estimate is not a purchase-basket total; unknown price never becomes zero.

### Task 5: Add catalog migration and pgTAP integrity/security tests

**TDD:** Yes with Docker; otherwise author tests first and keep CI pending without claiming local RED/GREEN.

**Expected files:** Create `supabase/migrations/20260826010000_phase_2_food_recipe.sql`, `supabase/tests/database/phase_2_catalog_schema.test.sql`, `phase_2_catalog_integrity.test.sql`, and `phase_2_catalog_rls.test.sql`.

- [ ] Write pgTAP first for tables, enums/checks/unique/index/composite FKs, pointer ownership, canonical vocabulary/mappings, household region backfill, RLS, exact authenticated/service-role table and column grants, definer owner/search-path safety, publication/read RPC execute restrictions, and numeric-to-text ordered read payloads.
- [ ] Test rejection of mismatched food/fact, pointer, category cycle, dimensions/factors, non-contiguous children, missing nutrients/allergen/conversion, future price, wrong package normalization, and incomplete recipes.
- [ ] Test atomic immutability: no role/trusted context updates/deletes published aggregate or mutates children; failed multi-row statements persist nothing; new draft version corrects while old ID/hash remains unchanged.
- [ ] Cross-role test: anon sees nothing; A/B read identical published data but no draft/audit; ordinary and app-metadata-admin authenticated roles cannot write/call publication; service RPC is restricted.
- [ ] Implement schema/seeds/triggers/RPCs. Canonical lookup seeds belong in migration; no product recipe/food launch data does.
- [ ] With Docker run:

  ```powershell
  npm run preflight:db
  npm run supabase:start
  npm run supabase:reset
  npm run supabase:lint
  npm run supabase:test
  npm run supabase:stop
  ```

- [ ] Always run:

  ```powershell
  npm run format:check
  npm run lint
  npm run typecheck
  npm run test
  git diff --check
  git status --short
  ```

- [ ] Commit `feat: add immutable food and recipe catalog schema` if all runnable checks pass. Without Docker status remains `DATABASE_RLS_GATE_PENDING_CI`.

**Safety:** Reset ephemeral local only. No `db push`, `--linked`, login, production seed, broad grant, disabled trigger, cascade deletion, or remote URL.

### Task 6: Add publication use cases, ports, and hash adapter

**TDD:** Yes.

**Expected files:** Create `src/application/catalog/catalog-read-repository.ts`, `catalog-admin-repository.ts`, `content-hasher.ts`, `catalog-admin-command.ts`, `load-recipe-calculation-input.ts` and test, `execute-catalog-admin-command.ts` and test; create `src/infrastructure/server/node-content-hasher.ts` and test.

- [ ] RED-test exact-ID loading, missing/duplicate child rejection, stable sorting, no current-pointer substitution, revision conflict, draft validation, reload-before-publish, canonical SHA-256, publication error mapping, and no write on failed validation.
- [ ] Implement injected ports/use cases. Publish client input cannot provide hash, actor, status, pointer, or audit data.
- [ ] Add golden fact/recipe publication payloads with stable canonical strings/hashes. Fixtures are tests only and do not claim launch breadth.
- [ ] Verify and commit:

  ```powershell
  npx vitest run src/application/catalog src/infrastructure/server/node-content-hasher.test.ts
  npm run lint
  npm run typecheck
  npm run test:coverage
  npm run build
  git diff --check
  git status --short
  ```

- [ ] Commit `feat: add catalog publication use cases`.

**Safety:** Application cannot import Supabase; clients cannot supply hashes.

### Task 7: Add generated types and Supabase catalog adapters

**TDD:** Yes for mapping; generation requires Docker/CI.

**Expected files:** Modify generated `src/infrastructure/supabase/database.types.ts`, `tsconfig.api.json`, `tsconfig.integration.json`, `eslint.config.js`, `scripts/architecture-lint.test.ts`; create `src/infrastructure/supabase/supabase-catalog-read-repository.ts` and test, `src/infrastructure/server/supabase-catalog-admin-repository.ts` and test.

- [ ] RED-test numeric-string mapping, pinned IDs, unordered normalization, zero/missing distinction, draft invisibility, RPC parameter/revision/error mapping, and secret-free errors.
- [ ] RED-test architecture lint rejects app/feature imports from `@/infrastructure/server/**` and permits API composition.
- [ ] Implement published browser adapter and injected server admin adapter. No environment access in domain/application/browser code.
- [ ] With Docker regenerate/check types:

  ```powershell
  npm run supabase:start
  npm run supabase:reset
  npm run db:types:generate
  npm run db:types:check
  npm run supabase:stop
  ```

  Without Docker, obtain exact-schema generated artifact from CI, inspect/replace only generated file, push new HEAD, and require new exact-HEAD CI. Never hand-edit.

- [ ] Verify and commit:

  ```powershell
  npx vitest run src/infrastructure scripts/architecture-lint.test.ts
  npm run lint
  npm run typecheck
  npm run test:coverage
  npm run build
  git diff --check
  git status --short
  ```

- [ ] Commit `feat: add typed Supabase catalog adapters`.

**Safety:** Types come only from reset local/CI schema; no remote generation or browser secret client.

### Task 8: Add verified administrator server API

**TDD:** Yes.

**Expected files:** Create `src/infrastructure/supabase/server-admin-auth.ts` and test, `api/admin/catalog.ts` and test; modify `scripts/check-secrets.test.ts`, `scripts/validate-env.test.ts`, `README.md`.

- [ ] RED-test missing/forged token, ordinary user, `user_metadata` spoof, signed `app_metadata.role='admin'`, method/action/extra fields, revision conflict, validation/publication outcomes, sanitized failure, and credential non-disclosure.
- [ ] Implement dependency-injected handler. Runtime verifies with public server config first, then creates server repository with `SUPABASE_SECRET_KEY`; it never forwards/logs the secret.
- [ ] Strengthen secret tests for any `VITE_*` secret/service key or committed assignment. Keep `.env.example` public-only; README names server runtime variable without a value/deploy step.
- [ ] README documents immutable versions, unknown data, consumption vs future basket cost, trusted admin bootstrap, local-only testing, and Phase 3+ deferrals. Add no UI route.
- [ ] Verify and commit:

  ```powershell
  npx vitest run api/admin src/infrastructure/supabase/server-admin-auth.test.ts scripts/check-secrets.test.ts scripts/validate-env.test.ts
  npm run env:check
  npm run secrets:check
  npm run lint
  npm run typecheck
  npm run test:coverage
  npm run build
  git diff --check
  git status --short
  ```

- [ ] Commit `feat: add trusted catalog admin API`.

**Safety:** No role assignment API, browser secret, broad service operation, production config, or deployment.

### Task 9: Add Supabase catalog integration and CI enforcement

**TDD:** Yes for helper/integration; CI is command-verified.

**Expected files:** Create `scripts/local-supabase-admin-env.mjs` and test, `tests/integration/supabase-catalog.integration.test.ts`, `catalog-admin-api.integration.test.ts`; modify `package.json`, `.github/workflows/ci.yml`, `vitest.integration.config.ts`, `tsconfig.integration.json`.

- [ ] RED-test local admin-env helper: parse `supabase status -o env`, reject non-loopback URL, pass secret only to named child, redact stdout/stderr/errors, never write disk, fail on missing stack/key. It is server integration only, never Vite/Playwright.
- [ ] Add `test:integration:catalog-admin` guarded by `preflight:db` and helper. Keep existing public-key `test:integration` for Auth/household/catalog reads.
- [ ] Integration proves:

  - anon/A/B exact read contract, published visibility, and draft/audit invisibility;
  - ordinary and admin-metadata tokens cannot mutate through Data API/publication RPC;
  - forged/ordinary/admin API authorization;
  - valid allowlisted draft and atomic publish;
  - incomplete publication has no partial pointer/status/audit;
  - composite mismatch and price normalization fail;
  - service role still cannot mutate published parents/children/audit;
  - correction creates new version/current pointer while old IDs/children/hashes remain unchanged;
  - exact recipe input survives newer current food fact;
  - repeated adapter loads yield identical canonical input/hash;
  - Phase 1 Auth/household/onboarding/ownership still pass after region backfill.

- [ ] Extend non-deploying CI `database` job after reset/lint/pgTAP/type check with public integration, admin integration, and existing onboarding Playwright. Preserve `web`, cleanup/type artifact, no `continue-on-error`, secrets, deployment, or write permission.
- [ ] With Docker run; otherwise retain `DATABASE_RLS_GATE_PENDING_CI`:

  ```powershell
  npm run preflight:db
  npm run supabase:start
  npm run supabase:reset
  npm run supabase:lint
  npm run supabase:test
  npm run db:types:check
  npm run test:integration
  npm run test:integration:catalog-admin
  npm run test:e2e:onboarding
  npm run supabase:stop
  ```

- [ ] Non-database checks:

  ```powershell
  npx vitest run scripts/local-supabase-admin-env.test.ts
  npm run format:check
  npm run lint
  npm run typecheck
  npm run test:coverage
  npm run build
  git diff --check
  git status --short
  ```

- [ ] Commit `test: verify food and recipe catalog integration`.

**Safety:** Helper accepts loopback only. CI uses ephemeral GitHub Docker; neither path links/mutates remote Supabase.

### Task 10: Documentation, regression audit, and exit gate

**TDD:** No new behavior; verification/scope audit.

**Expected files:** None. Documentation changes belong to Task 8; Task 10 only verifies the committed branch.

- [ ] Audit scope/security; investigate every match:

  ```powershell
  rg -n "beam|seven.day|7.day|meal.?plan|replacement|shopping.?list|pantry|packageCount|purchaseBasket|budget.?search|openai|anthropic|langchain|vector|turso" src api supabase tests package.json
  rg -n "TODO|TBD|FIXME|HACK|not implemented" src api scripts supabase tests README.md
  rg -n "VITE_.*(SECRET|SERVICE|PRIVATE)|service_role|SUPABASE_SECRET_KEY" .env.example src api scripts .github supabase
  ```

  Matches may be negative tests/scope prose, stored `purchase_increment`, or server-only composition only. No planner/shopping implementation or credential value.

- [ ] Run mandatory non-database exit gate:

  ```powershell
  npm ci
  npm run preflight
  npm run env:check
  npm run secrets:check
  npm run security:dependencies
  npm run format:check
  npm run lint
  npm run typecheck
  npm run test:coverage
  npm run build
  npx playwright install chromium
  npm run test:e2e
  git diff --check
  git status --short --branch
  ```

- [ ] Resolve DB evidence: with local capability run reset/lint/all pgTAP/type/public+admin integration/onboarding/stop; without it push for CI and require exact-final-HEAD `web` and `database`. If first CI supplies generated types, commit only inspected generated file, push new HEAD, and require a second exact-HEAD PASS.
- [ ] Inspect branch:

  ```powershell
  git status --short --branch
  git log --oneline fd5fe8dcab8a8d80c55f92cb2f14498a9e32e727..HEAD
  git diff --stat fd5fe8dcab8a8d80c55f92cb2f14498a9e32e727...HEAD
  git diff --check fd5fe8dcab8a8d80c55f92cb2f14498a9e32e727...HEAD
  ```

- [ ] Push without force and require exact-final-HEAD CI:

  ```powershell
  git push --set-upstream origin codex/phase-2-food-recipe
  $phase2Head = git rev-parse HEAD
  $phase2Run = gh run list --workflow ci.yml --branch codex/phase-2-food-recipe --commit $phase2Head --limit 1 --json databaseId,headSha,status,conclusion,url | ConvertFrom-Json
  if ($phase2Run.Count -ne 1 -or $phase2Run.headSha -ne $phase2Head) { throw "No CI run found for exact Phase 2 HEAD" }
  gh run watch $phase2Run.databaseId --exit-status
  $jobs = (gh run view $phase2Run.databaseId --json jobs | ConvertFrom-Json).jobs
  if (($jobs | Where-Object name -eq "web").conclusion -ne "success") { throw "CI web job did not pass" }
  if (($jobs | Where-Object name -eq "database").conclusion -ne "success") { throw "CI database job did not pass" }
  ```

- [ ] Report `PHASE_2_PASS` and `TASK_COMPLETE_PUSHED` only after all criteria pass for exact pushed HEAD. Otherwise `PHASE_2_BLOCKED` with exact gate. Stop; do not merge/start Phase 3.

**Safety:** Verification push is not deployment. Fix owning task, rerun focused/full gates, never weaken gates or force-push.

---

## 5. Exact Verification Command Reference

### Fast deterministic feedback

```powershell
npx vitest run src/domain src/application/catalog
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```

### Local capability

```powershell
npm run preflight
```

Record `LOCAL_DB_VERIFICATION_AVAILABLE` or `LOCAL_DB_VERIFICATION_UNAVAILABLE`. Node 24 is mandatory; local Docker absence alone is not a blocker.

### Authoritative local database path

```powershell
npm run preflight:db
npm run supabase:start
npm run supabase:reset
npm run supabase:lint
npm run supabase:test
npm run db:types:check
npm run test:integration
npm run test:integration:catalog-admin
npm run test:e2e:onboarding
npm run supabase:stop
```

All Supabase endpoints must be loopback. Never use `--linked`, `db push`, login, hosted URLs, production/staging credentials, or a remote substitute.

### Authoritative CI database path

When local Docker is unavailable, exact-final-SHA GitHub Actions `database` must pass Node/Docker/Supabase preflight, start, clean reset, SQL lint, inherited and Phase 2 pgTAP/RLS/immutability, generated-type drift, public Auth/household/catalog integration, secret-backed local catalog-admin integration, existing onboarding Playwright, and cleanup. Prior SHA/artifact-only evidence is insufficient.

### Mandatory local non-database exit gate

```powershell
npm ci
npm run preflight
npm run env:check
npm run secrets:check
npm run security:dependencies
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npx playwright install chromium
npm run test:e2e
git diff --check
git status --short --branch
```

---

## 6. Phase 2 Exit Criteria

- [ ] Approved Phase 1 SHA is an ancestor and inherited regressions pass.
- [ ] Stable food/recipe identities retain immutable exact published versions; current pointers cannot rewrite history.
- [ ] Recipe ingredients store stable food and exact same-food fact version through tested composite FK.
- [ ] Published facts own immutable edible fraction, six explicit nutrients, complete assessments, dietary/category lineage, conversions, provenance, and hash.
- [ ] Published recipe/price aggregates and children remain immutable even for trusted writes; corrections create new versions and preserve old hashes.
- [ ] All 18 Phase 1 hard rules map unambiguously; `allergen_other` and missing/unknown lineage fail closed; soft preferences never become eligibility constraints.
- [ ] PortionConfigV1 and PriceFreshnessConfigV1 are code-versioned and copied into calculation input.
- [ ] Scaling, conversion, nutrition, freshness, and prorated consumption cost use deterministic Decimal arithmetic and byte-equivalent normalized outputs with golden tests.
- [ ] Unknown nutrient/conversion/allergen/price is distinct from explicit zero/absence and cannot produce a complete published calculation.
- [ ] Price boundaries 0–30/31–90/>90 and future dates are exact and tested; thresholds are not DB-editable.
- [ ] Consumption cost contains no weekly package-rounded purchase-basket/shopping logic.
- [ ] Fingerprint input carries exact recipe/fact/price IDs/hashes, conversions, configs, and date; current-pointer changes do not affect historical exact-ID loads.
- [ ] Anon/ordinary/admin-token Data API roles cannot mutate catalog or call publication. Server verifies signed app metadata and leaks no secret.
- [ ] Constraints/triggers/RPC, domain, application, grants/RLS, direct/trusted tests converge on the same valid states.
- [ ] Generated types, pgTAP, integrations, inherited onboarding, local non-DB gates, and exact-HEAD `web`/`database` CI pass.
- [ ] No meal option, planner/search, seven-day generation, replacement, shopping aggregation/package rounding, pantry, admin UI/CMS, AI, deploy, production provisioning/migration exists.

### `PHASE_2_PASS`

Use only when mandatory local non-database gates pass, complete DB/RLS/type/integration passes locally or on exact-final-HEAD CI, and that verified HEAD is pushed.

### `PHASE_2_BLOCKED`

Use when Phase 1 ancestry is missing, Node 24 unavailable, any required check fails, generated types stale, exact-HEAD CI absent/failing, or DB/RLS/integration passed nowhere. `LOCAL_DB_VERIFICATION_UNAVAILABLE` alone requires CI; it is not itself blocked.

---

## 7. Self-Review Against Design, Request, and AGENTS.md

### 7.1 Coverage

| Requirement | Coverage |
|---|---|
| Base prerequisite | Section 0, Gate 0 |
| Stable food/versioned facts | 1.2, 2.1–2.2, Tasks 5–7 |
| Nutrients/allergens/tags/conversions | 1.3–1.5, Tasks 2–5 |
| Recipe identity/version/pinning | 1.6, Tasks 2/5–7 |
| Portion/scaling | 1.7, Task 2 |
| Phase 1 hard-rule mapping | 1.5, Tasks 3/5/9 |
| Price/freshness/cost | 1.8, Tasks 4/5/9 |
| Snapshot/fingerprint | 1.1/1.9, Tasks 1/4/6 |
| Least-privilege admin boundary | 2.2–2.4, Tasks 6–9 |
| Migration/RLS/tests/types/CI | Tasks 5/7/9–10 |

### 7.2 Contradiction and ambiguity audit

- **Phase 3 leakage:** One-recipe engines only; tags are inert. No `meal_options`, week, beam, score, budget selection, replacement, or planner API.
- **Published mutability:** DB triggers protect parent/children even from service role; pointers move only in restricted RPC. Calculation semantics remain pinned.
- **Hard rules:** All current hard codes are enumerated, structural mapping is immutable, missing mappings fail closed, `allergen_other` unsupported, soft preferences ignored by eligibility.
- **Allergens:** Explicit assessment distinguishes absent/unknown. `may_contain`, unknown, missing, unsupported never eligible. No safety claim UI.
- **Nutrition:** Stored zero is explicit; absence unknown; publication requires six rows.
- **Conversions:** Generic factors stay within dimensions; cross-dimension units require exact fact-specific base/gram factors. No piece/cup/spoon default.
- **Rounding/minimum:** Raw decimals are never clamped/rounded. Display-only quantum prevents rendering zero; package ceiling is Phase 4.
- **Prices:** Date explicit, boundaries inclusive, future/>90/missing unusable, config code-versioned, unknown never zero.
- **Cost:** Only proportional consumption cost. Stored purchase increment is ignored; no weekly basket is claimed.
- **Pinning:** Composite FKs and exact-ID adapters prevent current-fact substitution.
- **Direct writes:** Client roles have no mutations/RPC. Trusted paths still face structural checks/triggers and negative tests.
- **Secret safety:** Runtime server-only secret, no value/example/Vite exposure, architecture lint blocks browser import, signed `app_metadata` only.
- **Reproducibility:** Hashes cover immutable children; exact IDs/hashes/conversions/config/prices/date form canonical input. Plan snapshots are not prematurely created.
- **Region integration:** Existing households get one baseline without new onboarding input/UI; selection remains explicit until Phase 3.
- **Docker:** Approved Phase 0/1 CI-location correction supersedes older local-only wording only for where verification runs; every database gate remains mandatory.

### 7.3 Invariant convergence

| Layer | Responsibility | Cannot override |
|---|---|---|
| Domain | Decimal normalization, lineage, scaling, nutrition, freshness, cost, diagnostics | DB/auth |
| Application | Closed commands, revision, exact reload/hash, error mapping | DB triggers/grants |
| DB structure | FKs/checks/unique, ownership, dimensions/ranges | Prevalidation |
| Private triggers | Immutable publication, semantic locks, mappings/pointers/audit | RLS bypass |
| Restricted RPC | Atomic locked publish/pointer/audit | Structural/child triggers |
| Grants/RLS | Published reads only; no client writes | Semantic constraints |
| Server API | Signed admin verification and allowlisted composition | Database invariants |

Every database invariant has direct failure and intended valid success tests. Domain/RPC validation improves error quality but never replaces stored-state enforcement.

### 7.4 YAGNI/deferred

One catalog migration, pure calculators, minimal ports, one admin Function, and Decimal.js are sufficient. Defer meal-option composition and 21-option scenario gate; planner/time/diversity/search/budget/replacement; shopping/package/leftovers/pantry; admin UI/bulk import/media/retailer comparisons/region UI/audit dashboard; production catalog curation/deployment; AI/free-text/clinical logic.

Test fixtures prove lifecycle/calculations only, not launch breadth. Phase 3 defines meal options and scenario sufficiency before planner usefulness is claimed.

## 8. Primary Implementation References

- Approved design Sections 7–14 and 17–20.
- `AGENTS.md`, approved Phase 0 plan, approved Phase 1 plan, and exact Phase 1 implementation/CI.
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase database testing](https://supabase.com/docs/guides/local-development/testing/overview)
- [Supabase TypeScript generation](https://supabase.com/docs/guides/api/rest/generating-types)
- [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [PostgreSQL triggers](https://www.postgresql.org/docs/current/trigger-definition.html)
- [PostgreSQL function security](https://www.postgresql.org/docs/current/perm-functions.html)
