# Phase 8 Release Record — Production Hardening & Launch

Date: 2026-09-03
Branch: `codex/phase-8-production-hardening`
Base main: `ba8b90ea8cfd32dc02964fb28197a7f84e598995`

## Status

`PHASE_8_BLOCKED`

Phase 8 repository hardening is implemented through Task 4. Repository hardening gates and external production gates are tracked separately. A green repository does not imply `PRODUCTION_READY`.

## Repository governance

Current `main` protection readback on 2026-09-03: `protected: false`.

Required protection:

- changes through pull requests;
- required checks: `web` and `database` from canonical `CI`;
- force pushes disabled;
- branch deletion disabled.

The connected GitHub surface exposes branch-protection/ruleset reads but no write action. Until an operator enables the rules in GitHub settings or explicitly accepts this platform blocker, record `MAIN_GOVERNANCE_BLOCKED`.

## Repository gates

- [ ] main governance enforced or exact platform blocker accepted by operator
- [x] canonical CI cleaned and upgraded to supported Actions runtime
- [x] assistant rate limiting implemented and verified
- [x] production in-memory limiter prevented
- [x] bundle ceiling <= 500000 bytes enforced
- [x] coverage floors enforced: statements 78, branches 70, functions 84, lines 82
- [ ] exact-head Fast CI success
- [ ] exact-head PR `web` + `database` success
- [ ] review checkpoint complete
- [ ] authorized merge complete
- [ ] exact-main `web` + `database` success

## External production gates

- [ ] production Supabase target resolved
- [ ] production migration state verified read-only before any write
- [ ] production catalog readiness verified without destructive reset/test fixtures
- [ ] backup/restore owner confirmed before production migration
- [ ] BepNha Vercel project resolved and linked to `ntgiang1235-ux/Bepnha`
- [ ] approved exact-main deployment verified
- [ ] `/api/health` returns exact expected response
- [ ] production security headers and SPA deep links verified
- [ ] deterministic authenticated production smoke verified
- [ ] Gemini safely disabled or shared-rate-limited assistant smoke verified
- [ ] production runtime error review complete
- [ ] backup/restore/deletion/rollback/key-rotation ownership documented

## Known external state at Phase 8 start

The connected Vercel team `ntgiang1235` is on Hobby and currently exposes only project `nuoidaycon`; no BepNha project was visible during the pre-Phase-8 audit. This is not proof that BepNha is absent from every Vercel account, but it means the currently connected production target is unresolved.

No connected Supabase management surface is available in this chat. Repository commands are explicitly local-only for reset/test verification and must not be pointed at a guessed remote target.

## Phase 7 handoff evidence

Phase 7 final main: `ba8b90ea8cfd32dc02964fb28197a7f84e598995`.

Exact-main CI run `33752677760` (#450): `web` success and `database` success, including assistant integration/E2E, planner, shopping, pantry, catalog-readiness, accessibility, generated database-type drift, dependency audit, secret scan, production build, and planner performance.

## Phase 8 evidence log

Evidence is appended only after the exact corresponding run/action completes. Ancestor runs do not satisfy exact-head or exact-main gates.

### Repository hardening implementation

- Canonical `.github/workflows/ci.yml` and `.github/workflows/fast-ci.yml` use `actions/checkout@v7` and `actions/setup-node@v7`; temporary Phase 7 release/reset workflows were removed from the Phase 8 branch.
- Assistant HTTP rate limiting is applied only after authenticated owner/current-revision validation and before provider invocation. Denial returns HTTP 429 with bounded `Retry-After`; limiter failure fails closed with `ASSISTANT_UNAVAILABLE`.
- Production fail-closed behavior is explicit: when `VERCEL_ENV === "production"`, the default runtime factory returns no in-memory limiter, so configured Gemini remains disabled until a shared production adapter exists.
- No `supabase/migrations/*` file and no deterministic planner-domain authority file is changed in the Phase 8 branch compare against `main`.

### Task 4 exact implementation-head evidence

Implementation head: `e5f58bfa5dba240858d79fd862566637c9640cff`.

Fast CI run `33769737396` (#132), job `100696594293`: success.

`npm run verify:web` completed successfully and included environment validation, secret scan, dependency audit, formatting, lint, typecheck, coverage, production build, and `bundle:check`.

Coverage on that run:

- statements: `79.04%` (floor `78%`)
- branches: `70.86%` (floor `70%`)
- functions: `84.38%` (floor `84%`)
- lines: `82.36%` (floor `82%`)
- tests: `614 passed`, `0 failed`

Production build largest JavaScript asset: `vendor-BoFYqdTK.js`, `174546` bytes. Bundle ceiling: `500000` bytes. `bundle:check` passed.

### Task 5 pre-PR topology and audit

At implementation head `e5f58bfa5dba240858d79fd862566637c9640cff`, comparison against current `main` returned `ahead_by = 39`, `behind_by = 0`, merge base `ba8b90ea8cfd32dc02964fb28197a7f84e598995`.

Pre-PR changed-file audit found:

- no Supabase migration change;
- no deterministic planner-domain authority change;
- no browser Gemini/service-role secret path introduced;
- no provider-before-limiter path;
- no production in-memory limiter path;
- existing router regression assertions remain present and passed in Fast CI.

This release-record commit changes the branch head after run #132. Therefore run #132 is retained as Task 4 evidence only and does **not** satisfy the final Task 5 exact-head Fast CI checkbox. A fresh Fast CI run on this documentation commit is required before any PR can be considered merge-ready.
