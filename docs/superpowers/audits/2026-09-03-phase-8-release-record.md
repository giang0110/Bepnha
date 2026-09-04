# Phase 8 Release Record — Production Hardening & Launch

Updated: 2026-09-04
Evidence branch: `codex/phase-8-production-launch-evidence`
Phase 8 PR: `#4`

## Status

`PHASE_8_BLOCKED`

Repository hardening has been implemented, reviewed, merged, and verified on the merge commit. `PRODUCTION_READY` is still blocked by unresolved repository-governance and external production targets.

Current blockers:

- `MAIN_GOVERNANCE_BLOCKED`
- `PRODUCTION_SUPABASE_UNRESOLVED`
- `PRODUCTION_VERCEL_UNRESOLVED`

Gemini is optional. Production Gemini must remain disabled unless a multi-instance-safe shared rate limiter is configured; this does not block deterministic planner launch.

## Repository governance

Latest readback shows `main` remains `protected: false`. Required protection remains:

- changes through pull requests;
- required canonical `CI` checks `web` and `database`;
- force pushes disabled;
- branch deletion disabled.

The connected GitHub surface exposes branch-protection/ruleset reads but no write action. Do not mark `PHASE_8_PASS` until protection is enabled or the operator explicitly accepts this governance blocker.

## Repository gates

- [ ] main governance enforced or exact platform blocker accepted by operator
- [x] canonical CI cleaned and upgraded to Actions v7
- [x] assistant rate limiting implemented and verified
- [x] production in-memory limiter prevented
- [x] bundle ceiling <= 500000 bytes enforced
- [x] coverage floors enforced: statements 78, branches 70, functions 84, lines 82
- [x] exact-head Fast CI success
- [x] exact-head PR `web` + `database` success
- [x] review checkpoint complete
- [x] authorized merge complete
- [x] exact-merge-main `web` + `database` success

## Phase 8 repository evidence

Final PR head: `577a46c483e669252f46c9f68df2286227e3d734`.

Fast CI #133 on that exact head passed `verify:web` with 614 tests, coverage `79.04 / 70.86 / 84.38 / 82.36`, production build, and bundle ceiling. Largest JavaScript asset was `174546` bytes.

PR #4 canonical CI run `33813341110` (#451) completed successfully on the exact PR head with both `web` and `database` jobs green. Database verification included Supabase start/reset/lint/pgTAP, generated types, catalog/admin/planner/assistant/shopping/pantry integration suites, isolated catalog-readiness, onboarding/planner/assistant/shopping/pantry/accessibility E2E, artifact generation, and cleanup.

Formal review checkpoint on PR #4 reported no Critical or Important findings and no unresolved review threads.

PR #4 was merged to `main` as merge commit `385888c9b5fda7bc548980c2315a0c2a78220409`. Exact-main CI run `33818618908` (#452) completed successfully on that merge SHA with `web` and `database` both green.

No Phase 8 `supabase/migrations/*` file was introduced and no deterministic planner/search/price/portion/allergy authority file was changed.

## Corrective-history note — 2026-09-04

During post-merge evidence work, a placeholder file was accidentally created directly on `main` and immediately removed by a forward-fix commit. No force push or history rewrite was used.

Current main after the corrective delete is `3157411ea453dc7ca5d8612d6e2594d494c6e625`.

A compare from merge SHA `385888c9b5fda7bc548980c2315a0c2a78220409` to current main reports two commits and `files: []`; current main therefore has the same repository tree as the verified merge commit (`6b71952351a329827aea106c01370b1c8844428a`).

Exact-current-main CI run `33827975243` (#454) was triggered for `3157411ea453dc7ca5d8612d6e2594d494c6e625`; at the time of this evidence commit it was still in progress. This run must complete before claiming a fresh exact-current-main PASS.

## External production gates

- [ ] production Supabase target resolved
- [ ] production migration state verified read-only before any write
- [ ] production catalog readiness verified without destructive reset/test fixtures
- [ ] backup/restore owner confirmed before production migration
- [ ] BepNha Vercel project resolved and linked to `ntgiang1235-ux/Bepnha`
- [ ] approved exact-main deployment verified
- [ ] `/api/health` returns exactly `{ "status": "ok" }`
- [ ] production security headers and SPA deep links verified
- [ ] deterministic authenticated production smoke verified
- [ ] Gemini safely disabled or shared-rate-limited assistant smoke verified
- [ ] production runtime error review complete
- [ ] backup/restore/deletion/rollback/key-rotation ownership documented

## Production-target read-only preflight — 2026-09-04

### Supabase

No connected Supabase management surface is available in this chat. The repository contains no committed production `supabase.co` URL or `SUPABASE_PROJECT` identifier that can prove the intended production target. Repository database verification commands are local-only and must never be pointed at a guessed remote database.

Result: `PRODUCTION_SUPABASE_UNRESOLVED`. No production database mutation was attempted.

### Vercel

Connected team: `ntgiang1235` (`team_JEJujcQnsYa3xLgA5l05MdLd`, Hobby).

Read-only project listing exposes only:

- `nuoidaycon` — `prj_RTVQVfQ2JwsRMZptUIPcmRNI1adH`, linked to `ntgiang1235-ux/nuoidaycon`.

No project linked to `ntgiang1235-ux/Bepnha` is visible in the connected team.

Result: `PRODUCTION_VERCEL_UNRESOLVED`. No Vercel project creation, environment-variable mutation, or production deployment was attempted.

## Launch rule

Do not record `PRODUCTION_READY` until every mandatory external gate is green. Missing Gemini configuration disables only the assistant; missing Supabase/Vercel target resolution blocks production launch rather than weakening deterministic safety or deploying to another project.
