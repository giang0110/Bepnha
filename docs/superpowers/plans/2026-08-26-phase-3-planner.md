# Phase 3 Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add curated immutable meal options and an authoritative deterministic seven-primary-meal planner with exact package-rounded weekly budget selection, immutable plan revisions, and single-day replacement, without implementing Phase 4 shopping-list behavior.

**Architecture:** Extend the modular monolith with pure TypeScript meal-option, basket-cost, eligibility, scoring, bounded-search, replacement, and snapshot modules. Thin application use cases load authoritative household/catalog inputs through ports, execute the domain, and persist complete immutable revisions through one restricted transactional PostgreSQL RPC. Supabase owns catalog/version integrity, plan ownership, immutable history, grants, and RLS; trusted Vercel Functions verify the user and never accept client-authored calculations.

**Tech Stack:** Node 24, strict TypeScript, Decimal.js, React/Vite, Vitest/React Testing Library, Supabase/PostgreSQL migrations and pgTAP, Supabase JS, Vercel Functions, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-25-bep-nha-design.md`

## Global Constraints

- Work only on `codex/phase-3-planner`. Do not merge `main`, deploy, link Supabase/Vercel, run production migrations, or mutate production data.
- Exact approved Phase 2 HEAD `7cf00d2beb6c7db09174a9944709d15617c953c1` must remain an ancestor of every Phase 3 implementation commit. Never recreate Phase 0–2 files manually.
- Plan exactly seven Monday-start `primary` cooked family meals, one per day. The household budget applies only to these seven meals. Do not add breakfast, lunch, snacks, or drinks.
- Select only curated published meal-option versions. Never compose arbitrary recipe combinations and never generate recipes.
- Domain modules remain framework-independent and deterministic. They do not import React, Supabase, Vercel, browser APIs, environment variables, Node clocks, or random sources.
- Authoritative quantities, nutrition, allergen safety, eligibility, scoring, prices, basket totals, and fingerprints are server-calculated from structured data. The browser supplies only intent/references and optimistic tokens.
- Missing or unknown allergen, category, conversion, six-launch-nutrient, recipe, meal-option, or price lineage never becomes eligible and never becomes numeric zero/default.
- Use exact Decimal arithmetic for quantities and package rounding. VND inputs/outputs are safe integers. Canonical ordering and stable IDs resolve every tie.
- Use TDD for domain/planner behavior. Write pgTAP expectations before migration implementation when local Docker is available. Without Docker, record the database gate as pending exact-HEAD CI; do not claim local RED/GREEN.
- Local Docker absence does not block non-database work. Database/RLS/generated-type/integration verification must pass locally or in GitHub Actions for the exact final pushed HEAD. Never use a remote Supabase database as a substitute.
- Each implementation task ends with focused verification, `git diff --check`, status inspection, and one task-only conventional commit. Never weaken validation, constraints, grants, RLS, or tests to obtain a pass.
- Explicitly defer persisted/user-facing shopping lists, grocery grouping/checkoff state, pantry deduction, marketplace/delivery/payment, AI, ML, medical claims, and every Phase 4+ behavior.

---

## 0. Approved Base and Branch Prerequisite

### 0.1 Plan-writing evidence

At plan-writing time:

- branch is `codex/phase-3-planner`;
- `HEAD` is exactly `7cf00d2beb6c7db09174a9944709d15617c953c1`;
- `git merge-base --is-ancestor 7cf00d2... HEAD` succeeds;
- the working tree was clean before this plan;
- approved Phase 2 exact-HEAD evidence is [CI run 32956327144](https://github.com/ntgiang1235-ux/Bepnha/actions/runs/32956327144), where both `web` and `database` passed.

The plan branch descends directly from approved Phase 2, so no integration merge is needed now.

### 0.2 Mandatory implementation-start check

Before Gate 0 or Task 1:

```powershell
$phase2Head = "7cf00d2beb6c7db09174a9944709d15617c953c1"
git switch codex/phase-3-planner
git status --short --branch
git cat-file -e "$phase2Head^{commit}"
if ($LASTEXITCODE -ne 0) { throw "PHASE_3_BLOCKED_APPROVED_PHASE_2_HEAD_MISSING" }
git merge-base --is-ancestor $phase2Head HEAD
if ($LASTEXITCODE -ne 0) { throw "PHASE_3_BLOCKED_PHASE_2_NOT_IN_ANCESTRY" }
```

If ancestry fails in a future environment, stop Phase 3 tasks. With a clean tree, fetch only the approved Phase 2 branch, verify that its remote HEAD equals the approved SHA, and merge the exact SHA as a separate prerequisite commit:

```powershell
git fetch origin codex/phase-2-food-recipe
if ((git rev-parse origin/codex/phase-2-food-recipe) -ne $phase2Head) {
  throw "PHASE_3_BLOCKED_REMOTE_PHASE_2_HEAD_MISMATCH"
}
git merge --no-ff --no-edit $phase2Head
git merge-base --is-ancestor $phase2Head HEAD
```

Run inherited Phase 2 non-database verification, push the integration commit, and require exact-integration-HEAD `web` and `database` CI success before Task 1. Never merge `main` or reconstruct prior-phase files to resolve the prerequisite.

---

## 1. Fixed Phase 3 Domain Contracts

### 1.1 Planning unit, dates, and authoritative intent

`PlannerInputV1` contains exactly:

- `plannerInputVersion: "planner-input-v1"`;
- explicit ISO `weekStart` that is a Monday;
- explicit ISO `calculationDate`;
- household time zone, exactly the persisted supported `Asia/Ho_Chi_Minh` value for MVP;
- seven ordered slots `{ dayIndex: 0..6, mealSlot: "primary" }`;
- normalized member groups and household adult-equivalent demand;
- weekly seven-meal budget, maximum meal-option elapsed minutes, hard rule codes, and soft preference codes;
- full `PortionConfigV1`, `PriceFreshnessConfigV1`, and `PlannerConfigV1` values and versions;
- one exact published price-book ID/version/content hash and exact price records;
- a canonical manifest of every meal-option version considered, with stable meal-option ID, exact version/hash, exact component recipe versions/hashes, and all pinned fact/price lineage needed by the domain.

The server derives all fields from the owned household and database catalog. It accepts `weekStart` and idempotency/replacement intent from the browser, derives `calculationDate` once at the HTTP edge, and passes it explicitly. No domain function reads the wall clock.

Canonical normalization:

1. validate household/member/rule/date/config bounds;
2. split hard and soft rules using the Phase 1 canonical vocabulary;
3. sort member groups by the existing portion-band order;
4. sort rule codes, prices, candidate options, recipes, ingredients, facts, nutrients, assessments, categories, and tags by stable keys;
5. reject duplicate stable keys rather than silently choosing one;
6. serialize exact Decimal values with `decimalToCanonical`;
7. retain ordered semantic arrays only for days, recipe/component order, and ingredient order.

### 1.2 Curated meal-option identity and immutable versions

`meal_options` is a stable editorial identity and default-discovery pointer. `meal_option_versions` is the immutable calculation identity.

Each version stores:

- positive `version_number` and optimistic draft `revision`;
- positive exact `yield_adult_equivalent`;
- positive `active_minutes` and editorially validated `elapsed_minutes` where `elapsed >= active` and `elapsed <= 180`;
- draft/published lifecycle fields, lowercase SHA-256 `content_hash`, creator, and timestamps;
- one or more exact component recipe versions in `meal_option_recipes`;
- exactly one controlled `protein_hint` tag and at least one controlled `cooking_style` tag in `meal_option_version_tags`;
- component `meal_role` values from `staple|main|vegetable|soup|side`, including at least one `main`.

Each component row pins both stable `recipe_id` and exact `recipe_version_id`, has a positive Decimal `quantity_multiplier`, and a unique positive `sort_order`. A composite FK proves the version belongs to the stable recipe. For every component:

```text
recipeVersion.yieldAdultEquivalent × quantityMultiplier
== mealOptionVersion.yieldAdultEquivalent
```

This exact equality reconciles component batches. Scaling uses the meal-level scale once:

```text
mealScale = householdAdultEquivalent / mealOptionYield
recipeScale = mealScale × component.quantityMultiplier
```

`elapsed_minutes` is an independent editorial measurement for the complete meal option. Publication and filtering must never derive it by summing component recipe times.

Publication requires every component recipe version to be published, immutable, complete, and readable by exact ID. It derives structured allergen/category/dietary closure, six-nutrient coverage, conversions, stable foods, main recipe IDs, roles, and price requirements only from pinned structured recipe ingredients. Tags are ranking metadata and can never override derived safety. Published rows and children are immutable; corrections create a new version. Moving a recipe or meal-option current pointer never rewrites an existing version or plan.

### 1.3 Minimal shared purchase-basket costing primitive

Phase 2 proportional recipe consumption cost remains available for recipe display/diagnostics but is not authoritative for the weekly plan budget. Phase 3 adds exactly one shared primitive:

```typescript
calculatePurchaseBasket(
  requirements: readonly CanonicalFoodRequirement[],
  prices: readonly FoodPriceInput[],
  calculationDate: string,
  freshnessConfig: PriceFreshnessConfigV1
): PurchaseBasketResult
```

The primitive:

1. canonicalizes and aggregates unrounded requirements by stable `foodId` and permanent `baseUnitId` across all seven selected meal options;
2. requires exactly one compatible price per required food and rejects extra/duplicate/mismatched prices;
3. applies the Phase 2 freshness classifier: ages 0–30 current, 31–90 stale-but-usable with warning, and >90/future/missing unusable/fatal;
4. validates positive package base quantity, positive whole-package purchase increment, and positive safe-integer VND price;
5. calculates with Decimal:

   ```text
   purchasePackageCount =
     ceil((requiredBaseQuantity / packageBaseQuantity) / purchaseIncrement)
     × purchaseIncrement

   purchaseBaseQuantity = purchasePackageCount × packageBaseQuantity
   lineCostVnd = purchasePackageCount × packagePriceVnd
   ```

6. returns lines sorted by `foodId`, exact required/package/purchase/leftover base quantities, exact price/fact/book IDs, freshness evidence, integer line cost, and the integer total;
7. fails the whole result on any unusable line; no partial ready-plan total exists.

The Phase 3 migration adds an integer-valued check to `food_prices.purchase_increment`, matching the approved schema semantics. No historical published value is rewritten. The primitive has no pantry input, categories, source-item IDs, check state, grocery labels, persistence table, or UI. Phase 4 must import this primitive and consume the persisted basket snapshot; it must not implement package rounding independently.

For every ready plan and its current immutable revision:

```text
meal_plans.total_estimated_cost_vnd
== current meal_plan_revisions.total_estimated_cost_vnd
== sum(calculation_snapshot.purchaseBasket.lines[*].lineCostVnd)
== calculation_snapshot.purchaseBasket.totalEstimatedCostVnd
```

When Phase 4 creates a shopping list, the same primitive/snapshot must establish:

```text
meal_plans.total_estimated_cost_vnd
== current meal_plan_revisions.total_estimated_cost_vnd
== shopping_lists.estimated_purchase_cost_vnd
```

The future shopping list must pin the same `meal_plan_revision_id` and calculation fingerprint that `meal_plans.current_revision_id` identifies; replacement requires a newly reconciled Phase 4 list rather than mutation of historical evidence.

### 1.4 Eligibility pipeline before scoring

Eligibility is a pure, ordered pipeline. A candidate cannot be scored or enter search until every stage succeeds:

1. **Publication validity:** meal-option identity is discoverable/non-retired; exact meal-option version, component recipe versions, facts, and selected exact price book are published; hashes are valid.
2. **Exact lineage completeness:** component rows pin same-recipe versions; ingredients pin same-food facts; complete supported allergen assessments/category ancestry/dietary facts exist. Unknown allergen/category lineage fails closed.
3. **Hard household rules:** run the existing deterministic hard-rule evaluator over every structured ingredient. `contains` and `may_contain` exclude. Unknown mapping or `allergen_other` returns `UNSUPPORTED_HARD_RULE`; soft preferences are ignored here.
4. **Cooking-time limit:** editorial meal-option `elapsedMinutes <= household.maxElapsedMinutes`. Recipe time remains validation/display data and is not summed.
5. **Price usability:** every stable food required by the household-scaled option has a compatible current or stale-but-usable exact price. Stale succeeds with warning; missing, >90-day, future, duplicate, or mismatched price is unusable.
6. **Nutrition/conversion completeness:** household scaling and each pinned conversion succeed; all six launch nutrients have 100% explicit coverage. Missing rows are not zero.
7. **Meal-option structure:** reconciled yields, at least one main component, exactly one protein hint, at least one cooking style, unique ordered component rows, and valid role metadata.

`evaluateMealOptionEligibility` returns either a normalized eligible candidate with scaled ingredients/nutrition/basket contribution/metadata/warnings, or a typed rejection with stage, stable entity ID, and code. Rejections are sorted and counted for deterministic diagnostics.

Before the candidate loop, any unsupported household hard rule is a request-level fatal failure. If the fully enumerated exact catalog snapshot yields zero eligible candidates, return a precise fatal result:

- `INCOMPLETE_CATALOG_LINEAGE` when no otherwise applicable candidate has complete safety/conversion/nutrition structure;
- `NO_USABLE_PRICE` when candidates pass safety/time/structure but none has complete usable prices;
- `HARD_FILTER_EXHAUSTED` when the exact loaded candidate snapshot is completely assessed and every candidate is excluded by publication, household hard rules, time, or structural constraints.

`HARD_FILTER_EXHAUSTED` means only that no candidate in the named exact catalog snapshot passed the deterministic hard filters. It does not claim that no future catalog or global meal plan can exist.

### 1.5 PlannerConfigV1 and hard weekly constraints

Use one immutable code-versioned configuration copied verbatim into input snapshots:

```typescript
export const PLANNER_CONFIG_V1 = {
  version: "planner-v1",
  dayCount: 7,
  mealSlot: "primary",
  candidateLimit: 500,
  frontier: {
    maxSize: 250,
    qualitySize: 125,
    costSize: 125
  },
  hard: {
    maxSameMealOptionIdentity: 1,
    disallowAdjacentSharedMainRecipe: true
  },
  scoringWeights: {
    diversity: 3500,
    nutritionComposition: 2500,
    ingredientReuseAndLeftover: 2500,
    preferences: 1500
  },
  diversityWeights: {
    primaryProteinRepetition: 1500,
    primaryCookingStyleVariety: 1000,
    adjacentPrimaryProteinReuse: 1000
  },
  ignoredReuseCategoryCodes: ["staple", "seasoning"]
} as const
```

If more than `candidateLimit` complete discovered meal options exist, return `CATALOG_CANDIDATE_LIMIT_EXCEEDED`; never truncate silently. Changing any threshold, score formula, frontier allocation, or tie-break requires a new planner/config version and golden review.

Hard weekly constraints remain minimal and transparent:

- exactly seven distinct day indexes 0–6, all `primary`;
- a stable meal-option identity occurs at most once, so two versions of the same editorial meal cannot evade repetition;
- adjacent days cannot share the same exact main recipe version;
- locked replacement days remain at their original indexes;
- every selected option passed all candidate eligibility stages.

Repeating a primary-protein group never makes an otherwise eligible weekly plan invalid. Protein repetition, vegetable/soup/style diversity, and preferences are soft score inputs. Budget is a separate final partition/ranking rule and is neither an eligibility constraint nor part of the quality score.

### 1.6 Deterministic quality score

Lower integer penalty is better. Budget is never included in this score. Define `scaledPenalty(weight, numerator, denominator)` as clamped `ROUND_HALF_UP(weight × numerator / denominator)`.

`scoreWeeklyPlan` returns component penalties, raw metrics, fixed explanation codes, and `totalQualityPenalty` from 0–10,000:

1. **Diversity, 3,500:**
   - 1,500 × repeated primary-protein occurrences / 6, where `repeatedPrimaryProteinOccurrences = 7 - distinctPrimaryProteinGroupCount`; each additional repeated occurrence strictly increases this component and no value rejects a plan;
   - 1,000 × `(7 - distinctPrimaryCookingStyleCount) / 6`;
   - 1,000 × adjacent same-primary-protein count / 6.
2. **Nutrition composition, 2,500:** exact approved formula `2,500 × missingRoleAssignments / 21`, where each day is assessed for staple, main, and vegetable-or-soup. This is a food-group composition heuristic, not nutrient adequacy or a health claim.
3. **Ingredient reuse and package leftover, 2,500:**
   - 1,000 × `(eligibleDistinctFoodCount - reusedDistinctFoodCount) / eligibleDistinctFoodCount`, where reuse means the same stable food appears on at least two days and foods under `staple`/`seasoning` roots are ignored; if no eligible food exists, use the full 1,000 penalty;
   - 1,500 × the mean per-line leftover ratio `(purchaseBaseQuantity - requiredBaseQuantity) / purchaseBaseQuantity` from the shared basket result. Ratios are averaged per stable food; quantities of different dimensions are never added.
4. **Soft preferences, 1,500:** if no soft preference is selected, penalty is zero. Otherwise calculate unmatched `(preference, day)` assignments over `selectedPreferenceCount × 7`. Protein/category preferences match ingredient category ancestry; `prefer_vegetable_forward` matches a vegetable role; `prefer_soup` matches a soup role.

The current household model has only a hard maximum elapsed time and no separate soft cooking-time preference. Phase 3 therefore adds no invented quick-cooking score. A future distinct preference requires a household schema/design change and new planner config.

Soft scores never override hard eligibility. Exact basket cost is a final tie-break only for equal-quality within-budget plans; stable ordered meal-option-version IDs are the final tie-break.

### 1.7 Bounded deterministic search and frontier construction

Search is intentionally incomplete and contains no randomness or general solver.

```text
eligible = canonicalSort(all candidates by mealOptionVersionId)
frontier = [empty state]

for dayIndex in 0..6:
  expanded = []
  for state in canonicalSort(frontier by stable selected-ID sequence):
    for candidate in eligible:
      next = append candidate to dayIndex
      if next violates duplicate identity, adjacent-main rule,
         or locked-slot rule:
        continue
      next.partialBasket = calculatePurchaseBasket(next.requirements)
      next.qualityLowerBound = deterministic optimistic final penalty
      expanded.add(next)

  qualityFrontier = first 125 expanded ordered by:
    qualityLowerBound, partial exact basket cost, stable ID sequence

  costFrontier = first 125 expanded ordered by:
    partial exact basket cost, qualityLowerBound, stable ID sequence

  frontier = stable union(qualityFrontier, costFrontier)
  deduplicate by ordered stable meal-option-version ID sequence
  assert frontier.size <= 250

complete = states at depth 7
for each complete state:
  recompute exact whole-week basket from all unrounded requirements
  recompute exact whole-week quality metrics
apply budget partition and final lexicographic ranking
```

Partial basket cost is monotonic because pantry is absent and requirements only increase. Recomputing complete states prevents incremental-cache drift. Query order, object insertion order, and input array order cannot affect results.

The quality lower bound must never overstate the best possible final quality of a partial state. For protein repetition it uses only `assignedDayCount - distinctAssignedPrimaryProteinGroupCount`, normalized against the complete-week maximum of six; adding a new protein group leaves that committed repetition count unchanged, while adding an already-used group increases it, so later days cannot repair it. The bound also includes adjacent-same-protein edges already created, missing composition roles on assigned days, and unmatched preference/day assignments already fixed. Cooking-style repetition assumes every remaining day can add a new style; ingredient-reuse and leftover lower bounds are zero because later requirements may improve them. The exact complete score is always recomputed at depth seven.

If eligible candidates exist but the bounded frontier yields no complete state, return fatal `NO_COMPLETE_PLAN_FOUND_IN_DETERMINISTIC_SEARCH` with message key equivalent to “Không tìm thấy thực đơn hoàn chỉnh trong phạm vi tìm kiếm xác định.” Never return “no valid plan exists” or imply a proof of global infeasibility.

### 1.8 Budget partition and typed result model

Final ranking applies only to complete discovered plans:

```text
withinBudget = complete where exactBasketCost <= budgetVnd

if withinBudget is non-empty:
  discard every over-budget complete plan
  choose min by qualityPenalty, exactBasketCost, stable ID sequence
else:
  choose min from complete by exactBasketCost, qualityPenalty, stable ID sequence
```

A more expensive over-budget plan can never beat a cheaper one, regardless of quality. Any discovered within-budget plan beats every over-budget plan.

Successful outcomes are structurally separate from failures:

```typescript
type PlannerSuccess =
  | { status: "ready_within_budget"; plan: ReadyPlan; warnings: PlannerWarning[] }
  | { status: "ready_over_budget"; plan: ReadyPlan; warnings: PlannerWarning[] }

type PlannerWarning =
  | { code: "STALE_PRICE"; foodId: string; foodPriceId: string; observedAt: string; ageDays: number }
  | {
      code: "PLAN_OVER_BUDGET"
      budgetVnd: number
      estimatedPlanCostVnd: number
      overageVnd: number
    }
  | { code: "NO_UNDER_BUDGET_PLAN_FOUND_IN_DETERMINISTIC_SEARCH" }

type PlannerFatalCode =
  | "INVALID_PLANNER_INPUT"
  | "UNSUPPORTED_HARD_RULE"
  | "INCOMPLETE_CATALOG_LINEAGE"
  | "NO_USABLE_PRICE"
  | "HARD_FILTER_EXHAUSTED"
  | "CATALOG_CANDIDATE_LIMIT_EXCEEDED"
  | "NO_COMPLETE_PLAN_FOUND_IN_DETERMINISTIC_SEARCH"
  | "REPLACEMENT_UNAVAILABLE_WITHIN_DETERMINISTIC_SEARCH"
  | "PLAN_INPUT_CHANGED_REGENERATION_REQUIRED"
  | "STALE_PLAN_VERSION"
  | "UNAUTHORIZED"
  | "TRANSIENT_DEPENDENCY_FAILURE"
```

`ready_over_budget` includes both `PLAN_OVER_BUDGET` with exact integers and `NO_UNDER_BUDGET_PLAN_FOUND_IN_DETERMINISTIC_SEARCH`. It is a successful ready plan, not a fatal generation failure. Stale prices are successful warnings only. Too-old, missing, or future prices are fatal/ineligible.

### 1.9 Deterministic one-day replacement

Replacement takes an immutable current plan revision, `targetDayIndex`, expected plan version/current revision, the original exact price book/config/date, and a newly loaded canonical manifest of currently discoverable meal-option versions. If household setup version or stored household-intent fingerprint no longer matches the current household, return `PLAN_INPUT_CHANGED_REGENERATION_REQUIRED`; the user must regenerate rather than silently apply changed rules to only one slot.

Algorithm:

1. lock the six non-target day items and preserve their day indexes and exact meal-option-version IDs;
2. exclude the target's current stable meal-option identity/version;
3. evaluate candidate eligibility using the same exact historical price book, calculation date, and configs as the current revision, but only meal-option versions currently discoverable at preview time; the six locked options remain valid exact historical references even if no longer current;
4. reject candidates only when they violate hard eligibility, stable meal-option identity duplication, adjacent exact-main-recipe duplication, or the locked-slot rule; primary-protein repetition is never a rejection and contributes only to the recomputed diversity penalty;
5. recompute the full seven-day shared basket and quality score for every surviving replacement candidate;
6. if any candidate yields an under-budget complete week, discard all over-budget candidates and rank by quality, cost, stable ID;
7. otherwise rank by minimum exact weekly basket cost, then quality, then stable ID;
8. return one deterministic preview with `weeklyEstimatedCostVnd`, signed integer `weeklyCostDeltaVnd`, budget status/warnings, and a preview calculation fingerprint;
9. apply reloads all authoritative inputs and recomputes; it persists only if plan version/current revision and preview fingerprint—including the newly captured replacement candidate manifest—still match.

Replacement creates a new immutable full seven-item revision whose input snapshot records the replacement candidate manifest. It never updates historical item rows or reorders other days. Tests compare all six locked `(dayIndex, mealOptionId, mealOptionVersionId)` tuples byte-for-byte. Moving a current pointer may change a future preview, but it cannot alter an already persisted revision or replay. If no candidate survives, return `REPLACEMENT_UNAVAILABLE_WITHIN_DETERMINISTIC_SEARCH` without claiming global impossibility.

### 1.10 Fingerprints and immutable snapshot contracts

Use the existing canonical JSON and shared SHA-256 port. Move the generic `ContentHasher` interface from the catalog-specific path to `src/application/shared/content-hasher.ts`; update Phase 2 imports without behavioral change.

- `catalogFingerprint`: SHA-256 over the sorted candidate manifest and exact immutable content hashes for meal-option versions, component recipe versions, pinned food facts, and exact selected price book/prices. Mutable current pointers and retirement/discovery fields are excluded.
- `inputFingerprint`: SHA-256 over normalized household intent, member groups/rules, week/calculation date/time zone, full code-versioned configs, and catalog fingerprint.
- `calculationFingerprint`: SHA-256 over the canonical ready result: seven ordered exact version IDs/item snapshots, exact basket snapshot, scores/explanations, warnings, budget totals, and parent/replacement metadata.

`input_snapshot` stores normalized household/config/date values plus the exact candidate manifest. Exact published records remain readable by ID for replay. `calculation_snapshot` stores:

- seven ordered scaled meal outputs;
- exact meal-option/recipe/fact/food/price IDs and content hashes;
- unrounded canonical ingredient requirements and nutrition totals;
- basket lines produced by the shared primitive;
- scoring raw metrics/component penalties/explanation codes;
- warnings, exact budget/overage, search configuration, and outcome.

Changing a current food fact, recipe version, meal-option version, or price-book discovery pointer cannot modify these rows, fingerprints, or exact-ID replay. Retiring historical catalog identities removes default discovery only.

---

## 2. Database Schema, Integrity, RLS, and Grants

### 2.1 Migration and tables

Create `supabase/migrations/20260826020000_phase_3_planner.sql` with:

#### Curated meal-option catalog

- `meal_options`: `id`, stable `code`, bounded `name_vi`, `status`, optimistic `revision`, nullable `current_version_id`, nullable `retired_at`, timestamps, and lifecycle consistency checks.
- `meal_option_versions`: `id`, `meal_option_id`, positive `version_number/revision`, exact positive `yield_adult_equivalent`, active/editorial elapsed minutes, draft/published lifecycle/hash/creator/timestamps, unique `(meal_option_id,version_number)` and `(meal_option_id,id)`, and one draft per identity.
- `meal_option_recipes`: exact `meal_option_version_id`, stable `recipe_id`, exact `recipe_version_id`, positive `quantity_multiplier`, role enum, order, composite same-recipe FK, unique version/recipe and version/order.
- `meal_option_version_tags`: exact meal-option version and existing controlled `recipe_tag_id`, with composite primary key.
- composite current-version FK `(meal_options.id,current_version_id) -> meal_option_versions(meal_option_id,id)`.

Triggers/RPCs follow Phase 2 patterns:

- semantic identity locks after first version;
- draft revision bump on authoritative payload changes;
- published parent/children immutable even through service-role direct writes;
- tag-kind/yield/role/component/lineage completeness validation;
- private trusted transition context;
- atomic `publish_meal_option_version` that locks, validates, stores server-computed hash, moves the pointer, and appends audit;
- retirement removes identity from discovery but preserves exact published history;
- `get_meal_option_aggregate_for_publication` for server reload/hash;
- authenticated exact published reads plus current-only discovery; drafts remain hidden.

#### Immutable plans

- `meal_plans`: stable `id`, owned `household_id`, Monday `week_start`, copied `timezone`, `status ready|archived`, optimistic `version`, exact `current_revision_id`, current `calculation_fingerprint`, integer `total_estimated_cost_vnd`, current `budget_status`, timestamps, and unique `(household_id,week_start)`.
- `meal_plan_revisions`: `id`, `meal_plan_id`, positive `revision_number`, nullable `parent_revision_id`, `revision_kind generation|regeneration|replacement`, nullable `replaced_day_index`, UUID `idempotency_key`, household setup version, engine/config versions, calculation date, fingerprints, typed JSONB input/calculation snapshots, integer budget/total/overage, `budget_status within|over`, warnings JSONB, `state building|ready`, `sealed_at`, timestamps, unique `(meal_plan_id,revision_number)` and `(meal_plan_id,idempotency_key)`.
- `meal_plan_items`: `id`, `meal_plan_revision_id`, `day_index 0..6`, fixed `meal_slot='primary'`, stable `meal_option_id`, exact `meal_option_version_id`, positive adult-equivalent/scale Decimal strings represented as constrained numeric, immutable calculation snapshot, timestamp, unique revision/day/slot, and composite same-option-version FK.

`meal_plan_revisions` is built only inside one transaction. A trusted `building -> ready` transition validates:

- exact day count seven;
- distinct complete indexes 0–6 and only `primary`;
- item meal-option IDs/version IDs match the authoritative calculation snapshot;
- replacement parent belongs to the same plan, revision number increments by one, and exactly the requested day differs;
- non-replacement generation has no replacement fields;
- stored budget/total/overage/status/warnings are internally consistent;
- every basket line uses an exact published price and integer package count/increment; line costs sum to both snapshot total and revision total;
- fingerprints are lowercase SHA-256 strings;
- time zone/week start match the household/plan.

After sealing, revision/item/snapshot rows reject update/delete/late insert. Account/household cascade deletion remains possible through an explicit trusted deletion context; routine planner/admin paths cannot use it.

`persist_meal_plan_revision(...)` is `security definer`, executable only by `service_role`, validates the verified actor owns the household, locks the stable plan, checks expected plan version/current revision, handles idempotency, inserts seven items, seals the revision, and atomically advances `meal_plans.current_revision_id/version` plus its mirrored calculation fingerprint, total, and budget status. A constraint trigger validates that the stable-plan summary equals its current revision and basket snapshot. Any failed assertion rolls back the plan, revision, items, pointer, and audit effects.

### 2.2 Read/load functions

- `get_planner_generation_input(household_id, week_start, calculation_date)` is callable by `authenticated`, uses verified `auth.uid()` ownership, and returns only the household's normalized setup plus current published meal-option/recipe/fact and current published non-retired price-book records. It never accepts owner ID or computed totals.
- `get_plan_replacement_input(plan_id)` is callable by `authenticated`, checks ownership, and returns the current immutable revision, exact historical locked-item/price records by pinned IDs, plus the currently discoverable meal-option candidate manifest. It never substitutes current pointers into the six locked items or original price book.
- normal owned plan/revision/item reads use RLS and may expose only the caller's household rows.

### 2.3 RLS and grants

- Enable RLS on all new exposed tables.
- `anon` receives no access.
- `authenticated` can select discoverable published meal-option records and exact published versions required for historical reads, but cannot see drafts/audit.
- `authenticated` can select only its own `meal_plans`, `meal_plan_revisions`, and `meal_plan_items` through household ownership joins.
- Browser roles receive no insert/update/delete grants or policies for plans/revisions/items and no execute grant on persistence/publication RPCs.
- Meal-option draft writes use the existing signed-admin server boundary with narrow `service_role` column/table grants; triggers still protect published data.
- The plan server secret is created only after bearer-token verification and is used only for the restricted persistence RPC. No service-role secret enters browser code or `VITE_*`.
- Revoke default/public function execution, grant only named roles, set explicit empty search paths, schema-qualify objects, and add cross-user negative tests for select/mutation/function calls.

Direct Data API writes therefore cannot create partial seven-day plans, mutate history, swap ownership/version references, change totals, or bypass replacement invariants.

---

## 3. Typed Application, Server, and Browser Boundaries

### 3.1 Application ports and use cases

`PlannerRepository` owns:

```typescript
loadGenerationInput(request): Promise<PlannerLoadResult>
loadReplacementInput(request): Promise<PlannerLoadResult>
persistReadyRevision(command): Promise<PlanPersistenceResult>
loadCurrentPlan(householdId, weekStart): Promise<PlanReadResult>
```

Use cases:

- `generateMealPlan`: validate request, load authoritative input, normalize/hash, run eligibility/search, build immutable snapshot, persist only successful ready output, and return sanitized tagged union.
- `previewMealReplacement`: load exact current revision, verify household setup/input consistency, run deterministic one-day replacement, and return preview without database mutation.
- `applyMealReplacement`: reload/recompute preview, require expected version/current revision/fingerprint, and persist one new immutable revision.
- `loadMealPlan`: return owned current revision for browser display; it performs no recalculation.

Fatal domain failures create no plan rows. Repository/dependency failures map to sanitized application codes and correlation IDs at HTTP edge; raw SQL/catalog internals are not exposed.

### 3.2 HTTP contracts

Create thin dependency-injected handlers:

- `POST /api/plans/generate` body: `{ householdId, weekStart, idempotencyKey }`.
- `POST /api/plans/replacements-preview` body: `{ planId, targetDayIndex, expectedPlanVersion }`.
- `POST /api/plans/replacements-apply` body: `{ planId, targetDayIndex, expectedPlanVersion, expectedCurrentRevisionId, previewCalculationFingerprint, idempotencyKey }`.
- `POST /api/admin/meal-options` uses a closed action union for create/save-draft/publish/retire only.

All bodies reject unknown keys, computed totals, scaled ingredients, nutrition, eligibility, scores, catalog hashes, and selected authoritative IDs other than allowed plan/household references and optimistic tokens. The server verifies the Supabase bearer token, derives user ID from `getUser`, loads every authoritative input from the database, applies request-size/range bounds, and sets the explicit calculation date once.

The browser never chooses a hidden candidate or submits a price/score. Replacement preview returns the single deterministic best candidate; apply recomputes it.

### 3.3 Minimal Phase 3 user interface

Add only the planner surface required for Phase 3:

- authenticated `/plan` route with Monday week label and one generation action;
- seven mobile-first day cards ordered 0–6;
- plan total versus the clearly labeled “7 bữa chính” budget;
- exact overage/remaining amount and predefined warning copy;
- meal-option detail showing component recipe names, scaled structured ingredients, estimated nutrition, and existing ordered recipe instructions;
- one-day replacement preview/apply/cancel with exact weekly cost delta;
- typed empty/loading/failure states using precise bounded-search language.

No shopping-list/package line UI, grocery categories, checkboxes, pantry, admin UI, or medical/“allergy safe” language is added. Basket lines remain authoritative internal snapshot data for cost/replay only.

---

## 4. Target File Map

### Pure domain

- Create `src/domain/pricing/calculate-purchase-basket.ts` and test — the sole package-rounded basket primitive.
- Modify `src/domain/pricing/pricing.ts` — shared requirement/price/basket types including purchase increment.
- Create `src/domain/meal-option/meal-option.ts` — immutable meal-option input/normalized types.
- Create `src/domain/meal-option/validate-meal-option.ts` and test — publication/structure/yield/metadata rules.
- Create `src/domain/meal-option/scale-meal-option.ts` and test — compose existing recipe scaling without arbitrary dish composition.
- Create `src/domain/planner/planner-config.ts` — frozen `PlannerConfigV1`.
- Create `src/domain/planner/planner-input.ts` and test — normalized canonical input/manifest.
- Create `src/domain/planner/evaluate-eligibility.ts` and test — ordered fail-closed pipeline and diagnostics.
- Create `src/domain/planner/score-week.ts` and test — exact integer quality components.
- Create `src/domain/planner/search-week.ts` and test — 125/125 frontier and budget selection.
- Create `src/domain/planner/replace-meal.ts` and test — one-slot replacement.
- Create `src/domain/planner/planner-outcome.ts` — warning/fatal tagged unions.
- Create `src/domain/planner/planner-snapshot.ts` and test — canonical manifests/results/fingerprint payloads.

### Application

- Move `src/application/catalog/content-hasher.ts` to `src/application/shared/content-hasher.ts`; modify imports/tests only.
- Create `src/application/meal-option/meal-option-admin-command.ts`, repository/use-case files, and tests.
- Create `src/application/planner/planner-repository.ts`.
- Create `src/application/planner/generate-meal-plan.ts` and test.
- Create `src/application/planner/preview-meal-replacement.ts` and test.
- Create `src/application/planner/apply-meal-replacement.ts` and test.
- Create `src/application/planner/load-meal-plan.ts` and test.

### Infrastructure and API

- Create `src/infrastructure/server/supabase-meal-option-admin-repository.ts` and test.
- Create `src/infrastructure/server/supabase-planner-repository.ts` and test.
- Create `src/infrastructure/supabase/supabase-meal-plan-read-repository.ts` and test.
- Modify `src/infrastructure/supabase/database.types.ts` only through local/CI generation.
- Create `api/admin/meal-options.ts` and test.
- Create `api/plans/generate.ts`, `replacements-preview.ts`, `replacements-apply.ts` and tests.
- Modify `tsconfig.api.json`, `tsconfig.integration.json`, and architecture lint expectations for the new boundaries.

### Database/tests/CI

- Create `supabase/migrations/20260826020000_phase_3_planner.sql`.
- Create `supabase/tests/database/phase_3_meal_option_schema.test.sql`.
- Create `supabase/tests/database/phase_3_meal_option_integrity.test.sql`.
- Create `supabase/tests/database/phase_3_planner_rls.test.sql`.
- Create `supabase/tests/database/phase_3_plan_persistence.test.sql`.
- Create `tests/integration/supabase-planner.integration.test.ts`.
- Create `tests/integration/planner-api.integration.test.ts`.
- Modify `package.json`, `.github/workflows/ci.yml`, and integration configs.
- Create `scripts/benchmark-planner.mjs` and deterministic fixture/test support.

### UI

- Create `src/features/plans/plan-page.tsx` and component test.
- Create `src/features/plans/plan-day-card.tsx` and component test.
- Create `src/features/plans/meal-option-detail.tsx` and component test.
- Create `src/features/plans/replacement-dialog.tsx` and component test.
- Create `src/features/plans/plan-api.ts` and test.
- Modify `src/app/router.tsx` and route tests.
- Create `tests/planner.spec.ts`.
- Modify `README.md` with local planner verification and Phase 4 boundary.

---

## 5. Ordered Implementation Tasks

### Gate 0: Reconfirm approved base, runtime, regressions, and DB capability

**TDD:** No; mandatory precondition.

**Files:** None.

- [ ] Run the Section 0 ancestry check. Stop with `PHASE_3_BLOCKED` if it fails.
- [ ] Confirm Node 24/npm and clean install:

  ```powershell
  node --version
  npm --version
  npm ci
  ```

- [ ] Run inherited non-database regression:

  ```powershell
  npm run env:check
  npm run secrets:check
  npm run format:check
  npm run lint
  npm run typecheck
  npm run test:coverage
  npm run build
  npm run test:e2e
  ```

- [ ] Detect local database capability:

  ```powershell
  npm run preflight
  ```

  Record `LOCAL_DB_VERIFICATION_AVAILABLE` or `LOCAL_DB_VERIFICATION_UNAVAILABLE`. Continue non-database work in either case. Without local capability, record `DATABASE_RLS_GATE_PENDING_CI`.

- [ ] If local DB is available, run the inherited reset/lint/pgTAP/type/public/admin/onboarding suite and stop Supabase. Never use `--linked` or a hosted URL.

**Safety:** Gate 0 changes no files and performs no production/network deployment mutation.

### Task 1: Add the shared package-rounded purchase-basket primitive

**TDD:** Yes.

**Files:** Modify `src/domain/pricing/pricing.ts`; create `calculate-purchase-basket.ts` and test.

**Interfaces:** Consumes existing Decimal and freshness primitives. Produces `calculatePurchaseBasket`, `CanonicalFoodRequirement`, `PurchaseBasketResult`, and canonical basket-line types used by eligibility, search, persistence snapshots, and future Phase 4.

- [ ] RED-test aggregation before rounding, exact/below/above package boundaries, purchase increments, stable sorting, multi-recipe same-food consolidation, stale success warning, 90/91/future/missing boundaries, duplicate/mismatch rejection, safe VND overflow, and shuffled-input invariance.
- [ ] Run the focused test and require failure because the primitive does not exist:

  ```powershell
  npx vitest run src/domain/pricing/calculate-purchase-basket.test.ts
  ```

- [ ] Implement only the contract in Section 1.3 using Decimal `ROUND_CEIL`; do not import shopping/pantry concepts or persist rows.
- [ ] Add an invariant test showing Phase 2 proportional cost can differ from basket cost and planner budget uses only basket cost.
- [ ] Verify:

  ```powershell
  npx vitest run src/domain/pricing
  npm run lint
  npm run typecheck
  git diff --check
  git status --short
  ```

- [ ] Commit `feat: add deterministic purchase basket costing`.

**Safety:** One shared cost implementation only. No shopping list, pantry, or UI.

### Task 2: Add curated meal-option domain contracts and scaling

**TDD:** Yes.

**Files:** Create `src/domain/meal-option/*` and tests.

**Interfaces:** Consumes existing published recipe/scaling/catalog types. Produces normalized `MealOptionVersionInput`, `validateMealOptionVersion`, and `scaleMealOption` for publication and planner eligibility.

- [ ] RED-test stable identity/version shape, exact recipe-version pinning, duplicate/order/role errors, at least one main, exact yield reconciliation, one protein tag, cooking style presence, positive multipliers, and editorial elapsed-time validation.
- [ ] RED-test that two overlapping recipe elapsed times use the meal-option elapsed time exactly and are never summed.
- [ ] RED-test meal-level scale, component multiplier, canonical ingredient output ordering, and failure propagation from the existing recipe scaler.
- [ ] Implement the minimal pure model/validators/scaler. Derive ingredients and safety only from component structured recipe ingredients; tags cannot override lineage.
- [ ] Add tests proving shuffled component/tag rows normalize identically and arbitrary recipes cannot be injected after publication input is fixed.
- [ ] Verify and commit:

  ```powershell
  npx vitest run src/domain/meal-option src/domain/recipe src/domain/portion
  npm run lint
  npm run typecheck
  git diff --check
  git status --short
  git commit -m "feat: add curated meal option domain model"
  ```

**Safety:** No planner/search/persistence yet; no arbitrary composition endpoint.

### Task 3: Add meal-option and immutable plan database integrity

**TDD:** Yes for pgTAP when DB is available; otherwise exact-HEAD CI supplies authoritative RED/GREEN evidence.

**Files:** Create Phase 3 migration and four pgTAP files listed in Section 4.

**Interfaces:** Produces immutable meal-option tables/publication RPCs, owned immutable plan revisions/items, load RPCs, and restricted atomic persistence RPC used by later adapters.

- [ ] Write schema/grant/RLS tests first for every table, enum/check/index/composite FK/function execute grant and `purchase_increment` integer constraint.
- [ ] Write integrity tests for incomplete publish rollback, exact published recipe pinning, yield/tag/role/time rules, revision conflicts, pointer movement, published immutability, correction as new version, retirement discovery, and exact historical read.
- [ ] Write plan persistence tests for Monday/time-zone validation, exactly seven distinct primary slots, total/basket equality, idempotent retry, optimistic conflict, atomic rollback, immutable history, and replacement changing exactly one day.
- [ ] Write RLS tests for anon, owner A, owner B, normal authenticated/admin-token clients, forbidden direct Data API writes, forbidden persistence/publication execute, own historical reads, and service-path trigger protection.
- [ ] Implement the migration with least privilege and explicit trusted transition contexts. Do not add `shopping_lists`, basket-line tables, pantry, or production fixtures.
- [ ] With local DB available run reset/lint/all pgTAP. Otherwise retain `DATABASE_RLS_GATE_PENDING_CI` and run static SQL formatting/diff checks only.
- [ ] Verify non-DB checks, inspect status, and commit `feat: add immutable meal option and plan schema`.

**Safety:** One migration, local/CI database only. Every transaction failure must leave no partial plan/pointer/audit state.

### Task 4: Add meal-option publication use case, server adapter, and generated types

**TDD:** Yes.

**Files:** Create application meal-option files, server adapter, `api/admin/meal-options.ts`, tests; move shared hasher interface; update generated types/configs.

**Interfaces:** Produces closed admin commands and canonical publication hashing for exact meal-option aggregates. Makes generated Phase 3 DB types available to planner adapters.

- [ ] RED-test create/save/publish/retire commands, exact optimistic revision, reload-before-hash, structural publication errors, dependency failure, and stable canonical hash under shuffled DB rows.
- [ ] RED-test admin HTTP authentication from signed `app_metadata`, strict methods/body/unknown keys, sanitized failures, and rejection of client-supplied status/hash/actor/audit/current pointers.
- [ ] Implement application/admin adapter using exact published recipe IDs and the Phase 2 trusted admin pattern. Publication RPC remains atomic and authoritative.
- [ ] Generate `database.types.ts` only from a clean local reset. If local DB is unavailable, obtain the exact-SHA CI artifact, compare it to schema, commit it, and require a new exact-HEAD CI pass. Never hand-edit or generate from remote Supabase.
- [ ] Verify:

  ```powershell
  npx vitest run src/application/meal-option src/infrastructure/server api/admin/meal-options.test.ts
  npm run db:types:check  # only when local DB is available
  npm run lint
  npm run typecheck
  npm run test:coverage
  npm run build
  git diff --check
  git status --short
  ```

- [ ] Commit `feat: add trusted meal option publication`.

**Safety:** No role-assignment API, browser secret, broad service grant, or catalog UI.

### Task 5: Add planner input normalization and fail-closed eligibility

**TDD:** Yes.

**Files:** Create planner config/input/outcome/eligibility files and tests.

**Interfaces:** Produces canonical `PlannerInputV1`, `EligibleMealOption`, deterministic rejection diagnostics, and typed fatal/warning unions consumed by search and application use cases.

- [ ] RED-test exact seven slots, Monday/time zone/date validation, member/budget/config bounds, candidate limit, duplicate IDs/hashes, canonical array sorting, and identical canonical input under permutations.
- [ ] RED-test the eligibility pipeline in exact Section 1.4 order, including publication, pinned lineage, every Phase 1 hard rule, unsupported hard rule, unknown allergen/category fail-closed, meal-option time, current/stale/unusable prices, conversion/nutrition, and structural metadata.
- [ ] Prove a very high soft-preference score cannot make an excluded candidate eligible.
- [ ] Prove recipe elapsed-time sum is never used and only editorial meal-option elapsed time controls filtering.
- [ ] Implement minimal normalization/eligibility and deterministic diagnostics; reuse Phase 2 hard-rule, scaling, nutrition, freshness, and basket primitives.
- [ ] Add table-driven tests mapping zero eligible candidates to `INCOMPLETE_CATALOG_LINEAGE`, `NO_USABLE_PRICE`, or `HARD_FILTER_EXHAUSTED` with precise snapshot-scoped wording.
- [ ] Verify and commit `feat: add planner input and eligibility pipeline` with focused tests plus lint/typecheck/diff-check.

**Safety:** No candidate is scored before eligibility; unknown never passes.

### Task 6: Add deterministic scoring and bounded weekly search

**TDD:** Yes.

**Files:** Create `score-week.ts`, `search-week.ts`, tests, golden fixtures/snapshots, and benchmark script.

**Interfaces:** Consumes only eligible normalized candidates and `PlannerConfigV1`. Produces a `PlannerSuccess` or bounded-search fatal result with deterministic metrics/explanations.

- [ ] RED-test every score component/formula boundary and explanation code. Prove no medical/nutrient-target score exists and no separate soft time preference is invented.
- [ ] RED-test the two minimal hard duplicate-prevention rules: the same stable meal-option identity occurs at most once and adjacent days cannot share the exact main recipe version. Prove any amount of primary-protein repetition remains eligible and changes only deterministic diversity metrics.
- [ ] RED-test a catalog whose eligible meals all share one primary-protein group: seven distinct meal-option identities with compatible adjacent main recipe versions must still produce a complete seven-day plan when every true hard constraint passes.
- [ ] RED-test protein scoring monotonicity and separation: more repeated primary-protein occurrences produce a higher diversity penalty; among discovered equal-budget/equal-feasibility plans the more protein-diverse plan wins; no protein score can make an allergy/exclusion failure eligible.
- [ ] RED-test frontier sizes at every depth, 125 quality/125 cost selection, stable union/deduplication, canonical tie-breaks, and maximum 250 states.
- [ ] RED-test same input repeated and every shuffled database/candidate order produce byte-equivalent selected IDs, costs, scores, warnings, and canonical output.
- [ ] RED-test budget partition with adversarial fixtures:
  - any discovered within-budget plan beats all over-budget plans;
  - among over-budget plans, cheaper always beats costlier even with much worse quality;
  - a lower protein-repetition penalty never lets a more expensive over-budget plan beat a cheaper fallback;
  - quality breaks only equal-cost over-budget ties;
  - over-budget returns ready success plus exact budget/cost/overage warnings.
- [ ] RED-test bounded miss returns only `NO_COMPLETE_PLAN_FOUND_IN_DETERMINISTIC_SEARCH` and never global-infeasibility wording.
- [ ] Implement the pseudocode in Section 1.7 without randomness or solver dependency.
- [ ] Add reviewed golden households: two adults, child household, multigenerational, vegetarian, allergen exclusion, tight feasible budget, minimum-cost over-budget fallback, hard-filter exhaustion, bounded miss, stale-price success, ingredient reuse, a feasible seven-option single-protein catalog, and equal-budget alternatives where the more protein-diverse plan wins.
- [ ] Add exhaustive enumeration for small fixtures and compare the bounded result where the golden fixture is known to fit; document that equality on small fixtures does not make beam search globally complete.
- [ ] Add an external benchmark using launch-size synthetic eligible candidates. Domain receives no clock; benchmark records explored states and requires the configured 250-state cap. Keep any latency threshold generous/non-flaky and report measured duration separately.
- [ ] Verify and commit `feat: add deterministic weekly planner`.

**Safety:** Budget ranking is lexicographic, never weighted. Search messages explicitly acknowledge bounded incompleteness.

### Task 7: Add deterministic replacement, snapshots, and application use cases

**TDD:** Yes.

**Files:** Create replacement/snapshot domain files and tests; create planner application port/use cases and tests; move/update shared hasher imports.

**Interfaces:** Produces generation/replacement commands, immutable snapshot payloads/fingerprints, and repository commands used by server infrastructure.

- [ ] RED-test replacement locks six days, excludes current identity, preserves indexes/exact version IDs, applies only the defined whole-week hard constraints, recomputes full basket/quality, and returns signed exact cost delta. Prove protein repetition is rescored rather than rejected, including a valid replacement when every surviving candidate shares the locked week's protein group.
- [ ] RED-test replacement budget behavior: any within-budget candidate beats all over-budget candidates; otherwise minimum exact cost wins before quality.
- [ ] RED-test unavailable replacement wording, stale input/plan version, changed household setup requiring regeneration, and preview/apply fingerprint conflict.
- [ ] RED-test manifest/input/calculation canonical payloads and golden SHA-256 values. Change each exact meal-option/recipe/fact/price/config/date ID/hash and require the appropriate fingerprint to change; move current pointers and require persisted replay bytes not to change.
- [ ] Implement `generateMealPlan`, preview/apply replacement, and load use cases with dependency-injected repository/hasher. Fatal outcomes never call persistence; ready over-budget does.
- [ ] Verify focused planner/application tests, coverage, lint, typecheck, build, diff-check, and commit `feat: add planner use cases and replacement`.

**Safety:** Apply recomputes; it never trusts preview totals or catalog hashes from the browser.

### Task 8: Add authoritative planner repository and HTTP Functions

**TDD:** Yes.

**Files:** Create server/read adapters, three planner Functions/tests, update TS configs/security tests.

**Interfaces:** Implements `PlannerRepository` with user-scoped authoritative reads and one restricted service RPC persistence call. Exposes the strict HTTP contracts in Section 3.2.

- [ ] RED-test missing/forged/expired token, cross-household reference, method/content type/body size/unknown keys, invalid week/day/version/idempotency, client-computed field rejection, sanitized domain/dependency failures, and no secret/log leakage.
- [ ] RED-test that public user-scoped loads occur before secret client construction and ownership is checked both server-side and in DB.
- [ ] RED-test generation idempotency, persistence rollback, retry, stale plan conflict, replacement preview no-write, apply exact-recompute, and exactly one new revision.
- [ ] Implement adapters against `get_planner_generation_input`, `get_plan_replacement_input`, RLS reads, and `persist_meal_plan_revision`. Keep service credentials in server-only environment and add architecture/secret tests.
- [ ] Verify API/infrastructure tests, env/secrets, lint, typecheck, coverage, build, diff-check, status, and commit `feat: add authoritative planner API`.

**Safety:** No remote calls/deploy, browser secret, direct plan table write, or client-authored calculation.

### Task 9: Add the minimal mobile weekly-plan and replacement UI

**TDD:** Yes for components/API adapter.

**Files:** Create `src/features/plans/*`, tests, route changes, and `tests/planner.spec.ts`.

**Interfaces:** Consumes persisted plan view and planner HTTP tagged unions. Produces only user intent for generate/preview/apply.

- [ ] RED-test seven ordered accessible day cards, “7 bữa chính” budget scope, within/over exact amounts, stale and bounded-search warning copy, typed empty/failure states, and no unsafe/medical claims.
- [ ] RED-test meal details use immutable item snapshots for scaled ingredients/nutrition/instructions and do not expose internal basket/package lines as a shopping list.
- [ ] RED-test replacement preview delta, cancel no-write, apply changing one visible day, stale-version reload, and disabled duplicate submission.
- [ ] Implement the minimal authenticated `/plan` route using existing shadcn primitives/mobile conventions. Do not add admin, grocery, pantry, package, or checkoff UI.
- [ ] Add Playwright flow with local seeded catalog: onboard/sign in, generate seven meals, inspect detail, replace one day, assert the other six exact labels remain, and verify precise over-budget/stale copy fixture where applicable.
- [ ] Verify component tests, full coverage, build, SPA smoke, diff-check, status, and commit `feat: add weekly planner experience`.

**Safety:** UI displays server results and never recomputes authoritative values.

### Task 10: Add DB/API integration, CI enforcement, documentation, and exit gate

**TDD:** Yes for integration fixtures; CI wiring is command-verified.

**Files:** Create planner integration tests; modify package scripts, CI, configs, README.

**Interfaces:** Proves all layers converge on exact authoritative planner states and preserves inherited Phase 0–2 gates.

- [ ] Integration setup uses local loopback Supabase only and creates users, household, complete foods/facts/recipes/prices/meal options through trusted test/admin paths. No production fixture/migration data is added.
- [ ] Public integration proves current meal-option discovery, exact historical reads after pointer/retirement changes, draft invisibility, and cross-user plan isolation.
- [ ] API integration proves authoritative reload ignores/rejects forged totals/scores/hashes, deterministic generation, idempotency, exact seven-item persistence, basket-total invariant, over-budget success, stale warning, fatal unusable prices, and atomic rollback.
- [ ] Replacement integration proves one new immutable revision, other six exact IDs unchanged, exact cost delta, old revision readable/unchanged, optimistic conflict, and pointer changes do not alter replay.
- [ ] Extend `database` CI after inherited tests with planner public/API integration and planner Playwright. Preserve Supabase start/reset/lint/all pgTAP/generated-type check, Auth/household/catalog/admin integration, onboarding Playwright, artifact upload, and `always()` cleanup.
- [ ] Add package commands such as `test:integration:planner`, `test:e2e:planner`, and `benchmark:planner`; no deployment scripts.
- [ ] README documents deterministic seven-primary-meal scope, bounded-search wording, basket-cost versus Phase 2 consumption cost, local/CI database gates, immutable replacement revisions, and explicit Phase 4 deferrals.
- [ ] Run the full exit gates in Sections 6–7. Commit `test: verify planner integration and CI` only when the task's locally available checks pass.

**Safety:** CI uses ephemeral GitHub-hosted Docker, no remote Supabase substitute, secrets, write permissions, deploy, or production migration.

---

## 6. Exact Verification Command Reference

### Fast deterministic feedback

```powershell
npx vitest run src/domain/pricing src/domain/meal-option src/domain/planner src/application/planner src/application/meal-option
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```

### Planner-specific regression and benchmark

```powershell
npx vitest run src/domain/planner src/domain/pricing/calculate-purchase-basket.test.ts
npm run benchmark:planner
```

The benchmark runs outside the domain. Its authoritative deterministic assertions are candidate/frontier/state counts and output fingerprint; elapsed time is reported as release evidence, not read by planner logic.

### Local capability

```powershell
npm run preflight
```

Record `LOCAL_DB_VERIFICATION_AVAILABLE` or `LOCAL_DB_VERIFICATION_UNAVAILABLE`. Node 24 is mandatory. Local Docker absence alone is not a blocker.

### Authoritative local database path when available

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
npm run test:e2e:onboarding
npm run test:e2e:planner
npm run supabase:stop
```

All endpoints must be loopback. Never use `--linked`, `db push`, Supabase login, hosted URLs, production/staging credentials, or remote substitutes.

### Authoritative exact-HEAD CI path

When local DB verification is unavailable, the exact-final-SHA GitHub Actions `database` job must pass Node/Docker/Supabase preflight, clean start/reset, SQL lint, inherited plus Phase 3 pgTAP/RLS/integrity, generated-type drift, all public/admin/planner integration, onboarding/planner Playwright, type artifact, and cleanup. Prior-SHA evidence is insufficient.

### Mandatory local non-database Phase 3 exit gate

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
npm run benchmark:planner
npm run build
npx playwright install chromium
npm run test:e2e
git diff --check
git status --short --branch
```

### Exact final branch/CI proof

```powershell
$phase2Head = "7cf00d2beb6c7db09174a9944709d15617c953c1"
git merge-base --is-ancestor $phase2Head HEAD
git diff --check "${phase2Head}...HEAD"
git status --short --branch
git push --set-upstream origin codex/phase-3-planner

$phase3Head = git rev-parse HEAD
$remoteHead = git rev-parse origin/codex/phase-3-planner
if ($remoteHead -ne $phase3Head) { throw "PHASE_3_BLOCKED_REMOTE_HEAD_MISMATCH" }

$run = gh run list --workflow ci.yml --branch codex/phase-3-planner --commit $phase3Head --limit 1 --json databaseId,headSha,status,conclusion,url | ConvertFrom-Json
if ($run.Count -ne 1 -or $run.headSha -ne $phase3Head) { throw "PHASE_3_BLOCKED_EXACT_HEAD_CI_NOT_FOUND" }
gh run watch $run.databaseId --exit-status
$jobs = (gh run view $run.databaseId --json jobs | ConvertFrom-Json).jobs
if (($jobs | Where-Object name -eq "web").conclusion -ne "success") { throw "PHASE_3_BLOCKED_CI_WEB" }
if (($jobs | Where-Object name -eq "database").conclusion -ne "success") { throw "PHASE_3_BLOCKED_CI_DATABASE" }
```

---

## 7. Phase 3 Exit Criteria

- [ ] Approved Phase 2 SHA is an ancestor; inherited Phase 0–2 verification remains green.
- [ ] Stable meal-option identities point to immutable exact published versions; component rows pin exact published recipe versions with composite FKs and reconciled yields.
- [ ] Meal-option elapsed time is editorially validated and never derived by summing recipe elapsed times.
- [ ] Planner input is exactly seven Monday-start primary meals with explicit date/time zone and full config snapshots.
- [ ] Eligibility precedes scoring and enforces publication, lineage, hard household rules, time, usable prices, six nutrients/conversions, and structure. Unknown safety/category lineage fails closed.
- [ ] Unsupported hard rules, incomplete lineage, no usable price, hard-filter exhaustion, bounded search miss, and replacement miss have distinct typed outcomes and precise non-global wording.
- [ ] `PlannerConfigV1` fixes canonical ordering, candidate cap, 125/125 union, maximum 250 frontier, the two minimal hard duplicate-prevention rules, protein-repetition/diversity score formulas, and tie-breaks.
- [ ] Same normalized input and shuffled input/query orders yield byte-identical plan/fingerprints; no randomness or domain wall clock exists.
- [ ] Exact same meal-option identity cannot repeat and adjacent exact main recipe duplication is prevented; primary-protein repetition never invalidates a plan and instead incurs a monotonic transparent diversity penalty alongside vegetable/soup/style/preferences.
- [ ] A seven-day plan can be produced when every eligible distinct meal option shares one primary-protein group; for equal-budget/equal-feasibility discovered plans the more protein-diverse plan is preferred, without overriding any allergy/exclusion or other hard rejection.
- [ ] Any discovered within-budget plan excludes all over-budget finalists. Without one, minimum exact package-rounded cost wins before quality. `PLAN_OVER_BUDGET` remains successful with exact overage.
- [ ] Shared purchase-basket primitive aggregates stable foods before package rounding, applies increments/freshness exactly, and alone produces the authoritative total; `meal_plans.total_estimated_cost_vnd`, its current revision total, and the persisted basket snapshot are equal.
- [ ] Stale 31–90-day prices succeed with warnings; >90-day, future, missing, duplicate, and mismatched prices are unusable.
- [ ] Replacement changes exactly one target day, keeps six exact IDs/indexes, recomputes the whole week, returns exact cost delta, and persists a new immutable revision.
- [ ] Plan snapshots pin exact meal-option/recipe/fact/food/price IDs/hashes and code configs; current-pointer/retirement changes do not alter old replay.
- [ ] Database/RPC validates exactly seven slots, ownership, optimistic/idempotent persistence, snapshot-total equality, replacement delta shape, and atomic rollback. Completed history is immutable.
- [ ] RLS permits only own plan reads; browser roles cannot mutate plans or call persistence/publication; no browser service secret exists.
- [ ] Minimal mobile plan/detail/replacement UI uses server snapshots and contains no shopping/pantry/admin/AI/medical behavior.
- [ ] Domain/property/golden tests, pgTAP/RLS, generated types, integration, planner Playwright, benchmark, local non-DB gate, and exact-HEAD CI `web`/`database` pass.
- [ ] No shopping-list persistence/UI, pantry deduction, purchased state, grocery category/checkoff UX, marketplace, arbitrary composition, AI, ML, deployment, or production migration exists.

### `PHASE_3_PASS`

Use only when mandatory local non-database gates pass, database/RLS/generated-type/integration passes locally or on exact-final-HEAD CI, both exact-HEAD CI jobs pass, and the verified HEAD is pushed.

### `PHASE_3_BLOCKED`

Use when Phase 2 ancestry is missing, Node 24 is unavailable, any required check fails, generated types drift, database/RLS/integration has passed nowhere, exact-HEAD CI is absent/failing, or pushed remote HEAD differs. `LOCAL_DB_VERIFICATION_UNAVAILABLE` alone requires exact-HEAD CI and is not itself blocked.

---

## 8. Self-Review Against Design, Request, and AGENTS.md

### 8.1 Coverage matrix

| Required area | Plan coverage |
|---|---|
| Base/branch prerequisite | Section 0, Gate 0 |
| Meal option identity/version/composition | 1.2, 2.1, Tasks 2–4 |
| Eligibility/hard constraints/time/lineage | 1.4, Task 5 |
| Planner config/scoring/diversity | 1.5–1.6, Task 6 |
| Bounded search/frontiers | 1.7, Task 6 |
| Budget fallback/outcomes | 1.8, Task 6 |
| Replacement | 1.9, Task 7 |
| Minimal basket-cost boundary/invariant | 1.3, Task 1, DB persistence checks |
| Snapshots/fingerprints/history | 1.10, 2.1, Task 7 |
| Server authority/API | Section 3, Task 8 |
| Database/RLS/grants | Section 2, Tasks 3–4/8/10 |
| UI limited to Phase 3 | 3.3, Task 9 |
| Property/golden/pgTAP/integration/CI | Tasks 3/6/10, Sections 6–7 |

### 8.2 Contradiction and scope audit

- **Bounded search:** The plan labels beam search incomplete. Only hard-filter exhaustion is proven against the exact enumerated catalog snapshot; search misses never claim global infeasibility.
- **Over-budget ranking:** Budget partition is outside quality scoring. Minimum exact basket cost is primary for every over-budget fallback/replacement; weighted quality cannot select a costlier fallback.
- **Curated composition:** Only admin-published `meal_option_recipes` define dish composition. Planner candidates cannot introduce, remove, or combine recipes.
- **Hard/soft separation:** Safety, explicit exclusions, publication, time, lineage, price, nutrients, conversions, structural validity, stable meal-option identity duplication, and adjacent exact-main-recipe duplication are hard. Primary-protein repetition, other diversity, preferences, and reuse are score-only and run after eligibility; an all-one-protein eligible catalog can still yield a valid week.
- **Protein/budget separation:** Protein repetition has a monotonic diversity penalty but no eligibility cap. It can prefer a more diverse equal-budget plan, cannot override safety, and cannot change the rule that minimum exact cost wins among over-budget fallbacks.
- **Cost ownership:** Phase 2 proportional cost remains diagnostic. Phase 3 adds one shared package-rounded basket primitive, used for search, snapshots, persistence invariant, and future Phase 4. No duplicate calculation is permitted.
- **Historical immutability:** Every plan result is a sealed revision containing seven immutable item snapshots and exact IDs/hashes. Replacement advances a pointer to a new revision rather than changing history.
- **Pointer semantics:** Current pointers select defaults only. Exact-ID replay and replacement use persisted manifests and do not substitute current facts/recipes/meal options/price books.
- **Replacement scope:** Six `(dayIndex, mealOptionId, mealOptionVersionId)` tuples are locked and tested byte-for-byte. Apply recomputes and changes one target only.
- **Phase 4 boundary:** Basket lines exist only inside calculation contracts/snapshots to make budget correct. There are no `shopping_lists`, grocery UI/categories/checkoff, pantry input, or purchased state.
- **Safety authority:** Structured recipe ingredients and pinned facts are the sole safety/nutrition/quantity source. Meal-option tags never override them; no text/AI/NLP interpretation exists.
- **Claims:** Composition/diversity heuristics are transparent; the UI makes no medical, personalized “healthy,” guaranteed-price, or “allergy safe” claim.
- **Infrastructure:** Trusted Functions authenticate before secret use; user-scoped reads retain RLS; one restricted RPC persists atomically; direct clients cannot bypass invariants.
- **Verification location:** Local Docker is optional for non-DB work, but DB/RLS/integration is mandatory locally or on exact-final-HEAD GitHub-hosted Docker. No remote substitute or weakened gate exists.

### 8.3 YAGNI check

One meal-option catalog slice, one basket primitive, one deterministic planner configuration, one bounded search, one immutable revision model, three planner Functions, and a minimal plan/replacement UI satisfy Phase 3. No general solver, random recommendation, admin CMS, background queue, retailer selection, multi-region UI, shopping list, pantry, delivery, payment, AI, ML, clinical nutrition, or Phase 4 persistence is planned.

## 9. Primary Implementation References

- `AGENTS.md`.
- Approved design Sections 3–14 and 17–20.
- Approved Phase 0/1/2 plans and exact Phase 2 implementation/CI evidence.
- Existing `src/domain`, `src/application`, `src/infrastructure`, Vercel Function, migration, pgTAP, generated-type, and CI patterns.
- Supabase local database testing, PostgreSQL constraints/triggers/function security, and Vercel Function conventions already referenced by the approved plans.
