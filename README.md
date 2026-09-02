# BepNha

BepNha is a deterministic meal-planning application for Vietnamese households. Phase 5 adds an owner-scoped, mobile-first “Tủ bếp” flow, immutable generation-time pantry snapshots, deterministic pantry deduction before the existing package-rounding authority, and pantry-aware shopping evidence. Existing meal-plan revisions are never rewritten when current pantry amounts change.

An AI model must never author or override serving quantities, nutrition, prices, shopping quantities, allergy safety, meal eligibility, or authoritative budgets.

## Prerequisites

- Node 24 (`>=24 <25`) and npm are mandatory.
- The committed Supabase CLI is installed by `npm ci`.
- A Docker-compatible runtime is optional for local database verification, but the database/RLS gate is mandatory. If Docker is unavailable locally, the exact-final-HEAD GitHub Actions `database` job must pass.

No command in this repository links, provisions, deploys, or migrates a remote Supabase/Vercel project. Production migrations and production data changes require separate explicit approval.

## Install and run

Install from the committed lockfile:

```powershell
npm ci
npm run preflight
```

The browser and public server verifier use only four public configuration variables:

- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for server verification;
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the browser.

Never place a service-role, secret, or private key in a `VITE_*` variable. `.env.example` contains placeholders only.

Catalog administration and planner persistence additionally require `SUPABASE_SECRET_KEY` in the server Function runtime. The value is never committed, exposed through `VITE_*`, accepted from a request, or created by repository scripts. Admin endpoints first verify the caller and role with public Auth before creating the narrowly granted client. Planner endpoints load the owned household/catalog through the caller's access token and RLS before lazily creating a secret client only for the restricted persistence RPC. Shopping-list reads use the signed-in user's owner scope; browser code can mutate only the separate checked state through the narrow check-state RPC.

With local Docker available, start and reset the ephemeral local stack, then launch Vite with values read directly from `supabase status -o env`:

```powershell
npm run supabase:start
npm run supabase:reset
node scripts/local-supabase-env.mjs -- npm run dev
```

The wrapper fails closed unless the Supabase API URL is loopback-only, passes only the public variables to its child command, and does not print the public key. Stop the local stack without retaining test data:

```powershell
npm run supabase:stop
```

## Routes and household semantics

| Route                              | Purpose                                                              |
| ---------------------------------- | -------------------------------------------------------------------- |
| `/sign-up`, `/sign-in`             | Supabase email/password Auth without household-member accounts       |
| `/onboarding`                      | Five-step mobile household setup                                     |
| `/household`                       | Authoritative saved household summary                                |
| `/settings/household`              | Version-checked editing of the single owned household                |
| `/pantry`                          | Owner-scoped current pantry amounts used by future plan revisions    |
| `/plan`                            | Seven primary meals, exact weekly estimate, and one-day replacement  |
| `/shopping/:planId`                | Current authoritative shopping list for an owned plan                |
| `/shopping/:planId?revisionId=...` | Exact historical revision read when Phase 4 shopping evidence exists |

Children are counts in approved age bands, never user accounts. The application does not collect names, birth dates, sex, weight, diagnoses, health fields, or free-text dietary rules.

Allergies and exclusions are canonical hard rules. Preferences are canonical soft rules. A hard rule and preference with the same target cannot coexist. `allergen_other` is structured unsupported intent with fixed guidance; no AI or free text interprets it, and the UI never promises allergy safety.

The weekly budget applies only to the seven planned primary meals. It does not cover breakfast, snacks, drinks, pantry replenishment, or other meals.

## Catalog, planner, and shopping semantics

- Published food facts, their nutrients, allergen assessments, conversions, and dietary/category lineage are immutable. Published recipe versions pin both stable `food_id` and exact `food_fact_version_id` for every consumed ingredient.
- Recipe instructions are bounded Vietnamese editorial text. They never create ingredients and are never interpreted by AI, NLP, or keyword matching for allergens, eligibility, nutrition, quantity, conversion, cost, or shopping consolidation.
- Unknown or incomplete allergen, nutrient, conversion, or price lineage fails closed. Explicit nutrient zero is valid data; missing data is not replaced with zero.
- Prices aged 0–30 days are current. Prices aged 31–90 days remain usable with `STALE_PRICE` and their observation date is shown to the user. Older, missing, or future prices fail rather than producing a partial or zero-valued list.
- Weekly budget selection and Phase 4 shopping use the same deterministic purchase-basket evidence. Requirements are aggregated by stable food identity before exact package/increment rounding; `calculatePurchaseBasket` remains the sole package-rounded cost algorithm.
- A region's current price-book pointer controls discovery only. Published historical books and exact revision evidence remain immutable and readable by exact identity after retirement.

The planner selects exactly seven curated primary cooked family meals, one for each Monday-start day. Eligibility is resolved before scoring. Search is deterministic but intentionally bounded; failure copy never claims global infeasibility.

Budget is not part of quality scoring. If any discovered complete plan is within budget, over-budget finalists are discarded. Otherwise the minimum exact basket cost wins first and quality only breaks equal-cost ties. An over-budget result is still a successful plan and reports exact estimate, budget, and overage.

Replacement locks six exact day/version tuples, recomputes the complete weekly basket, and creates a new immutable seven-item revision. Every new Phase 4 generation, regeneration, and replacement uses the shared `planner-engine-v2` production constant. Historical Phase 3 `planner-engine-v1` revisions are never rewritten.

### Shopping-list authority

A shopping list belongs to one exact `meal_plan_revision_id`, not to mutable current catalog state. The immutable calculation snapshot contains the label-free shopping projection and exact provenance. Relational shopping rows are persisted in the same authoritative transaction as the revision and plan items.

For a ready Phase 4 revision, the application exposes:

- one consolidated line per compatible stable food identity;
- canonical required, package, purchase, and leftover quantities;
- exact price/book/fact lineage and estimated line cost;
- deterministic grocery category grouping;
- exact meal/recipe/ingredient/fact sources behind each line;
- stale-price warnings with observation dates;
- a separate mutable `checked` state that is not part of the immutable calculation fingerprint.

Checking an item never changes quantity, package count, price, provenance, budget, fingerprint, or pantry state. Check state is carried into a replacement revision only when the stable food, canonical base unit, and canonical required amount remain byte-equivalent under the shopping rules.

### Pantry authority

Pantry stores one current owner-scoped quantity per `(household_id, food_id)`. Each generation or replacement copies the exact normalized pantry snapshot into immutable plan evidence. Shopping deduction is deterministic and happens before package rounding: `gross required = pantry deducted + purchase required`; only the remaining purchase requirement is rounded to purchasable packages. A fully covered line can therefore require zero packages and zero purchase cost.

Current pantry edits affect only future calculations. They never rewrite an existing plan revision or its shopping list. Shopping rows persist both `pantryDeductedBaseQuantity` and `purchaseRequiredBaseQuantity`, so every deduction remains traceable after the current pantry changes. Checking a shopping item does not decrement pantry automatically. Phase 5 intentionally has no inventory lots, expiry dates, barcode/OCR, retailer ordering, receipt ingestion, or background inventory jobs.

A one-meal replacement creates a complete new revision/list and never mutates the prior revision/list. An explicit historical Phase 4 revision therefore remains reproducible even after the current plan advances.

Historical Phase 3 revisions created before the shopping projection existed are not reconstructed from current catalog data. Reading one returns the typed `SHOPPING_LIST_NOT_AVAILABLE_FOR_LEGACY_REVISION` state; the UI explains that a new authoritative plan/revision is required instead of fabricating historical shopping evidence.

The authoritative total invariant is:

```text
meal_plans.total_estimated_cost_vnd
== current meal_plan_revisions.total_estimated_cost_vnd
== calculation_snapshot.purchaseBasket.totalEstimatedCostVnd
== calculation_snapshot.shoppingList.totalEstimatedCostVnd
== persisted shopping_list total
== sum(persisted shopping_list lines)
```

Mutable food/recipe/meal-option display labels are presentation data only. They are excluded from canonical planner/shopping snapshots and calculation fingerprints.

## Module boundaries

Cross-boundary imports use the `@/...` alias. Relative imports are limited to files within the same boundary.

| From             | May depend on                                       | Must not depend on                                                                                               |
| ---------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `domain`         | Other `domain` modules and pure utilities           | React, `app`, `features`, `application`, `infrastructure`, Supabase, Vercel, browser APIs, environment variables |
| `application`    | `domain` and application-owned ports                | React, `app`, `features`, concrete `infrastructure` adapters                                                     |
| `infrastructure` | `application`, `domain`, platform SDKs              | `app`, `features`, product UI                                                                                    |
| `features`       | `application`, `domain`, approved app UI primitives | Concrete `infrastructure`; feature-to-feature internals                                                          |
| `app`            | Browser-side modules needed for composition         | Server-only `api` modules and `infrastructure/server`                                                            |
| `api`            | `application`, `domain`, server infrastructure      | React, browser-only `app` or `features` modules                                                                  |

Domain validation is framework-independent. PostgreSQL constraints, constraint triggers, grants, and RLS remain authoritative. The browser uses no service-role access and has no authoritative shopping arithmetic/provenance DML.

## Verification

Run the mandatory non-database gate:

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
```

`npm run preflight` records exactly one capability result:

- `LOCAL_DB_VERIFICATION_AVAILABLE` — run the local database sequence below;
- `LOCAL_DB_VERIFICATION_UNAVAILABLE` — continue non-database work and require exact-final-HEAD CI database success.

When Docker is available, the authoritative local database/Auth/browser sequence is:

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
npm run test:integration:pantry
npm run test:e2e:onboarding
npm run test:e2e:planner
npm run test:e2e:shopping
npm run test:e2e:pantry
npm run supabase:stop
```

`supabase:reset` is explicitly local-only. Never substitute a remote production or staging database. `src/infrastructure/supabase/database.types.ts` is generated from the clean local migration state; `db:types:check` rejects drift.

The ordinary `test:e2e` command proves Vite-preview SPA/deep-link behavior only. Docker-backed integration is authoritative for local Auth, RPC, RLS, catalog, planner persistence, shopping persistence, revision history, and owner isolation. The planner and shopping Playwright journeys use real local Auth/household persistence plus deterministic intercepted planner/shopping responses to verify browser interaction; they do not replace the database integration gates.

## GitHub Actions evidence

CI keeps independent `web` and `database` jobs. The database job uses GitHub-hosted Docker to run a clean Supabase start/reset, fatal SQL lint, inherited plus Phase 5 pgTAP/RLS/integrity tests, generated-type drift, Auth/household/catalog/admin/planner/shopping/pantry integration, onboarding/planner/shopping/pantry browser journeys, artifact generation, and always-run cleanup. It uses no remote database, deployment environment, or application secret.

Match evidence to the exact final Phase 5 SHA:

```powershell
$phase5Head = git rev-parse HEAD
$phase5Run = gh run list --workflow ci.yml --branch codex/phase-5-pantry --commit $phase5Head --limit 1 --json databaseId,headSha,status,conclusion,url | ConvertFrom-Json
if ($phase5Run.Count -ne 1 -or $phase5Run.headSha -ne $phase5Head) { throw 'No CI run found for exact Phase 5 HEAD' }
gh run watch $phase5Run.databaseId --exit-status
$phase5Jobs = (gh run view $phase5Run.databaseId --json jobs | ConvertFrom-Json).jobs
if (($phase5Jobs | Where-Object name -eq 'web').conclusion -ne 'success') { throw 'CI web job did not pass' }
if (($phase5Jobs | Where-Object name -eq 'database').conclusion -ne 'success') { throw 'CI database job did not pass' }
```

Record `PHASE_5_PASS` only when all mandatory non-database gates pass, the exact final branch HEAD is pushed, generated database types are clean, and database/RLS/integration/browser verification passes locally or in exact-final-HEAD GitHub Actions. Otherwise record `PHASE_5_BLOCKED` with the exact failed or pending gate.

## Intentionally deferred

Phase 5 does **not** add pantry lots or expiry tracking, automatic pantry consumption, custom/manual grocery items, retailer/live-price comparison, marketplace flows, delivery, payment, receipts, barcode/OCR, notifications, collaboration/offline sync, or AI/ML shopping behavior. Those remain explicit later-phase work.
