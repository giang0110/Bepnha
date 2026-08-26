# BepNha

BepNha is a deterministic meal-planning application for Vietnamese households. Phase 3 adds curated immutable meal-option versions, server-authoritative seven-day planning, package-rounded weekly basket costing, immutable plan revisions, and deterministic one-meal replacement. It still contains no shopping-list persistence or UI, pantry, delivery, payment, or AI behavior.

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

Catalog administration and planner persistence additionally require `SUPABASE_SECRET_KEY` in the server Function runtime. The value is never committed, exposed through `VITE_*`, accepted from a request, or created by repository scripts. Admin endpoints first verify the caller and role with public Auth before creating the narrowly granted client. Planner endpoints load the owned household/catalog through the caller's access token and RLS before lazily creating a secret client only for `persist_meal_plan_revision`. Administrator assignment and removal remain trusted-operations-only; there is no client API for changing roles.

With local Docker available, start and reset the ephemeral local stack, then launch Vite with values read directly from `supabase status -o env`:

```powershell
npm run supabase:start
npm run supabase:reset
node scripts/local-supabase-env.mjs -- npm run dev
```

The wrapper fails closed unless the Supabase API URL is loopback-only, passes only the four public variables to its child command, and does not print the public key. Stop the local stack without retaining test data:

```powershell
npm run supabase:stop
```

## Household routes and data semantics

| Route                  | Purpose                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| `/sign-up`, `/sign-in` | Supabase email/password Auth without household-member accounts      |
| `/onboarding`          | Five-step mobile household setup                                    |
| `/household`           | Authoritative saved household summary                               |
| `/settings/household`  | Version-checked editing of the single owned household               |
| `/plan`                | Seven primary meals, exact weekly estimate, and one-day replacement |

Children are counts in approved age bands, never user accounts. The application does not collect names, birth dates, sex, weight, diagnoses, health fields, or free-text dietary rules.

Allergies and exclusions are canonical hard rules. Preferences are canonical soft rules. A hard rule and preference with the same target cannot coexist. `allergen_other` is structured unsupported intent with fixed guidance; no AI or free text interprets it, and the UI never promises allergy safety.

The weekly budget applies only to the seven planned primary meals. It does not cover breakfast, snacks, drinks, pantry replenishment, or other meals.

## Catalog and planner semantics

- Published food facts, their nutrients, allergen assessments, conversions, and dietary/category lineage are immutable. Published recipe versions pin both stable `food_id` and exact `food_fact_version_id` for every consumed ingredient, including oil, sauce, seasoning, garnish, and finishing ingredients.
- Recipe instructions are bounded Vietnamese editorial text. They never create ingredients and are never interpreted by AI, NLP, or keyword matching for allergens, eligibility, nutrition, quantity, conversion, or cost.
- Unknown or incomplete allergen, nutrient, conversion, or price lineage fails closed. Explicit nutrient zero is valid data; missing data is not replaced with zero.
- Prices aged 0–30 days are current. Prices aged 31–90 days remain usable with `STALE_PRICE`; older, missing, or future prices fail. These thresholds are copied from versioned deterministic configuration.
- Phase 2 recipe consumption cost remains proportional. Phase 3 weekly budget selection uses one shared deterministic purchase-basket primitive: requirements are aggregated by stable food identity before exact package/increment rounding. The basket snapshot is calculation evidence, not a Phase 4 shopping list.
- A region's current price-book pointer controls discovery only. Published historical books remain immutable and readable by exact ID, including after retirement, so saved calculation inputs remain reproducible.

The planner selects exactly seven curated primary cooked family meals, one for each Monday-start day. It never composes arbitrary recipes. Eligibility is resolved before scoring: incomplete publication/fact/allergen/category/conversion/nutrition/price lineage, hard exclusions, elapsed-time violations, or unusable prices fail closed. Primary-protein repetition is a monotonic soft diversity penalty, never a hard rejection; exact meal-option identity repetition and adjacent reuse of the exact same main recipe version remain hard duplicate prevention.

Search is deterministic but intentionally bounded to 500 canonical candidates and a frontier of at most 250 states, formed by a stable union of up to 125 quality-oriented and 125 cost-oriented states. Failure copy says only that no complete plan was found within the deterministic search; it never claims global infeasibility.

Budget is not part of quality scoring. If any discovered complete plan is within budget, all over-budget finalists are discarded. Otherwise the minimum exact basket cost wins first and quality only breaks equal-cost ties. The resulting `PLAN_OVER_BUDGET` plan is successful and includes exact budget, estimate, and overage. Prices aged 31–90 days remain usable with `STALE_PRICE`; missing, future, or older prices are unusable.

Replacement locks six exact day/version tuples, recomputes the full weekly basket and diversity, and creates a new immutable seven-item revision. Persisted input/calculation snapshots pin exact meal-option, recipe, food-fact, price, config, date, and fingerprint evidence. Current-pointer or retirement changes cannot rewrite historical revisions.

The authoritative invariant is:

```text
meal_plans.total_estimated_cost_vnd
== current meal_plan_revisions.total_estimated_cost_vnd
== calculation_snapshot.purchaseBasket.totalEstimatedCostVnd
== sum(calculation_snapshot.purchaseBasket.lines[*].lineCostVnd)
```

Phase 4 must reuse this basket primitive/snapshot when it adds shopping-list persistence; it must not create a second cost implementation.

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

Domain validation is framework-independent. PostgreSQL constraints/constraint triggers and RLS remain authoritative for RPC and intentionally granted direct Data API writes. The browser uses no service-role access.

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
- `LOCAL_DB_VERIFICATION_UNAVAILABLE` — continue non-database work, record `DATABASE_RLS_GATE_PENDING_CI`, and require exact-final-HEAD CI database success.

When Docker is available, the authoritative local database/Auth sequence is:

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

`supabase:reset` is explicitly local-only. Never substitute a remote production or staging database. `src/infrastructure/supabase/database.types.ts` is generated from the clean local migration state; `db:types:check` rejects drift.

The ordinary `test:e2e` command proves Vite-preview SPA/deep-link behavior only. Hosted Vercel Function routing is covered by configuration/handler tests, not claimed as deployed integration coverage. Docker-backed integration invokes the planner handlers against real local Auth, RPC, RLS, catalog and persistence. The planner Playwright journey uses real local Auth/household persistence and intercepted deterministic planner responses to verify browser interaction; it does not replace the planner API integration gate.

## GitHub Actions evidence

CI keeps independent `web` and `database` jobs. The database job uses GitHub-hosted Docker to run Supabase start/reset, SQL lint, inherited plus Phase 3 pgTAP/RLS/integrity, generated-type drift, Auth/household/catalog/admin/planner integration, and onboarding/planner browser journeys. It uses no remote database, deployment environment, or application secret.

Match evidence to the exact final Phase 3 SHA:

```powershell
$phase3Head = git rev-parse HEAD
$phase3Run = gh run list --workflow ci.yml --branch codex/phase-3-planner --commit $phase3Head --limit 1 --json databaseId,headSha,status,conclusion,url | ConvertFrom-Json
if ($phase3Run.Count -ne 1 -or $phase3Run.headSha -ne $phase3Head) { throw 'No CI run found for exact Phase 3 HEAD' }
gh run watch $phase3Run.databaseId --exit-status
$phase3Jobs = (gh run view $phase3Run.databaseId --json jobs | ConvertFrom-Json).jobs
if (($phase3Jobs | Where-Object name -eq 'web').conclusion -ne 'success') { throw 'CI web job did not pass' }
if (($phase3Jobs | Where-Object name -eq 'database').conclusion -ne 'success') { throw 'CI database job did not pass' }
```

Record `PHASE_3_PASS` only when all mandatory local non-database gates pass, the exact HEAD is pushed, and database/RLS/integration verification passes locally or in exact-HEAD GitHub Actions. Otherwise record `PHASE_3_BLOCKED` with the exact failed or pending gate.

## Intentionally deferred

Phase 4+ owns consolidated shopping-list persistence/UI, grocery categories/checkoff/purchased state, pantry deduction and waste-reduction UX, delivery/payment/marketplace, and any future AI interface. Phase 3 exposes no shopping-list or pantry behavior.
