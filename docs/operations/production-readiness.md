# BepNha Production Readiness Runbook

## Release authority and scope

BepNha's deterministic domain and persistence rules are authoritative. The planner, serving quantities, nutrition, prices, shopping quantities, allergy/exclusion safety, meal eligibility, pantry subtraction, budget evaluation, and immutable revision semantics must never be authored or overridden by Gemini.

The Gemini assistant is optional and advisory. It may explain an authoritative plan or propose a day for deterministic replacement preview, but it never chooses the replacement meal, never applies a replacement automatically, and never writes directly to the database.

Production configuration, database migration, deployment, and catalog mutation are explicit operator actions. Never run a remote reset, test fixture, destructive cleanup, or guessed-target deployment.

## Repository and governance

Canonical repository: `giang0110/Bepnha`.

Production changes should enter `main` through a pull request. Required governance target:

- pull request required for changes to `main`;
- canonical CI jobs `web` and `database` required before merge;
- force pushes disabled;
- branch deletion disabled.

As of the 2026-09-04 Phase 8 preflight, `main` remains `protected: false`. The authenticated GitHub account has repository admin permission, but the connected GitHub action surface exposes protection/ruleset reads and no branch-protection write action. Until an operator enables the rules in GitHub or explicitly accepts this exact blocker, record `MAIN_GOVERNANCE_BLOCKED`.

After the repository transfer, local clones should use:

```powershell
git remote set-url origin https://github.com/giang0110/Bepnha.git
```

## Environment separation and secrets

Use separate development/test and production credentials. Never reuse production credentials in local test suites or CI fixtures.

Public configuration:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Server-only configuration may additionally include:

- `SUPABASE_SECRET_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `ASSISTANT_RATE_LIMIT_BURST`
- `ASSISTANT_RATE_LIMIT_DAILY`

Never expose a Supabase secret/service-role key or Gemini key through `VITE_*`, source control, logs, screenshots, issue/PR text, telemetry, or client responses.

Run `npm run env:check`, `npm run secrets:check`, and `npm run security:dependencies` before promotion. Do not use `npm audit fix --force` to silence a gate.

## Exact-head repository verification

From the exact candidate SHA:

```powershell
npm ci
npx playwright install chromium
npm run verify:release:web
git diff --check
```

When Docker/local Supabase is available:

```powershell
npm run supabase:start
try {
  npm run verify:release:db
} finally {
  npm run supabase:stop
}
```

Database verification commands are local-only. `supabase db reset --local`, catalog-readiness fixtures, E2E users, and cleanup must never be pointed at production.

Phase 8 repository gates additionally require:

- statements coverage >= 78%;
- branches >= 70%;
- functions >= 84%;
- lines >= 82%;
- no built JavaScript chunk > 500000 bytes minified;
- assistant rate-limit tests green;
- production runtime unable to fall back to a per-instance in-memory assistant limiter.

The final CI evidence must be for the exact SHA being promoted. An ancestor run is not sufficient.

## Production Supabase target

Resolved production project as of 2026-09-04:

- name: `Bepnha`;
- project ref: `vkrqzwlpneocgjwhqbsl`;
- region: `ap-southeast-1`;
- PostgreSQL engine: 17;
- status at preflight: `ACTIVE_HEALTHY`;
- API URL: `https://vkrqzwlpneocgjwhqbsl.supabase.co`.

The repository's `supabase/config.toml` uses `bepnha-local`; that identifier is local-only and must never be treated as the production ref.

At the initial read-only production preflight, the production project had zero recorded migrations and zero `public` tables. The repository `main` contains eight ordered migration files:

1. `20260825000000_phase_0_security_baseline.sql`
2. `20260825010000_phase_1_household.sql`
3. `20260826000000_qualify_household_rpc_constraints.sql`
4. `20260826010000_phase_2_food_recipe.sql`
5. `20260826020000_phase_3_planner.sql`
6. `20260827000000_phase_4_shopping_list.sql`
7. `20260901000000_phase_5_pantry.sql`
8. `20260902000000_phase_5_pantry_shopping_trace.sql`

Therefore the first production schema operation is a bootstrap of the complete reviewed migration chain, not an incremental drift repair. Do not apply any migration until the operator explicitly authorizes mutation of project `vkrqzwlpneocgjwhqbsl`.

After an authorized migration, verify read-only before any catalog mutation:

- remote migration history exactly matches the eight repository migrations;
- expected public tables/functions exist;
- generated database types remain compatible;
- Supabase Security Advisor is reviewed;
- Supabase Performance Advisor is reviewed;
- no test users, launch-readiness fixtures, local reset artifacts, or cleanup jobs were run remotely.

## Production catalog readiness

Schema/reference migrations create taxonomy and persistence structures but do not populate a launch-ready food/recipe/meal-option catalog.

The integration test `tests/integration/catalog-readiness.integration.test.ts` deliberately creates curated fixtures, food facts, recipes, prices, meal options, users, and households. It is a local/CI test harness and must never run against production.

Production readiness must use real curated catalog data and read-only evaluation. Required representative scenarios need at least 21 eligible meal options, adequate primary-protein-group capacity, and complete lineage/usable price coverage. Vegetarian scenarios use the narrower vegetarian protein-capacity rule.

Do not lower deterministic thresholds or weaken hard rules to make production pass. If production has insufficient catalog data, record a catalog blocker and curate/publish real data through the reviewed catalog-admin path under separate mutation authorization.

## Supabase Free-plan backup and recovery

The resolved Supabase organization is on the Free plan. Supabase documentation states that scheduled daily backups are provided for Pro/Team/Enterprise projects and recommends Free-plan projects regularly export logical backups with `supabase db dump` and retain them off-site.

Because the project was empty at the initial preflight, there is no application data to preserve before the first schema bootstrap. Once production contains schema/catalog/user data, the production operator must establish an off-site logical backup cadence before considering launch complete.

Minimum ownership requirement:

- owner: the repository/project operator (`giang0110`) unless explicitly delegated;
- create logical dumps using a current supported Supabase CLI/Postgres-compatible procedure;
- store backups outside the Supabase project;
- document retention and encryption/access controls;
- perform and record a restore drill into a disposable/non-production database;
- never use a production reset as a restore test.

Deleting a Supabase project is irreversible and removes project data/backups. Project deletion is never a routine troubleshooting action.

## Gemini production rate-limit gate

Default assistant limits are:

- 5 accepted requests per rolling 60 seconds per authenticated user;
- 50 accepted requests per UTC day per authenticated user.

Validated server-only overrides may change the defaults within the reviewed bounds. A denied request returns HTTP 429 with `ASSISTANT_RATE_LIMITED` and a safe `Retry-After` when available.

Ownership/stale-context failures occur before quota consumption. Provider attempts occur only after acceptance by the limiter.

A per-instance in-memory limiter is permitted only outside production. For `VERCEL_ENV=production`, production Gemini must remain disabled until a multi-instance-safe shared limiter adapter exists and is reviewed. Missing Gemini configuration disables only the assistant; deterministic planner, replacement, shopping, and pantry features remain usable.

## Vercel production gate

The production Vercel target must be a project linked to `giang0110/Bepnha`. Never deploy BepNha into a project linked to `nuoidaycon` or another repository.

Approved production environment shape:

Public/runtime Supabase variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Server-only where required:

- `SUPABASE_SECRET_KEY`
- optional Gemini variables only if the production shared-limiter requirement is met.

As of the latest Phase 8 preflight, the Vercel integration is installed but exposes no accessible teams; project listing fails. Record `PRODUCTION_VERCEL_UNRESOLVED` until a connected Vercel account/team exposes or safely creates a BepNha project linked to `giang0110/Bepnha`.

Do not invoke a generic/current-project deploy command while the project identity is unresolved.

## Health, headers, deep links, and post-deploy smoke

After an explicitly authorized exact-main deployment, issue unauthenticated `GET /api/health`. Expected response is HTTP 200 with exactly:

```json
{ "status": "ok" }
```

Verify production responses preserve:

- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: no-referrer`;
- `X-Frame-Options: DENY`;
- restrictive `Permissions-Policy`.

Verify direct/deep-link navigation for protected routes without weakening authentication:

- `/household`
- `/settings/household`
- `/pantry`
- `/plan`
- owned `/shopping/:planId`

Then perform a deterministic authenticated smoke using only intended test/launch records: sign-in/onboarding, household setup, plan generation, replacement preview/apply, pantry, and shopping. Do not probe unrelated production records.

If Gemini remains intentionally disabled, verify the deterministic app works and the assistant returns a bounded disabled/unavailable state. If Gemini is later enabled with an approved shared limiter, run assistant smoke separately and verify no plan revision changes until explicit deterministic apply.

## Privacy, telemetry, and correlation IDs

Never send Supabase tokens, secret keys, user/household/plan/revision IDs, idempotency keys, raw planner snapshots, pantry rows, unpublished catalog data, or full candidate search space to Gemini.

Operational telemetry must not contain assistant questions, provider prompts/responses, access tokens, API keys, household payloads, or full request/response bodies. Safe bounded telemetry may include correlation ID, operation/outcome, rounded duration, HTTP status, and reviewed model identifier.

## Performance and accessibility

`npm run test:performance:planner` remains the repeatable deterministic performance gate. Do not weaken frontier limits or correctness semantics solely to improve timing.

Before promotion, verify narrow-width and keyboard behavior in addition to automated Playwright coverage: skip-link focus, primary actions, meaningful labels/messages, and absence of document-level horizontal overflow.

## Rollback, deletion, and key rotation

For application regressions, prefer rollback/promotion to a previously verified immutable application deployment.

For an already-applied database migration, prefer an explicitly reviewed forward-fix migration. Do not perform destructive ad-hoc rollback unless a tested recovery procedure explicitly requires it.

For Gemini degradation, disable/remove Gemini server variables or roll back application configuration without changing deterministic planner data.

The production operator must document account-deletion handling: requester identity verification, owned household/planner/pantry/shopping records to remove or retain under policy, completion evidence, and retention rules. Do not retain secrets in support tickets.

Rotate server secrets through the deployment platform's server-side secret store. Revoke old keys after successful verification. Never print old/new secret values during troubleshooting.

## Phase 8 release evidence

The Phase 8 release record must contain:

- exact feature branch SHA, merge SHA, and current `main` SHA;
- exact successful Fast CI and canonical `web`/`database` runs;
- dependency, secret, coverage, bundle, and planner-performance evidence;
- assistant limiter/fail-closed review evidence;
- branch-governance state or exact accepted blocker;
- resolved Supabase project ref and pre/post migration history;
- production catalog readiness result based on real curated data, not fixtures;
- Vercel project identity and exact-main deployment identity;
- `/api/health`, security-header, deep-link, deterministic smoke, and runtime-error review;
- Gemini disabled/shared-limited state;
- backup/restore owner, restore-drill evidence, deletion owner, rollback policy, and key-rotation owner.

Record `PRODUCTION_READY` only when every mandatory external gate is green. Otherwise keep the precise blocker codes; do not weaken safety gates to force a launch.
