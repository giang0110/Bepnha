# BepNha

BepNha is being built planner-first: its future meal-planning decisions must be deterministic, testable domain logic. An AI model must never author or override serving quantities, nutrition, prices, shopping quantities, allergy safety, meal eligibility, or authoritative budgets.

Phase 0 establishes the development and verification foundation only. It contains no product functionality, no product tables, and no deployment step. Supabase remains the approved backend; this phase introduces neither Turso nor another database.

## Prerequisites

- **Node 24** is mandatory (`>=24 <25`). Use the version recorded by the project before installing dependencies.
- npm is required.
- Docker is an optional local _database-verification capability_, not an optional database/RLS gate. When local Docker is unavailable, GitHub Actions performs that authoritative gate.

## Install and run

Install from the committed lockfile:

```powershell
npm ci
```

Create a public local environment file from the template. Do not add real credentials or any secret to `.env.example`.

```powershell
Copy-Item .env.example .env
```

Start local development, run tests, and create a production build:

```powershell
npm run dev
npm run test
npm run build
```

The only client environment values are public configuration. Server credentials (including any service-role credential) are forbidden in client environment configuration and source.

## Module boundaries

Cross-boundary imports use the `@/...` alias. Relative imports are limited to files within the same boundary.

| From             | May depend on                                              | Must not depend on                                                                                               |
| ---------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `domain`         | Other `domain` modules and pure language/library utilities | React, `app`, `features`, `application`, `infrastructure`, Supabase, Vercel, browser APIs, environment variables |
| `application`    | `domain` and application-owned ports                       | React, `app`, `features`, concrete `infrastructure` adapters                                                     |
| `infrastructure` | `application`, `domain`, platform SDKs                     | `app`, `features`, product UI                                                                                    |
| `features`       | `application`, `domain`, approved app UI primitives        | Concrete `infrastructure`; feature-to-feature internals                                                          |
| `app`            | All browser-side modules needed for composition            | Server-only `api` modules                                                                                        |
| `api`            | `application`, `domain`, server-side `infrastructure`      | React, browser-only `app` or `features` modules                                                                  |

`app` is the composition root and shell, `features` will hold vertical presentation slices, `application` owns use cases and ports, `domain` holds pure deterministic rules, and `infrastructure` implements application ports. The `api` directory is for trusted HTTP entry points and never imports React or browser-only modules.

## Local verification

Run the non-database Phase 0 gate from a fresh install:

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

`npm run preflight` validates Node 24, npm, and the locally installed Supabase CLI, then prints exactly one capability result:

- `LOCAL_DB_VERIFICATION_AVAILABLE` — Docker is usable. Run the local database/RLS sequence below and record `DATABASE_RLS_GATE_PASS_LOCAL` only when every command succeeds.
- `LOCAL_DB_VERIFICATION_UNAVAILABLE` — Docker cannot be used locally. Continue the non-database work without running local Supabase commands, record `DATABASE_RLS_GATE_PENDING_CI`, and require the GitHub Actions `database` job for the final commit to pass.

When local capability is available, use the local Supabase sequence:

```powershell
npm run preflight:db
npm run supabase:start
npm run supabase:reset
npm run supabase:lint
npm run supabase:test
npm run supabase:stop
```

`npm run supabase:reset` runs `supabase db reset --local`. It is local-only: never use it against a remote or production database.

## GitHub Actions database verification

When the local result is `LOCAL_DB_VERIFICATION_UNAVAILABLE`, a successful final-commit GitHub Actions `database` job is mandatory. A verification push is not a deployment and does not make Phase 0 complete by itself. With GitHub CLI available, match the run to the exact current SHA:

```powershell
$phase0Head = git rev-parse HEAD
$phase0Run = gh run list --workflow ci.yml --branch codex/phase-0-foundation --commit $phase0Head --limit 1 --json databaseId,headSha,status,conclusion,url | ConvertFrom-Json
if ($phase0Run.Count -ne 1 -or $phase0Run.headSha -ne $phase0Head) { throw 'No CI run found for exact Phase 0 HEAD' }
gh run watch $phase0Run.databaseId --exit-status
$phase0Jobs = (gh run view $phase0Run.databaseId --json jobs | ConvertFrom-Json).jobs
if (($phase0Jobs | Where-Object name -eq 'web').conclusion -ne 'success') { throw 'CI web job did not pass' }
if (($phase0Jobs | Where-Object name -eq 'database').conclusion -ne 'success') { throw 'CI database job did not pass' }
```

The GitHub-hosted database job runs the required Docker-backed Supabase start, clean reset, SQL lint, pgTAP/RLS tests, and cleanup. Never treat that job as skipped, optional, or assumed.

## Phase 0 status

Record `PHASE_0_PASS` only when every mandatory local non-database command passes and the database/RLS gate passes either as `DATABASE_RLS_GATE_PASS_LOCAL` or through a successful GitHub Actions `database` job for the exact final HEAD.

Record `PHASE_0_BLOCKED` when any required local gate fails, or when the database/RLS gate has not passed in either approved environment. `LOCAL_DB_VERIFICATION_UNAVAILABLE` alone is not `PHASE_0_BLOCKED`; it makes exact-final-HEAD GitHub Actions database evidence required.
