# BepNha

BepNha is a deterministic meal-planning application for Vietnamese households. Phase 1 provides Supabase Auth, one owned household per user, grouped household members, structured exclusions/preferences, a seven-primary-meal weekly budget, maximum elapsed cooking time, onboarding, and household settings. It does not contain foods, recipes, nutrition, prices, planning, shopping, pantry, admin catalog, or AI behavior.

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

The app uses only four public configuration variables:

- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for server verification;
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the browser.

Never place a service-role, secret, or private key in a `VITE_*` variable. `.env.example` contains placeholders only.

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

## Phase 1 routes and data semantics

| Route                  | Purpose                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `/sign-up`, `/sign-in` | Supabase email/password Auth without household-member accounts |
| `/onboarding`          | Five-step mobile household setup                               |
| `/household`           | Authoritative saved household summary                          |
| `/settings/household`  | Version-checked editing of the single owned household          |

Children are counts in approved age bands, never user accounts. The application does not collect names, birth dates, sex, weight, diagnoses, health fields, or free-text dietary rules.

Allergies and exclusions are canonical hard rules. Preferences are canonical soft rules. A hard rule and preference with the same target cannot coexist. `allergen_other` is structured unsupported intent with fixed guidance; no AI or free text interprets it, and the UI never promises allergy safety.

The weekly budget applies only to the seven planned primary meals. It does not cover breakfast, snacks, drinks, pantry replenishment, or other meals.

## Module boundaries

Cross-boundary imports use the `@/...` alias. Relative imports are limited to files within the same boundary.

| From             | May depend on                                       | Must not depend on                                                                                               |
| ---------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `domain`         | Other `domain` modules and pure utilities           | React, `app`, `features`, `application`, `infrastructure`, Supabase, Vercel, browser APIs, environment variables |
| `application`    | `domain` and application-owned ports                | React, `app`, `features`, concrete `infrastructure` adapters                                                     |
| `infrastructure` | `application`, `domain`, platform SDKs              | `app`, `features`, product UI                                                                                    |
| `features`       | `application`, `domain`, approved app UI primitives | Concrete `infrastructure`; feature-to-feature internals                                                          |
| `app`            | Browser-side modules needed for composition         | Server-only `api` modules                                                                                        |
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
npm run test:e2e:onboarding
npm run supabase:stop
```

`supabase:reset` is explicitly local-only. Never substitute a remote production or staging database. `src/infrastructure/supabase/database.types.ts` is generated from the clean local migration state; `db:types:check` rejects drift.

The ordinary `test:e2e` command proves Vite-preview SPA/deep-link behavior only. Hosted Vercel Function routing is covered by configuration/handler tests, not claimed as deployed integration coverage. The Docker-backed onboarding command proves real local Auth, RPC, RLS, persistence, and editing.

## GitHub Actions evidence

CI keeps independent `web` and `database` jobs. The database job uses GitHub-hosted Docker to run Supabase start/reset, SQL lint, pgTAP/RLS, generated-type drift, public-key-only integration tests, and the real onboarding browser journey. It uses no remote database, deployment environment, or application secret.

Match evidence to the exact final Phase 1 SHA:

```powershell
$phase1Head = git rev-parse HEAD
$phase1Run = gh run list --workflow ci.yml --branch codex/phase-1-household --commit $phase1Head --limit 1 --json databaseId,headSha,status,conclusion,url | ConvertFrom-Json
if ($phase1Run.Count -ne 1 -or $phase1Run.headSha -ne $phase1Head) { throw 'No CI run found for exact Phase 1 HEAD' }
gh run watch $phase1Run.databaseId --exit-status
$phase1Jobs = (gh run view $phase1Run.databaseId --json jobs | ConvertFrom-Json).jobs
if (($phase1Jobs | Where-Object name -eq 'web').conclusion -ne 'success') { throw 'CI web job did not pass' }
if (($phase1Jobs | Where-Object name -eq 'database').conclusion -ne 'success') { throw 'CI database job did not pass' }
```

Record `PHASE_1_PASS` only when all mandatory local non-database gates pass, the exact HEAD is pushed, and database/RLS verification passes locally or in exact-HEAD GitHub Actions. Otherwise record `PHASE_1_BLOCKED` with the exact failed or pending gate.

## Intentionally deferred

Phase 2+ owns foods, recipes, immutable food facts, nutrients, allergens/catalog lineage, unit conversions, prices, portion/cost engines, meal planning, shopping lists, pantry, admin catalog, and any future AI interface. Phase 1 code must not infer or simulate those capabilities.
