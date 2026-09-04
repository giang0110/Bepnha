# Phase 8 Release Record — Production Hardening & Launch

Updated: 2026-09-04
Repository: `giang0110/Bepnha`
Evidence branch: `codex/phase-8-production-launch-evidence`
Phase 8 PR: `#4`

## Status

`PHASE_8_BLOCKED`

Repository hardening has been implemented, reviewed, merged, and verified on the merge commit and current `main`. `PRODUCTION_READY` remains blocked by repository governance plus unresolved production Supabase/Vercel targets.

Current blockers:

- `MAIN_GOVERNANCE_BLOCKED`
- `PRODUCTION_SUPABASE_UNRESOLVED`
- `PRODUCTION_VERCEL_UNRESOLVED`

Gemini is optional. Production Gemini must remain disabled unless a multi-instance-safe shared rate limiter is configured; this does not block deterministic planner launch.

## Repository transfer and access

The repository has been transferred from `ntgiang1235-ux/Bepnha` to `giang0110/Bepnha`. Current repository identity is `giang0110/Bepnha`.

The active GitHub connection is now authenticated as `giang0110`. GitHub App installation `158997825` exposes `giang0110/Bepnha`, and repository permissions report `admin`, `maintain`, `push`, `pull`, and `triage` access.

Repository content writes on the evidence branch are therefore available again after the transfer.

## Repository governance

Latest readback shows `main` at `3157411ea453dc7ca5d8612d6e2594d494c6e625` and still `protected: false`.

Required governance remains:

- changes through pull requests;
- required canonical `CI` checks `web` and `database`;
- force pushes disabled;
- branch deletion disabled.

The connected GitHub action surface exposes branch-protection/ruleset reads but no branch-protection write action. Even though the authenticated account now has repository admin permission, protection cannot be changed through the available connector action set. Do not mark `PHASE_8_PASS` until protection is enabled by an operator or this exact blocker is explicitly accepted.

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
- [x] exact-current-main `web` + `database` success after corrective-history verification

## Phase 8 repository evidence

Final PR head: `577a46c483e669252f46c9f68df2286227e3d734`.

Fast CI #133 on that exact head passed `verify:web` with 614 tests, coverage `79.04 / 70.86 / 84.38 / 82.36`, production build, and bundle ceiling. Largest JavaScript asset was `174546` bytes.

PR #4 canonical CI run `33813341110` (#451) completed successfully on the exact PR head with both `web` and `database` green. Database verification included Supabase start/reset/lint/pgTAP, generated types, catalog/admin/planner/assistant/shopping/pantry integration suites, isolated catalog-readiness, onboarding/planner/assistant/shopping/pantry/accessibility E2E, artifact generation, and cleanup.

Formal review checkpoint on PR #4 reported no Critical or Important findings and no unresolved review threads.

PR #4 was merged to `main` as merge commit `385888c9b5fda7bc548980c2315a0c2a78220409`. Exact-main CI run `33818618908` (#452) completed successfully on that merge SHA with `web` and `database` both green.

No Phase 8 `supabase/migrations/*` file was introduced and no deterministic planner/search/price/portion/allergy authority file was changed.

## Corrective-history note — 2026-09-04

During post-merge evidence work, a placeholder file was accidentally created directly on `main` and immediately removed by a forward-fix commit. No force push or history rewrite was used.

Current `main` after the corrective delete is `3157411ea453dc7ca5d8612d6e2594d494c6e625`.

A compare from merge SHA `385888c9b5fda7bc548980c2315a0c2a78220409` to current `main` reports two commits and `files: []`; current `main` therefore has the same repository tree as the verified merge commit (`6b71952351a329827aea106c01370b1c8844428a`).

Exact-current-main CI run `33827975243` (#454) on `3157411ea453dc7ca5d8612d6e2594d494c6e625` completed with conclusion `success` on attempt 2. The first web attempt failed only because `npm audit --audit-level=moderate` timed out contacting the npm advisories endpoint. No code, dependency, threshold, or security-gate change was made. Only the failed web job was retried; on retry, `verify:web`, dependency audit, planner performance, Chromium installation, and full web E2E all passed. The database job passed the complete local Supabase/integration/catalog/E2E/type-generation/cleanup sequence.

## External production gates

- [ ] production Supabase target resolved
- [ ] production migration state verified read-only before any write
- [ ] production catalog readiness verified without destructive reset/test fixtures
- [ ] backup/restore owner confirmed before production migration
- [ ] BepNha Vercel project resolved and linked to `giang0110/Bepnha`
- [ ] approved exact-main deployment verified
- [ ] `/api/health` returns exactly `{ "status": "ok" }`
- [ ] production security headers and SPA deep links verified
- [ ] deterministic authenticated production smoke verified
- [ ] Gemini safely disabled or shared-rate-limited assistant smoke verified
- [ ] production runtime error review complete
- [ ] backup/restore/deletion/rollback/key-rotation ownership documented

## Production-target read-only preflight — 2026-09-04

### Supabase

No connected Supabase management surface is currently available to this workflow. The repository contains only the local Supabase project identifier `bepnha-local`; it does not contain a committed production `supabase.co` URL or production project identifier that proves the intended target.

A Supabase integration is available in ChatGPT but remains unconnected. Until it is connected and the intended BepNha production project is positively identified, the target remains unresolved.

Result: `PRODUCTION_SUPABASE_UNRESOLVED`. No production database mutation has been attempted.

### Vercel

Connected team: `ntgiang1235` (`team_JEJujcQnsYa3xLgA5l05MdLd`, Hobby).

Latest read-only project listing exposes only:

- `nuoidaycon` — `prj_RTVQVfQ2JwsRMZptUIPcmRNI1adH`, linked to `giang0110/nuoidaycon`.

No project linked to `giang0110/Bepnha` is visible in the connected team.

Result: `PRODUCTION_VERCEL_UNRESOLVED`. No Vercel project creation, environment-variable mutation, or production deployment has been attempted.

## Evidence-branch verification

Evidence commit `c7c7215c1f08606239ccfec224f0bc2cfd9eceb8` passed Fast CI run `33828168860` (#135).

Evidence commit `2908eab7f5839db358401687959542004d09fa49` passed Fast CI run `33829368700` (#136), including `npm run verify:web`.

This repository-transfer refresh changes the evidence branch head again and therefore requires a fresh Fast CI run before the branch is proposed for integration.

## Launch rule

Do not record `PRODUCTION_READY` until every mandatory external gate is green. Missing Gemini configuration disables only the assistant; missing Supabase/Vercel target resolution blocks production launch rather than weakening deterministic safety or deploying to another project.
