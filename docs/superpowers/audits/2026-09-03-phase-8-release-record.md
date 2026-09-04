# Phase 8 Release Record — Production Hardening & Launch

Updated: 2026-09-04
Repository: `giang0110/Bepnha`
Evidence branch: `codex/phase-8-production-launch-evidence`
Phase 8 PR: `#4`

## Status

`PHASE_8_BLOCKED`

Repository hardening is implemented, reviewed, merged, and verified. Production Supabase is now positively identified, but production launch remains blocked by governance, unapplied schema/catalog work, and unresolved Vercel access.

Current blockers:

- `MAIN_GOVERNANCE_BLOCKED`
- `PRODUCTION_SUPABASE_SCHEMA_NOT_APPLIED`
- `PRODUCTION_CATALOG_NOT_READY`
- `PRODUCTION_VERCEL_UNRESOLVED`

Gemini is optional. Production Gemini remains disabled until a multi-instance-safe shared limiter exists; deterministic planner launch does not depend on Gemini.

## Repository identity and access

Canonical repository is now `giang0110/Bepnha` after transfer from `ntgiang1235-ux/Bepnha`.

Active GitHub connection: `giang0110`.
GitHub App installation: `158997825`.
Repository permissions report admin/maintain/push/pull/triage access, and evidence-branch content writes succeed.

Current `main`: `3157411ea453dc7ca5d8612d6e2594d494c6e625`.
Current `main` remains `protected: false`.

The available GitHub connector exposes branch-protection/ruleset reads but no protection write action. Required governance remains PR required, canonical `web` + `database` required, force-push disabled, deletion disabled.

## Repository gates

- [ ] main governance enforced or exact blocker explicitly accepted by operator
- [x] canonical CI cleaned and upgraded to Actions v7
- [x] assistant rate limiting implemented and verified
- [x] production in-memory limiter prevented
- [x] bundle ceiling <= 500000 bytes enforced
- [x] coverage floors enforced: statements 78, branches 70, functions 84, lines 82
- [x] exact-head Phase 8 Fast CI success before PR
- [x] exact-head PR `web` + `database` success
- [x] formal review checkpoint complete
- [x] authorized PR #4 merge complete
- [x] exact-merge-main `web` + `database` success
- [x] exact-current-main `web` + `database` success after corrective-history verification

## Phase 8 repository evidence

Final Phase 8 PR head: `577a46c483e669252f46c9f68df2286227e3d734`.

Fast CI #133 on that exact head passed `verify:web` with 614 tests, coverage `79.04 / 70.86 / 84.38 / 82.36`, production build, and bundle ceiling. Largest JavaScript asset was `174546` bytes.

PR #4 canonical CI run `33813341110` (#451) completed successfully with both `web` and `database` green. Formal review reported no Critical/Important findings and no unresolved review threads.

PR #4 merged as `385888c9b5fda7bc548980c2315a0c2a78220409`. Exact-merge-main CI `33818618908` (#452) completed successfully.

During post-merge evidence work, an accidental placeholder was created directly on `main` then immediately removed by forward-fix; no force-push/history rewrite was used. Current main `3157411ea453dc7ca5d8612d6e2594d494c6e625` has the same repository tree as the verified merge commit (`6b71952351a329827aea106c01370b1c8844428a`). Exact-current-main CI `33827975243` (#454) completed successfully on attempt 2; the first web attempt failed only from a transient npm advisories endpoint timeout and passed unchanged on retry.

No Phase 8 migration was introduced and no deterministic planner/search/price/portion/allergy authority file changed.

## Production Supabase read-only preflight — 2026-09-04

Resolved production project:

- name: `Bepnha`
- project ref: `vkrqzwlpneocgjwhqbsl`
- organization: `giang0110's Org` (`nwzcwogxfmuvmrgdgzfg`)
- organization plan: Free
- region: `ap-southeast-1`
- PostgreSQL: 17 (`17.6.1.166`)
- status: `ACTIVE_HEALTHY`
- API URL: `https://vkrqzwlpneocgjwhqbsl.supabase.co`

A modern enabled publishable key exists and is available for deployment configuration; key values are intentionally omitted from this record.

Initial production database state:

- remote migration history: 0 migrations
- `public` tables: 0

Repository `main` contains exactly eight ordered migration files:

1. `20260825000000_phase_0_security_baseline.sql`
2. `20260825010000_phase_1_household.sql`
3. `20260826000000_qualify_household_rpc_constraints.sql`
4. `20260826010000_phase_2_food_recipe.sql`
5. `20260826020000_phase_3_planner.sql`
6. `20260827000000_phase_4_shopping_list.sql`
7. `20260901000000_phase_5_pantry.sql`
8. `20260902000000_phase_5_pantry_shopping_trace.sql`

The production project is therefore a clean bootstrap target, not a drift-repair target. No production migration has been applied. Applying the eight-migration chain requires explicit mutation authorization for project `vkrqzwlpneocgjwhqbsl`.

Static migration review found no `TRUNCATE`, `DELETE FROM`, or `DROP TABLE` data-destruction path. Local canonical database CI has repeatedly applied the full chain successfully with lint, pgTAP, generated types, integrations, E2E, and cleanup.

### Catalog distinction

Schema migrations create reference taxonomy and catalog/planner structures but do not seed launch-ready `foods`, `recipes`, or `meal_options`.

`tests/integration/catalog-readiness.integration.test.ts` creates its own launch fixtures, food facts, prices, recipes, meal options, user, and household. It is strictly a local/CI fixture and must never run against production.

Result: production catalog readiness cannot pass immediately after schema bootstrap. Real curated catalog data must be published separately under reviewed mutation authorization, then readiness must be evaluated read-only using the deterministic >=21 eligible-meal-option and coverage/protein-capacity rules.

### Backup/restore

The organization is on Supabase Free. Current Supabase documentation recommends Free-plan projects regularly create logical backups with `supabase db dump` and store them off-site; automatic scheduled backups are provided for paid plans.

The production database was empty at preflight, so there is no application data to preserve before the initial schema bootstrap. Once production contains catalog/user data, launch requires an off-site logical backup cadence and a restore drill into a disposable/non-production database. Operator owner defaults to `giang0110` unless explicitly delegated.

## Vercel read-only preflight — latest

The Vercel integration reports `installed: true`, but currently exposes no accessible teams (`list_teams` returns an empty list). Listing projects by both the previously visible team ID/slug fails.

Earlier read-only evidence exposed only a `nuoidaycon` Vercel project linked to `giang0110/nuoidaycon`; no BepNha project was identified.

Result: `PRODUCTION_VERCEL_UNRESOLVED`. Do not invoke a generic/current-project deploy command. A production project must first be positively identified or created and linked to `giang0110/Bepnha`.

## External production gates

- [x] production Supabase target resolved
- [ ] production schema migration chain applied under explicit authorization
- [ ] post-migration history/schema/security/performance verified read-only
- [ ] production real catalog curated/published under explicit authorization
- [ ] production catalog readiness verified read-only without fixtures
- [ ] off-site backup cadence + restore owner/drill documented once data exists
- [ ] BepNha Vercel project resolved and linked to `giang0110/Bepnha`
- [ ] approved exact-main deployment verified
- [ ] `/api/health` returns exactly `{ "status": "ok" }`
- [ ] production security headers and SPA deep links verified
- [ ] deterministic authenticated production smoke verified
- [ ] Gemini safely disabled or shared-rate-limited assistant smoke verified
- [ ] production runtime error review complete
- [ ] account-deletion/rollback/key-rotation ownership documented

## Evidence-branch verification

Evidence commit `c7c7215c1f08606239ccfec224f0bc2cfd9eceb8` passed Fast CI #135 (`33828168860`).

Evidence commit `2908eab7f5839db358401687959542004d09fa49` passed Fast CI #136 (`33829368700`).

Repository-transfer evidence commit `1dd7036ea4276c099a7508357f8186cb63d01c89` triggered Fast CI #137 (`33863198528`). Subsequent runbook/Supabase evidence commits advance the branch head, so only a fresh Fast CI on the final resulting head may be used for integration evidence.

## Launch rule

Do not record `PRODUCTION_READY` until every mandatory external gate is green. Missing Gemini configuration disables only the assistant. Missing schema/catalog/Vercel readiness blocks production launch rather than weakening deterministic safety or deploying to another target.
