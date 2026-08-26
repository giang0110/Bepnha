# BepNha

BepNha is a deterministic meal-planning application for Vietnamese households. Phase 2 adds the food and recipe calculation foundation: immutable published food facts and recipe versions, structured ingredient lineage, deterministic portion/nutrition/consumption-cost calculations, versioned price freshness, and a trusted catalog administration API. It still contains no weekly planner, purchase-basket shopping calculation, pantry, or AI behavior.

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

`POST /api/admin/catalog` additionally requires `SUPABASE_SECRET_KEY` in the server Function runtime. The value is never committed, exposed through `VITE_*`, accepted from a request, or created by repository scripts. The endpoint first verifies the caller with the public Auth client and creates the narrowly granted secret client only for a user whose signed `app_metadata.role` is `admin`. Administrator assignment and removal remain trusted-operations-only; there is no client API for changing roles.

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

| Route                  | Purpose                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `/sign-up`, `/sign-in` | Supabase email/password Auth without household-member accounts |
| `/onboarding`          | Five-step mobile household setup                               |
| `/household`           | Authoritative saved household summary                          |
| `/settings/household`  | Version-checked editing of the single owned household          |

Children are counts in approved age bands, never user accounts. The application does not collect names, birth dates, sex, weight, diagnoses, health fields, or free-text dietary rules.

Allergies and exclusions are canonical hard rules. Preferences are canonical soft rules. A hard rule and preference with the same target cannot coexist. `allergen_other` is structured unsupported intent with fixed guidance; no AI or free text interprets it, and the UI never promises allergy safety.

The weekly budget applies only to the seven planned primary meals. It does not cover breakfast, snacks, drinks, pantry replenishment, or other meals.

## Phase 2 catalog semantics

- Published food facts, their nutrients, allergen assessments, conversions, and dietary/category lineage are immutable. Published recipe versions pin both stable `food_id` and exact `food_fact_version_id` for every consumed ingredient, including oil, sauce, seasoning, garnish, and finishing ingredients.
- Recipe instructions are bounded Vietnamese editorial text. They never create ingredients and are never interpreted by AI, NLP, or keyword matching for allergens, eligibility, nutrition, quantity, conversion, or cost.
- Unknown or incomplete allergen, nutrient, conversion, or price lineage fails closed. Explicit nutrient zero is valid data; missing data is not replaced with zero.
- Prices aged 0–30 days are current. Prices aged 31–90 days remain usable with `STALE_PRICE`; older, missing, or future prices fail. These thresholds are copied from versioned deterministic configuration.
- Phase 2 cost is proportional recipe consumption cost. Exact package-rounded purchase-basket cost and the authoritative weekly budget comparison belong to Phase 3/4 and are not inferred early.
- A region's current price-book pointer controls discovery only. Published historical books remain immutable and readable by exact ID, including after retirement, so saved calculation inputs remain reproducible.

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
npm run test:e2e:onboarding
npm run supabase:stop
```

`supabase:reset` is explicitly local-only. Never substitute a remote production or staging database. `src/infrastructure/supabase/database.types.ts` is generated from the clean local migration state; `db:types:check` rejects drift.

The ordinary `test:e2e` command proves Vite-preview SPA/deep-link behavior only. Hosted Vercel Function routing is covered by configuration/handler tests, not claimed as deployed integration coverage. The Docker-backed onboarding command proves real local Auth, RPC, RLS, persistence, and editing.

## GitHub Actions evidence

CI keeps independent `web` and `database` jobs. The database job uses GitHub-hosted Docker to run Supabase start/reset, SQL lint, pgTAP/RLS, generated-type drift, public-key-only integration tests, and the real onboarding browser journey. It uses no remote database, deployment environment, or application secret.

Match evidence to the exact final Phase 2 SHA:

```powershell
$phase2Head = git rev-parse HEAD
$phase2Run = gh run list --workflow ci.yml --branch codex/phase-2-food-recipe --commit $phase2Head --limit 1 --json databaseId,headSha,status,conclusion,url | ConvertFrom-Json
if ($phase2Run.Count -ne 1 -or $phase2Run.headSha -ne $phase2Head) { throw 'No CI run found for exact Phase 2 HEAD' }
gh run watch $phase2Run.databaseId --exit-status
$phase2Jobs = (gh run view $phase2Run.databaseId --json jobs | ConvertFrom-Json).jobs
if (($phase2Jobs | Where-Object name -eq 'web').conclusion -ne 'success') { throw 'CI web job did not pass' }
if (($phase2Jobs | Where-Object name -eq 'database').conclusion -ne 'success') { throw 'CI database job did not pass' }
```

Record `PHASE_2_PASS` only when all mandatory local non-database gates pass, the exact HEAD is pushed, and database/RLS/integration verification passes locally or in exact-HEAD GitHub Actions. Otherwise record `PHASE_2_BLOCKED` with the exact failed or pending gate.

## Intentionally deferred

Phase 3+ owns candidate selection, seven-day meal planning, budget fallback, meal replacement, shopping-list package rounding, pantry/waste reduction, and any future AI interface. Phase 2 code must not infer or simulate those capabilities.
