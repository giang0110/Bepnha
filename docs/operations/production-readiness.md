# BepNha Production Readiness Runbook

## Release authority and scope

BepNha's deterministic domain and persistence rules are authoritative. The planner, serving quantities, nutrition, prices, shopping quantities, allergy/exclusion safety, meal eligibility, pantry subtraction, budget evaluation, and immutable revision semantics must never be authored or overridden by Gemini.

The Gemini assistant is optional and advisory. It may explain an authoritative plan or propose a day for deterministic replacement preview, but it never chooses the replacement meal, never applies a replacement automatically, and never writes directly to the database.

Production configuration, database migration, deployment, and catalog mutation are explicit operator actions. Never run a remote reset, test fixture, destructive cleanup, or guessed-target deployment.

## Production bring-up sequence

The repository side is done: `main` is green on `web` and `database`, and production deployments
succeed. Everything below is an operator action in a dashboard or terminal that holds production
credentials. None of it can be performed from a repository automation context, which has no
Supabase or Vercel credentials and no network route to either.

The order is a dependency order, not a preference. Each step is unusable until the one above it is
done.

### 1. Vercel environment variables (Production scope)

Until these exist the site loads and then fails to authenticate anyone, because the browser client
is constructed from `VITE_*` values at build time.

| Variable | Scope | Value |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | public, build-time | `https://vkrqzwlpneocgjwhqbsl.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | public, build-time | project publishable/anon key |
| `SUPABASE_URL` | public, server | same URL as above |
| `SUPABASE_PUBLISHABLE_KEY` | public, server | same key as above |
| `SUPABASE_SECRET_KEY` | **secret, server only** | project secret/service-role key |

`VITE_*` values are compiled into the browser bundle and are readable by anyone. Never put
`SUPABASE_SECRET_KEY`, a Gemini key or an Upstash token behind a `VITE_` prefix. A redeploy is
required after changing a `VITE_*` value, because it is baked in at build time rather than read at
runtime.

Optional, and only once its own gate is met:

| Variable | Gate |
| --- | --- |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | enables the shared rate limiter; required before production Gemini |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | only after the shared limiter above is configured |
| `ASSISTANT_RATE_LIMIT_BURST`, `ASSISTANT_RATE_LIMIT_DAILY` | optional overrides within reviewed bounds |

### 2. Production database schema

Production held zero tables at the last read-only preflight, so this is a bootstrap of the complete
reviewed chain, not drift repair. Apply the eight migrations in exactly this order:

1. `20260825000000_phase_0_security_baseline.sql`
2. `20260825010000_phase_1_household.sql`
3. `20260826000000_qualify_household_rpc_constraints.sql`
4. `20260826010000_phase_2_food_recipe.sql`
5. `20260826020000_phase_3_planner.sql`
6. `20260827000000_phase_4_shopping_list.sql`
7. `20260901000000_phase_5_pantry.sql`
8. `20260902000000_phase_5_pantry_shopping_trace.sql`

This is the single irreversible step in the sequence and requires explicit authorisation for project
`vkrqzwlpneocgjwhqbsl` specifically. Verify read-only afterwards per **Production Supabase target**
above: migration history matches these eight, expected tables and functions exist, generated types
stay compatible, and both Supabase advisors are reviewed. Never run a remote reset, a test fixture,
or a catalog-readiness fixture against production.

### 3. Supabase Auth configuration

Both are covered in **Password recovery** above and both are launch blockers for account recovery:

- Redirect allow-list must cover `<production origin>/reset-password`. An origin-only entry does not
  match a path.
- Custom SMTP must be configured. The built-in sender is rate limited to a handful of messages per
  hour, so without it reset emails are throttled exactly when an owner needs one.

### 4. GitHub repository secrets

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, for the keep-alive workflow. The public key only —
never a secret key in a repository secret. Without them the scheduled job fails loudly, which is
intended: a pause-prevention job that fails silently is worse than none.

`BEPNHA_PRODUCTION_DB_URL`, for the **Production database migration** workflow and the schema check
it runs afterwards. Use the **session pooler** string on port 5432 (Project Settings → Database →
Connection string → Session pooler), not the transaction pooler on 6543: a migration needs session
state the transaction pooler does not keep. The direct host resolves to IPv6 only and GitHub runners
have no IPv6, so it cannot be used from CI. This one carries the database password — it belongs in
a repository secret and nowhere else.

### 5. Legal contact

Replace the `.invalid` placeholder in `src/features/legal/legal-content.ts` with a monitored address
and name the data controller, then have the notices reviewed. See **Published legal notices**.

### 6. Backup and restore

Establish the off-site logical backup cadence and perform a restore drill into a disposable database
before considering launch complete. See **Supabase Free-plan backup and recovery**. This has to
happen before real household data exists, not after.

### 7. Catalog data

The critical path, and the only remaining item that is neither configuration nor code. Schema alone
gives an application where a user can sign up, complete onboarding, press "generate a plan" and get
nothing back. Required thresholds and the prohibition on fixtures are in **Production catalog
readiness**.

### 8. Post-deploy verification

`GET /api/health`, security headers, protected deep links and the deterministic authenticated smoke,
per **Health, headers, deep links, and post-deploy smoke**.

Steps 1, 3, 4 and 5 are configuration. Step 2 is irreversible and separately authorised. Steps 6 and
7 are ongoing operator work. Only step 8 can confirm the result.

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
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

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

Therefore the first production schema operation is a bootstrap of the complete reviewed migration chain, not an incremental drift repair.

### Migration authorization

On 2026-09-17 the project owner authorized applying exactly these eight migrations to project `vkrqzwlpneocgjwhqbsl`. The authorization covers the schema bootstrap and nothing else: it is not authorization to seed catalog data, create users, run the launch-readiness fixtures, or apply any migration added after that date.

The apply itself is an operator action from a machine holding production credentials. It cannot be performed from an agent session in this repository's CI or review environment, which carries no Supabase credential and whose egress policy denies `supabase.com`, `api.supabase.com`, and `vkrqzwlpneocgjwhqbsl.supabase.co`.

```bash
supabase link --project-ref vkrqzwlpneocgjwhqbsl
supabase db push
supabase migration list
```

`supabase db push` prints the migrations it intends to apply and waits for confirmation. If that list is not exactly the eight above, stop: the local checkout is not at `main`, or the project is not the one resolved here.

### Running a migration from the repository

`.github/workflows/production-migration.yml` does the same work from a reviewed checkout, and is the
preferred route: it removes the IPv6 problem (it connects through the session pooler), it runs the
schema check straight afterwards, and it leaves a record of who dispatched it and what was applied.

Actions → **Production database migration** → Run workflow, from `main`, typing the project ref to
confirm the target. It runs in two stages:

1. `plan` — a dry run that prints the migrations it would apply into the run summary. Read-only.
2. `apply` — the write, plus `verify:production:schema`.

Stage 2 declares the `production` environment, so GitHub holds it for a reviewer — **but only if
that environment has required reviewers configured** (Settings → Environments → production). Without
that configuration the run proceeds unattended and the typed project ref is the only gate left, so
configure it before relying on this as the approval AGENTS.md §5 asks for.

The workflow refuses to run from any ref other than `main`, and refuses a project ref that does not
match the one recorded above. Re-running is safe: a push with nothing to apply reports `Remote
database is up to date` and succeeds.

### Migration and deploy ordering

Vercel publishes on merge to `main`. A production migration is an operator action that waits for
approval. Those two facts put a window between them in which the new code is live and its schema is
not, and **that window is an outage unless the code is written to survive it**.

It happened on 2026-09-23. `20260923000000_recipe_step_heat.sql` added `recipe_steps.heat_level` and
`recipe_steps.temperature_celsius`; the planner's loader selected both the moment the merge
deployed. PostgreSQL answered `42703 undefined_column` — a select naming a column the table does not
have fails whole, it does not return the other columns — so every meal failed to hydrate and the
week came back as `PLANNER_DATA_UNAVAILABLE` behind a generic "không thể xử lý kế hoạch". Plan
generation was down for every household until the migration was applied. The change had passed
every gate: CI runs migrations before tests, so no suite ever saw the two states apart.

For any change that adds or alters a column, one of these must hold before the branch merges:

- **the migration is applied to production first**, and only then is the code merged; or
- **the read path tolerates both schemas** — it asks for the new columns and falls back to the
  previous shape on `42703` / `PGRST204`, treating the absent column as "not stated" rather than as
  an error.

Prefer the second for anything on a user-facing read path: it removes the ordering constraint
instead of asking an operator to remember it, and it keeps a rollback safe in the other direction
too. `recipeStepRows` in `supabase-planner-input-loader.ts` is the worked example.

A **write** path must never degrade this way. Dropping a field on the way in because its column is
missing would lose what the author wrote; failing loudly is correct there, and
`saveRecipeVersionDraft` still does.

A test proves the tolerance only if it can see the two states apart. `supabase db reset` runs every
migration, so an integration test cannot; the fixture has to model the older schema deliberately.

### Post-migration verification

Verify read-only before any catalog mutation. The structural checks are executable:

```bash
BEPNHA_PRODUCTION_DB_URL='postgres://...' npm run verify:production:schema
```

PowerShell does not accept that leading assignment; set the variable first:

```powershell
$env:BEPNHA_PRODUCTION_DB_URL = "postgres://..."
npm run verify:production:schema
```

The script derives its expectation from `supabase/migrations/` rather than a maintained list, so it cannot drift from the repository. It opens a read-only session, passes no part of the credential on the command line, and prints `PRODUCTION_SCHEMA_MATCHES_REPOSITORY` only when all of the following hold:

- remote migration history exactly matches the eight repository migrations;
- every expected public table and function exists, and no unexpected one does;
- row level security is enabled on every `public` table.

A table with row level security enabled and no policy is reported as a note, not a failure: no policy denies every non-service-role read and write, which is the safe direction, and several catalog tables are deliberately in it.

Take the connection string from Supabase → Project Settings → Database → Connection string. It is a production credential: keep it out of the repository, out of shell history, and out of `VITE_*`.

Use the **session pooler** string, not the direct one. `db.vkrqzwlpneocgjwhqbsl.supabase.co` resolves to an IPv6 address only, so on a network without IPv6 a direct connection fails with `Address family not supported by protocol` — which reads like a firewall problem but is an address-family one. The pooler host resolves to IPv4.

Without `psql` installed, the same checks come out as one statement to paste into the Supabase SQL editor:

```bash
npm run verify:production:schema -- --print-sql
```

It returns a `verdict` row plus one row per finding, with the same codes. The expectation is inlined at the moment it is printed, so regenerate it rather than keeping a copy: a saved paste is a snapshot of one commit.

### Result on 2026-09-17

The eight migrations are applied to `vkrqzwlpneocgjwhqbsl` and verified. `supabase migration list` shows all eight present remotely, in order, with timestamps matching the file names, and the schema check returns:

```
verdict  PRODUCTION_SCHEMA_MATCHES_REPOSITORY
note     RLS_WITHOUT_POLICY   public.admin_audit_log
```

No findings: eight migrations, forty public tables, twenty public functions, row level security on every one. The single note is the intended state — `admin_audit_log` with row level security and no policy denies every PostgREST read and write, leaving the `security definer` functions as the only writers. An audit log a user could read or amend would be the defect.

Note that `supabase db push` reporting `Remote database is up to date` proves only that the remote history table lists the same versions as `supabase/migrations/`; it never reads the schema. The check above is what establishes that the objects exist.

The remaining checks stay manual:

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

The executable procedure is `docs/operations/backup-and-restore.md`: which three files a complete
backup is, the drill that restores them into a disposable database, and the count comparison that
decides whether the backup is usable.

One property of this schema makes a naive restore fail, so it is worth stating here too. A
`--data-only` dump cannot be loaded straight back: constraint triggers such as the one behind
`INCOMPLETE_HARD_RULE_CATALOG_MAPPING` fire partway through the load, while only some of the rows
they span are present. The load must run with `set session_replication_role = replica` in the same
psql session. Verified end-to-end on PostgreSQL 16 against all 15 repository migrations — without it
the restore aborts, with it every row count matches the source exactly.

Deleting a Supabase project is irreversible and removes project data/backups. Project deletion is never a routine troubleshooting action.

## Gemini production rate-limit gate

Default assistant limits are:

- 5 accepted requests per rolling 60 seconds per authenticated user;
- 50 accepted requests per UTC day per authenticated user.

Validated server-only overrides may change the defaults within the reviewed bounds. A denied request returns HTTP 429 with `ASSISTANT_RATE_LIMITED` and a safe `Retry-After` when available.

Ownership/stale-context failures occur before quota consumption. Provider attempts occur only after acceptance by the limiter.

A per-instance in-memory limiter is permitted only outside production. For `VERCEL_ENV=production`, production Gemini must remain disabled until a multi-instance-safe shared limiter adapter exists and is reviewed.

The reviewed shared adapter is `src/infrastructure/server/upstash-rate-limiter.ts`. It evaluates and consumes the burst and daily windows inside a single Redis Lua script, so two serverless instances cannot both observe "under the limit" and then both consume. It is selected automatically whenever `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are both present and the URL is HTTPS; otherwise production still resolves to no limiter and Gemini stays disabled. The assistant limiter fails **closed**: if Redis is unreachable the request is denied rather than reaching the paid provider.

Both variables are server-only. Never define `VITE_UPSTASH_*` or any browser-visible Redis credential, and never point production at the same Redis database as a local or preview runtime. Missing Gemini configuration disables only the assistant; deterministic planner, replacement, shopping, and pantry features remain usable.

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

`PRODUCTION_VERCEL_UNRESOLVED` is resolved. The Phase 8 preflight could not list any Vercel team; a
project now exists, is linked to `giang0110/Bepnha`, and builds:

- Vercel team: `ntg11990109-5768s-projects` — confirmed by the project operator on 2026-09-17.
- Vercel project: `bepnha` (`prj_ytmKFxiv9EjO8Sld8E2R2eejM8Es`).
- Production deployments have succeeded from `main` since the install command was pinned.

That resolves the deployment *target*. It does not by itself make the deployment usable: the
environment variables below are still required, and without them the site loads but cannot
authenticate anyone.

Never deploy BepNha into a project linked to `nuoidaycon` or another repository.

### Module resolution inside a function

Vercel compiles `api/*.ts` in place rather than bundling it, and TypeScript never rewrites import specifiers on emit. Whatever is written in the source reaches Node verbatim, and Node applies ESM rules: a bare specifier is an npm package name, and a relative one needs a file extension.

Both mistakes fail identically, at module load, before a handler runs a single line:

```
ERR_MODULE_NOT_FOUND: Cannot find package '@/infrastructure'
imported from /var/task/api/health.js
```

So no module reachable from `api/**` may use the `@/` alias, and every relative import in that closure must end in `.js`. `api/serverless-module-resolution.test.ts` walks the real closure from the deployed entrypoints and fails on either.

Nothing else catches this. Vitest, `tsc` and Vite all resolve `@/` happily, which is why the entire suite stayed green while every function in production returned 500 from the first deployment onwards. There is no configuration lever either: the builder's bundling path is gated behind the internal `VERCEL_API_FUNCTION_BUNDLING=1`, and it does not read tsconfig `paths`. Browser code under `src/app` and `src/features` is unaffected and still uses the alias.

### Serverless function budget

Vercel turns **every** file under `api/` into a Serverless Function, `.test.ts` files included, and
the Hobby plan rejects any deployment with more than 12. Four unit-test files silently occupied that
budget — `api/health.test.ts`, `api/me.test.ts`, `api/admin/catalog.test.ts` and
`api/admin/meal-options.test.ts` — leaving the repository sitting at exactly the ceiling. Adding the
tenth real endpoint pushed it to 13 and the deployment failed.

`.vercelignore` now excludes `api/**/*.test.ts`. That drops the count to the real endpoints and stops
test sources being uploaded to public routes at all, which they should never have been.

`api/health.test.ts` asserts both the ceiling and the ignore rule, so the next endpoint that would
overflow fails in the local test run instead of at deploy time. If the count ever legitimately needs
to exceed 12, the plan has to change — do not reach the ceiling by deleting tests.

### Build toolchain resolution

`vercel.json` pins `installCommand` to `npm ci --include=dev`. This is load-bearing, not a preference.

`npm run build` invokes `tsc`, but the declared devDependency is
`"typescript": "npm:@typescript/typescript6"`, and that package ships only a `tsc6` binary. The `tsc`
binary is supplied by its own transitive dependency (`@typescript/old`, itself `npm:typescript@^6`),
and npm only guarantees `node_modules/.bin` entries for direct dependencies. A cached or incremental
platform install can therefore leave `node_modules/.bin/tsc` unlinked, and the build dies with
`sh: line 1: tsc: command not found` / `exited with 127` before any application code is compiled.
Every Vercel deployment of this repository failed this way, which is why no deployment had ever
succeeded. `npm ci` rebuilds the tree from the committed lockfile exactly as the canonical CI jobs
do, and `--include=dev` keeps the build toolchain present even if the platform environment sets a
production `NODE_ENV`.

Do not remove or weaken this install command to speed up builds. `api/health.test.ts` locks it.

The underlying fragility remains: the build depends on a binary name the declared dependency does not
itself provide. A follow-up may switch the `typecheck`/`build` scripts to the `tsc6` binary that
`@typescript/typescript6` actually ships — verified working — but that changes which compiler checks
the project, so it needs its own review rather than riding a deployment fix.
### Function region and duration

`vercel.json` pins `regions: ["sin1"]` so Functions run in Singapore alongside the resolved
`ap-southeast-1` Supabase project. A single region is valid on every plan; the platform default is
`iad1` (US East), which would place every planner round trip on a trans-Pacific path. Never remove
the pin without moving the database first.

`maxDuration` is intentionally **not** set in `vercel.json` because the accepted ceiling depends on
the plan the production project ends up on. After the Vercel project identity is resolved, confirm
the plan's ceiling and, if planner generation needs more headroom than the plan default, add:

```json
"functions": { "api/**/*.ts": { "maxDuration": <plan ceiling> } }
```

Record the measured p95 of `POST /api/plans/generate` against the real production catalog before
deciding. Do not raise the duration to mask a fan-out regression.

## Health, headers, deep links, and post-deploy smoke

Production origin as of 2026-09-17: `https://bepnhatoi.vercel.app`.

The read-only half of this section is executable:

```bash
BEPNHA_PRODUCTION_URL=https://bepnhatoi.vercel.app npm run smoke:production
```

Or, on the Windows machine this project is developed on:

```powershell
$env:BEPNHA_PRODUCTION_URL = "https://bepnhatoi.vercel.app"
npm run smoke:production
```

Playwright needs a browser the first time: `npx playwright install chromium`.

It checks `/api/health`, every security header `vercel.json` declares, that the content security policy is actually served and does not allow inline script, that the signed-out shell and each public deep link render on a phone viewport with no page errors or failed first-party assets, that an unknown deep link keeps its URL rather than falling through to the host's own 404, that both legal notices are reachable and carry a contact address that is not a `.invalid` placeholder, and that a protected route sends a signed-out visitor to sign-in.

Nothing in it signs up, signs in, or writes. Production holds real households, and a smoke test that created an account would leave one behind on every run. It lives in `tests/production/` under its own Playwright config, and the default config ignores that directory, so an ordinary `npm run test:e2e` cannot reach a live site.

The authenticated smoke below remains manual, because it does write.

### Result on 2026-09-17

`npm run smoke:production` against `https://bepnhatoi.vercel.app` passes 11 of 11, and `GET /api/me` without a token returns 401 rather than 500.

That 401 is the load-bearing evidence, not the 11. Until this date every serverless function returned 500 `FUNCTION_INVOCATION_FAILED` from module resolution, so a 401 is the first proof that the whole 77-file import closure loads and the handler itself runs. The first smoke run, on 2026-09-17 before the fix, scored 10 of 11 with `/api/health` failing, and that failure is what exposed it.

Two things this establishes about the suite itself. It catches what CI cannot: the full test suite was green on every commit while the entire API was down, because Vitest, `tsc` and Vite all resolve the `@/` alias that Node does not. And a preview deployment cannot substitute for it while Deployment Protection is on, since an unauthenticated request is answered with a 302 to a login page rather than by the function.

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

## Planner abuse protection

`POST /api/plans/generate`, `/api/plans/replacements-preview` and `/api/plans/replacements-apply` are the most expensive authenticated endpoints. When the shared limiter is configured they are throttled per authenticated user under the `bepnha:planner` namespace, separate from the assistant's `bepnha:assistant` counters. Defaults are in `PLANNER_RATE_LIMIT_CONFIG`: 10 accepted requests per rolling 60 seconds and 200 per UTC day. A denied request returns HTTP 429 with `PLANNER_RATE_LIMITED` and a `Retry-After` when one can be bounded.

Quota is consumed only after the caller's token is verified, so an anonymous or forged request can never spend a real user's allowance.

Unlike the assistant limiter, the planner limiter fails **open**. Planner endpoints are already behind authentication and RLS ownership, so a Redis outage must cost throttling rather than the core deterministic feature. Do not change this to fail closed without an explicit availability decision.

When no Upstash configuration is present the handlers behave exactly as before, which keeps local and preview runtimes dependency-free.

## Free-plan inactivity

Supabase pauses Free Plan projects after 7 days of inactivity. Pausing does not destroy data — the project is restored from the dashboard and the first request afterwards cold-starts — but the application is unavailable until an operator restores it.

`.github/workflows/supabase-keepalive.yml` issues a real PostgREST query twice a week and fails loudly if the project does not answer. It requires `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` repository secrets and must never be given a secret/service-role key.

A successful ping is HTTP 401 carrying SQLSTATE `42501`, not HTTP 200. The schema grants the `anon` role nothing — the phase 0 baseline revokes default privileges and every later migration revokes its own tables — so an anonymous read is refused at the privilege check. PostgreSQL can only raise `42501` after resolving the table and evaluating this role's privileges on it, which is exactly the database work the inactivity timer counts. An invalid key also returns 401 but carries no SQLSTATE, which is what separates the two.

Do not grant `anon` access to make the ping return 200. That would puncture the security baseline to satisfy a monitoring job; `phase_0_security.test.sql` asserts `anon` holds no privilege on any public table, and that assertion is the invariant, not an obstacle.

`GET /api/health` deliberately performs no database work, so pinging the deployed health endpoint does not reset the inactivity timer. Any replacement keep-alive must query the project API directly.

GitHub disables scheduled workflows after 60 days without repository activity. Re-enable the workflow after a long quiet period, or remove it once the project moves to a paid plan, where projects do not pause.

## Browser and API response policy

Static responses carry `Strict-Transport-Security` and a `Content-Security-Policy` that allows `script-src 'self'` only — the production build emits one external module script and no inline script, so no script nonce or hash is required. `connect-src` allows the Supabase REST, Auth and Realtime origins the browser client uses; widen it only for an origin the application actually calls.

`style-src` currently permits `'unsafe-inline'` because UI primitives may set inline style attributes at runtime. Tightening it requires verifying every rendered screen, not only the ones with automated coverage.

API responses carry the stricter `default-src 'none'` policy. `src/infrastructure/server/security-headers.test.ts` locks both baselines, including the exact `vercel.json` values.

Client-side error reporting is **not** wired to a third-party provider. `AppErrorBoundary` keeps an unexpected render failure from producing a blank document and exposes an `onError` hook, but no reporter is attached. A hosted reporter such as Sentry captures URL breadcrumbs by default, and BepNha routes contain plan identifiers (`/shopping/:planId`), which this runbook forbids sending to telemetry. Any reporter must be configured with URL and payload scrubbing reviewed against the privacy section below before it is enabled.

## Published legal notices

`/privacy` and `/terms` are public routes linked from sign-in and sign-up. Their content is derived
from the actual schema and module boundaries rather than a template: the collection inventory, the
non-collection guarantees, the assistant-provider exclusions and the fail-closed allergy rule all
restate behaviour this repository enforces. A migration that starts storing something new makes
`src/features/legal/legal-content.ts` wrong until it is updated in the same change.

**Operator contact** was set on 2026-09-17 to a monitored mailbox, and `legal-page.test.tsx` now asserts the inverse of the old tripwire: the address must not sit on a reserved domain (RFC 2606 `.invalid`, `.test`, `.example`, `.localhost`), because a notice telling people where to write must reach someone. The read-only production smoke checks the same thing on the deployed pages.

Two points remain open on it. The address is a personal mailbox rather than a role account, so it inherits one person's availability and will attract spam once the pages are indexed; a forwarding alias on the project's own domain would fix both, and that domain is already needed for password-recovery email. And `LEGAL_OPERATOR.name` is the product name, not a named data controller — whether that suffices is part of the review below.

One launch blocker remains, which the codebase cannot supply:

- **Legal review.** These notices were drafted from the system's real behaviour, not by a lawyer.
  They are accurate about what the software does; whether they satisfy the obligations that apply to
  the operator is a separate question that a qualified reviewer must answer before launch.

Do not publish the application to real households with the placeholder contact still in place.
## Password recovery

`/forgot-password` and `/reset-password` let an owner who lost their password regain access. Without
them a forgotten password permanently strands the account and every household, plan, pantry and
shopping record behind it, since the application has no other identity for the owner.

The request step never reports whether an address has an account. Supabase answers a registered and
an unregistered address the same way, the port carries no branch that distinguishes them, and the
Vietnamese confirmation copy is identical in both cases. Do not "improve" that message into a
not-found state: it would turn an anonymous endpoint into an account-existence oracle.

Two production settings are required before this feature works for real users:

- **Redirect allow-list.** The browser asks Supabase to return the user to
  `<origin>/reset-password`. That exact URL, or a wildcard covering it, must be in the production
  project's Auth redirect configuration. Origin-only entries do not match a path.
  `supabase/config.toml` carries the equivalent wildcards for local origins.
- **Custom SMTP.** Supabase's built-in email sender is rate limited and intended for development,
  and `auth.rate_limit.email_sent` defaults to a handful of messages per hour. A production launch
  needs a reviewed SMTP provider configured in the Supabase dashboard, otherwise reset emails are
  silently throttled and owners are stranded exactly when they need the feature. Treat missing
  production SMTP as a launch blocker for account recovery, not a nice-to-have.

Neither setting lives in this repository. Record both in the release evidence.

## Account deletion

`/settings/account` lets an owner delete their own account. `DELETE /api/account` verifies the
caller's token, then removes that auth user with the server-only secret key. `profiles` and
`households` reference `auth.users` with `on delete cascade`, and the household cascades onward, so
member groups, rules, plans, revisions, pantry rows and shopping rows go with it in one transaction.

Deletion is immediate and permanent by design: no grace period, no export step, no soft-delete flag.
The confirmation is a retyped email that must match the signed-in address exactly, and the button
stays disabled until it does.

The endpoint never accepts a target account identifier. It deletes whoever the verified token
belongs to and nothing else, and the request body is rejected unless its only key is the
confirmation sentinel — so no request shape exists that could name someone else's household. The
secret-backed deleter is constructed lazily, after verification, so an unauthenticated request never
reaches the secret key.

Catalog authorship is the one account that cannot self-delete. `food_fact_versions`,
`recipe_versions`, `recipe_version_tags`, `price_books` and `meal_option_versions` reference
`auth.users` with `on delete restrict`, as does `admin_audit_log.actor_user_id`. Removing such an
account would destroy immutable catalog provenance, so the endpoint answers
`ACCOUNT_RETAINED_FOR_CATALOG_AUTHORSHIP` with HTTP 409 and the UI tells the owner to contact the
operator. That is a deliberate refusal, not a fault: never widen the constraint to force a delete
through.

Operator obligations that remain outside the application: verifying a deletion request that arrives
by email or support channel rather than through the signed-in UI, deciding what to do for a catalog
author who asks to leave, and recording completion evidence. Retain no secrets in support tickets.

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
