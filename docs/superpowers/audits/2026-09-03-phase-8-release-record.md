# Phase 8 Release Record — Production Hardening & Launch

Date: 2026-09-03
Branch: `codex/phase-8-production-hardening`
Base main: `ba8b90ea8cfd32dc02964fb28197a7f84e598995`

## Status

`PHASE_8_BLOCKED`

Phase 8 is in implementation. Repository hardening gates and external production gates are tracked separately. A green repository does not imply `PRODUCTION_READY`.

## Repository governance

Current `main` protection readback on 2026-09-03: `protected: false`.

Required protection:

- changes through pull requests;
- required checks: `web` and `database` from canonical `CI`;
- force pushes disabled;
- branch deletion disabled.

The connected GitHub surface exposes branch-protection/ruleset reads but no write action. Until an operator enables the rules in GitHub settings or another authorized write surface becomes available, record `MAIN_GOVERNANCE_BLOCKED`.

## Repository gates

- [ ] main governance enforced or exact platform blocker accepted by operator
- [ ] canonical CI cleaned and upgraded to supported Actions runtime
- [ ] assistant rate limiting implemented and verified
- [ ] production in-memory limiter prevented
- [ ] bundle ceiling <= 500000 bytes enforced
- [ ] coverage floors enforced: statements 78, branches 70, functions 84, lines 82
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
