# Household nutrition: final review record

This is the original, independent pre-fix review. Its three Important findings were reproduced and
corrected in one author fix pass; the reviewer was not dispatched again. The Minor remains deferred.
See [the acceptance record](../../operations/household-nutrition-acceptance.md) for final verification,
regression evidence, rulings and production/catalog limitations. The original recommendation below
records what needed correction at review time; it is not an unresolved finding list.

# Final whole-branch review

Reviewed BASE `301f4576a9376ff351cf8aa8a2dd5fb2681b60cc` through HEAD `37f8ea1b9a79e33c0ee660385ae60ea1edc0bed0`, including current Task 11 tracked/untracked deliverables and the final smoke-test adjustment. Read AGENTS.md, approved spec/plan, review package and ledger rulings. Read-only review: no repository implementation edits, database operations, service changes, commits, pushes or production access.

**Recommendation: fix the three Important findings below before completion. No Critical finding confirmed.**

## Important

### 1. Keep v6 surplus on the revision's measured fact when creating pantry stock

**Location:** `supabase/migrations/20261002040000_planner_nutrition_input_and_pantry_units.sql:89` (the patch to `apply_shopping_to_pantry`), together with its new whole-piece guard at line 74. The inherited live-head selection remains at `supabase/migrations/20260928000000_pantry_consume_on_shopping.sql:124`.

**Trigger:** Generate a v6 plan with a mass-base whole-piece food, e.g. measured eggs at 50 g each, fixed box of ten, three eggs needed, no existing pantry row. The stored surplus is seven eggs / 350 g. Publish a new fact for the same food with a measured 60 g egg and matching whole-piece policy before checking the shopping line and confirming “Đi chợ xong”.

**Effect/evidence:** This migration only adds protected transition context to the old settlement function. That function still selects `foods.current_fact_version_id` for a newly created row, so it inserts the pinned 350 g surplus under the new 60 g fact. The new v6 trigger rejects `350 / 60` as fractional, rolling back the entire confirmation, including other checked foods. If a new fact happens to divide the amount evenly, settlement succeeds while assigning a different physical piece identity/count to the old purchase. V6 generation explicitly requires source and price facts to match for whole pieces; settlement currently discards that same pin. This is an interaction introduced by the new v6 physical contract/guard, not a request to change legacy settlement semantics.

**Suggested correction:** For v6, select the stored shopping purchase/source fact when creating stock and preserve its measured conversion. Keep legacy engine settlement unchanged. Do not silently combine an existing incompatible whole-piece pantry fact with the revision's fact; return a useful conflict or use an explicitly reviewed compatibility rule.

**Regression:** Real SQL/integration test: persist the mass-base 50 g egg plan, advance the catalog head to 60 g, confirm with no pantry row, assert the original fact and seven whole eggs are stored, then confirm again and assert no second mutation. Include another checked line to prove no unrelated settlement is blocked.

### 2. Recognize changed pantry input before hydrating historical policy IDs against live facts

**Location:** `src/infrastructure/server/supabase-planner-input-loader.ts:728` and `:743`; rejecting condition in `src/infrastructure/server/load-food-quantity-policies.ts:51`.

**Trigger:** The pantry contains an ingredient with a published quantity policy whose fact is not used by any candidate in the original plan. Generate v6, then delete that pantry row and preview/apply a meal replacement. An ordinary variant is replacing an old pantry fact with a newer fact while the original pantry fact is absent from the candidate pool.

**Effect/evidence:** `factIds` combines pinned candidate facts with **live** pantry facts (lines 722–726), while `pins` also includes **old** pantry policy IDs from the revision (line 734). The policy query fetches that legitimate old policy, then throws `INVALID_QUANTITY_POLICY_DATA` because its fact is no longer in the live set. `versionedFailure` maps this ordinary Error to `TRANSIENT_DEPENDENCY_FAILURE`, so the user receives a retry/dependency failure indefinitely instead of the required `PLAN_INPUT_CHANGED_REGENERATION_REQUIRED`. The domain binding comparison never runs. The immutable six days are protected, but the intended recovery path is lost.

**Suggested correction:** Compare the freshly loaded pantry snapshot with the pinned snapshot before this hydration, and raise the typed input-changed error. Alternatively preserve historical-policy hydration consistently and perform the same typed binding rejection before any live-fact mismatch is treated as corrupt data. Do not relax the loader's lineage validation globally.

**Regression:** Loader/repository or real API test with an unused pantry ingredient and published policy: generate, delete the stock row, then preview and apply; both must return the regeneration-required code and persist nothing. Cover changing its fact as well as deleting it.

### 3. Preserve a visible identity for unnamed members in portion instructions

**Location:** `src/domain/portion/calculate-member-meal-portions.ts:118` and `src/features/plans/member-portions-panel.tsx:24`.

**Trigger:** Two or more adults use the optional blank name, enter different body profiles/goals and generate a plan. The same issue affects unnamed elderly members and becomes especially confusing after deleting member 2 while member 3 remains.

**Effect/evidence:** The snapshot stores `label: null` and drops `sortOrder`. The portion panel renders every adult as exactly “Người lớn” (every elderly member as “Người cao tuổi”), even when the rows instruct different percentages/kcal. Household settings identify those people as “Người lớn 1”, “Người lớn 3”, etc., but the meal has no visible way to map its individualized allocation back to those identities. Stable UUIDs exist only in React keys/private data. The feature's primary per-person portion instruction is ambiguous for the normal unnamed-profile path. The existing panel test only covers a named member.

**Suggested correction:** Freeze the stable fallback display label from `memberKind` and profile `sortOrder` into the portion snapshot (or expose an explicitly allowed stable display-order field). Avoid generating sequential indices from the remaining rendered array or consulting current body profiles when reading a saved revision.

**Regression:** Two unnamed adults with distinct goals produce distinct stable visible headings and matching allocations; remove the middle of three, regenerate and verify identities 1/3 survive. Read the old revision after a later profile change and ensure its labels/portions remain frozen. Preserve explicit names and child per-member behavior.

## Minor

- `src/features/household/components/member-profile-card.tsx:133` uses the generic `INCOMPLETE_PROFILE` message listing every possible field, rather than identifying exactly which inputs are missing as specified in design section 10. A person who entered all but activity must inspect every field. An explicit missing-field list would improve recovery; this does not invalidate the saved profile or calculations.

## Positive review observations / evidence limits

- Decimal comma parsing preserves `65,50` and `170,5`; profile reducer/save use UUID identity, and new adult sort order is not derived by reassigning remaining profiles.
- Profile table grants/RLS, foreign-profile validation, guarded conflict update and versioned transaction provide the intended owner boundary. The current-plan/HTTP and assistant allowlists omit raw body measurements and equation inputs.
- V6 aggregates actual cooked sources before pantry deduction/purchase rounding, retains zero-buy rows, and adds the zero-surplus transfer constraint correction. Stored replacements use exact catalog/policy pins and preserve six meal snapshots.
- Legacy paths remain explicitly v5; the shared search/scaling refactors retain versioned behavior and have existing golden evidence. New-schema write paths fail rather than discard body fields; migration-before-runtime ordering is documented.
- Read the provided verification logs, including `task-11-browser-green.log`: **23 browser tests passed**. The package records web 193 files / 1756 tests, SQL 516, integration 25 and performance 6. I did not rerun mutation-bearing suites during this read-only review and do not claim the three new regression cases were executed. Findings above are direct code-path analyses.

## Declined to judge

- **Retailer truth/current availability and scientific validity:** no fresh retailer or clinical verification was performed. The 45 quotes intentionally retain legacy fixed semantics; original URLs/dates/scalars and their secondary-source limitations are acknowledged. No new verified loose offer is claimed. Publishing actual loose-sale evidence remains a separate catalog task.
- **Production readiness/deployment execution:** no production schema, actual owner data, real p95 latency or migration application was inspected. Local gates and rollout instructions are not evidence of production deployment.
- **Non-unit count bases such as dozen:** some new whole-count checks use integer base quantities while display projection divides by dimension factors. This may require extension for non-unit count bases, but the reviewed catalog uses `item`; I have not established an actionable supported-data regression and am not requesting speculative scope expansion.
- **Pre-existing replacement retry and no-op settlement latch behavior:** inherited paths can reject an already-applied replacement retry as stale, and a settlement with no stock/surplus to mutate does not create a per-item transfer row. These deserve separate contract decisions if changed; I did not elevate them as new whole-branch regressions without a clearer approved behavioral change.
- **Clinical outcomes:** the deterministic Mifflin/BMI arithmetic and specified bounds were reviewed; no claim is made that a one-meal plan achieves medical or whole-day nutritional outcomes.
