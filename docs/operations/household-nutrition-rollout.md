# Household nutrition and practical purchasing rollout

The implementation is verified locally on the feature branch. Production migration, catalog mutation,
merge and deployment each need their own explicit authorization. This document does not perform or
authorize those actions. New generation uses planner-engine-v6; old revisions retain their original
engine and immutable quantities. One planned primary meal per day is 33% of daily target by default,
configurable from 20% to 50%; this is not a full-day diet.

## Diagnose settings and purchasing after rollout

A saved revision keeps the household setup version and quantities used when it was created.
Changing settings does not rewrite that history. The week view warns when the saved setup version
is older, or a legacy week has not applied the saved nutrition setup. Use **Tạo lại kế hoạch tuần**
to generate a new revision from current settings and update its shopping list. A failed regeneration
keeps the previous week and its concurrency version so retry remains a regeneration.

Shopping shows the amount still needed after pantry deduction and the expected excess when the
chosen quote requires rounding up. Shared text uses the same amounts. A quote for 1 kg and a verified
loose sale are distinct inputs: UI labels must not claim that a legacy quote proves a vendor only
sells fixed packaging.

Schema verification alone does not establish catalog readiness. To read published policy coverage,
current price book purchase modes and aggregate rollout state with the existing GitHub database
binding, run the optional diagnostic from reviewed source:

```sh
gh workflow run ci.yml --ref main -f diagnose_production=true
```

Diagnostic mode adds a read-only job to normal CI. All required checks still run; a separate
concurrency group prevents a diagnostic dispatch from cancelling normal verification.
The diagnostic uses a read-only database session and a read-only transaction, checks the exact
production target and TLS, and selects no household/user identifiers or body profile values into
its report. It can also be dispatched from a reviewed work branch before release. Missing exact
fact policies explain a v6 generation failure; zero loose sale prices explain why new purchasing
support still rounds according to fixed quotes. Resolve and review the required catalog publication
separately; the diagnostic never migrates, publishes data or changes saved plans.

## Release in dependency order

The production migration workflow accepts only `refs/heads/main`
([production-migration.yml](../../.github/workflows/production-migration.yml)). A single merge of the
whole feature followed by migrations would activate v6 too early. Prepare and review a **schema and
admin publication release first**, retaining the existing v5 runtime and household UI. The backend
modules in Tasks 1–8 are additive; their checkpoint keeps the default engine at v5. Include the fifth
read projection migration below without switching Task 10 runtime composition. Verify this reviewed
release with the legacy tests before integrating it. Do not cherry-pick an arbitrary partial file
list without checking its compile, SQL and legacy behavior.

1. Review/integrate that compatible schema/admin release using separately authorized main/deployment
   actions. Old runtime still creates v5/shopping-v1 plans. After its code is on main, review the
   migration workflow's read-only plan for the exact target/project/history, then separately approve
   its apply job. Apply all five migrations in order:

   | Migration                                                     | Purpose                                                                                          |
   | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
   | `20261002010000_household_nutrition_profiles.sql`             | Owner-only body profiles, atomic versioned setup read/save                                       |
   | `20261002020000_food_quantity_and_purchase_terms.sql`         | Immutable cooking policies and purchase terms, admin publication                                 |
   | `20261002030000_planner_v6_shopping_v2.sql`                   | Actual quantities/price/pantry proof and all three SQL engine guards                             |
   | `20261002040000_planner_nutrition_input_and_pantry_units.sql` | Atomic inputs, historical reads, legacy fixed-quote proof and indivisible stock validation       |
   | `20261002050000_whole_unit_shopping_projection.sql`           | Whole-piece display from immutable stored cooking conversion, without live catalog recomputation |

   This branch has 27 migrations, 46 public tables and 33 public function names. Reconcile the actual
   target history against the approved release, not a historical table count. Never run a reset or
   local fixture suite against production.

2. Verify v1–v5 current-plan reads, legacy generation/replacement, shopping-v1 reads and explicit
   shopping confirmation against the migrated schema. The local integration suite covers these
   paths. Confirm owner RLS and the three guards remain authoritative:
   `private.assert_plan_revision_consistent`, `private.guard_meal_plan_revision`, and
   `private.guard_meal_plan_item`. Merely permitting an engine string is insufficient: the stored
   ingredients, policy hashes, exact price terms, gross/base conversions, source sums, currency and
   stock evidence must replay correctly.

3. Separately authorize catalog publication. Read-only import/validation/audit first:

   ```bash
   npm run catalog:sheet -- import --dir docs/catalog/staging --out /tmp/bepnha-nutrition-catalog-pack.json
   npm run catalog:validate -- --input /tmp/bepnha-nutrition-catalog-pack.json
   npm run catalog:audit -- docs/catalog/staging
   ```

   The reviewed authoring v2 pack creates fact4, recipe4, meal-option3 and price-book4; it does not
   mutate the old published versions. Publish these through the newly reviewed admin pipeline,
   including each exact fact's quantity policy and the explicitly fixed purchase terms. Preparation
   notes and steps define the cut/divisible ingredient forms. Keep all original nutrient/allergen
   data, measured conversions, price observations and source URLs. Policy publication is required
   before v6 generation; a missing policy is a blocker, not an inferred category default.

   The old deployed admin HTTP handler cannot execute the new policy commands. That is why the
   schema/admin release precedes publication. An alternative is a separately reviewed Node process
   from this branch calling the tested `executeCatalogAdminCommand` and the qualified Supabase RPC
   repository, with an authorized admin actor and server-only credentials. Never copy a service
   key into browser/VITE bindings or print commands/payloads that contain credentials or profiles.

   Already-published legacy fixed prices can also be retained while exact food policies are
   published separately. Their v2 adapter hashes the original quote/source and preserves package
   rounding. It never converts a kg quote into a loose offer. When using the staging cut-form
   policies, publish the matching new fact/recipe forms together; do not apply them to a different
   fact or a recipe that requires a whole fish/chicken.

4. Load each representative owner's real inputs and run `evaluateCatalogReadiness` using the
   `planner-input-v2` overload. Require at least 21 eligible meals, protein capacity, complete
   allergy/nutrition/unit/policy/price coverage, and physically compatible pantry amounts. The
   source-verified staging pack is structurally ready; readiness for an owner is a separate check.
   Strict cross-contact exclusions can remove many meals and must not be relaxed to meet capacity.

5. Review/authorize integration and deployment of the household UI and Task 10 versioned runtime
   only after the preceding checks. New profiles are optional; absent body fields stay absent.
   Current and assistant reads use stored revisions without loading current body data. Replacements
   retain six days and reject changed household/pantry input; later policy/fact publications cannot
   reinterpret those days. Legacy engine1–5 replacements still write the frozen v5 contract.

6. A later loose-price release is a separate catalog operation. Obtain evidence of the actual sale
   form, quoted weight/count, VND basis, observed date and minimum sale step; publish a **new** price
   book. Existing evidence does not verify a 50g sale step for the staging fish. Keep box-10 eggs,
   220g tofu and 200g mince fixed until another offer is documented. Review
   [PURCHASING_REVIEW.md](../catalog/staging/PURCHASING_REVIEW.md) for all 45 rows and unresolved source
   work. The synthetic 600g fish fixture proves the implementation, not a production seller's terms.

## Schema gap and stock behavior

Only missing-schema errors `42703`, `42P01`, `42883`, `PGRST202` can use the documented read fallback;
missing new fields mean not stated. Auth, network and corrupt-data errors remain errors. New writes
fail with `DEPENDENCY_SCHEMA_NOT_READY`; they never drop body fields or use the old save RPC. V6
persistence has no old-schema fallback, so migrations must precede runtime activation.

Legacy fractional stock is left intact for correction. New count/whole-piece stock writes require
whole measured units. V6 generation reports `INVALID_INDIVISIBLE_PANTRY_QUANTITY` rather than silently
rounding it. Legacy shopping settlement has a narrowly validated owner/revision transaction context;
setting a custom GUC alone cannot bypass whole-unit validation.

Generation and reads do not consume stock. Fully covered shopping rows retain their cooking sources
with zero purchase/cost. Only checked items plus the explicit “Đi chợ xong” action settle pantry,
using the per-item transfer latch once. Fixed packaging leaves a visible physical surplus.
V6 surplus creates stock with the revision's pinned purchase fact, including its original measured
piece conversion. A later catalog head cannot reinterpret that purchase. Existing whole-piece
stock under a different fact reports `PANTRY_FACT_CHANGED_REGENERATION_REQUIRED`; check the stock
and regenerate rather than combining incompatible measured units. Legacy settlement keeps its
historical behavior. Deleting or changing even an unused pinned pantry ingredient makes replacement
preview and apply return `PLAN_INPUT_CHANGED_REGENERATION_REQUIRED` without writing a revision.

## Local acceptance evidence

Use the saved cloud activation before checks. Generated-type verification uses the repository's
pinned CLI: `env -u SUPABASE_CLI_BINARY_OVERRIDE npm run db:types:check`. SQL tests require a fresh,
disposable local DB before integration fixtures. Browser household save/reload/Auth is real local
Supabase; planner/shopping/pantry browser payloads are fixtures. The real server/DB suites prove
publication, private snapshots, deterministic generation, exact whole eggs, legacy prices, immutable
replacement, authorization and once-only pantry settlement. Never claim the fixture's prices or
physical measurements are production observations.

No production step above has been executed by this task. Keep the reviewed feature branch available
until the operator chooses the staged releases.
