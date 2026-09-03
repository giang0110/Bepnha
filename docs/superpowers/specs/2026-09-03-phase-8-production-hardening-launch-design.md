# Phase 8 — Production Hardening & Launch Design

Date: 2026-09-03
Base: `main` at `ba8b90ea8cfd32dc02964fb28197a7f84e598995`
Status: DESIGN_APPROVED_IN_CHAT_PENDING_SPEC_REVIEW

## Goal

Turn the Phase-7-complete BepNha repository into an operationally launchable production application without weakening any deterministic planner, pricing, nutrition, pantry, shopping, allergy/exclusion, or revision-authority boundary.

Phase 8 is not a feature-expansion phase. It hardens release governance, production configuration, Gemini abuse/cost protection, deployment verification, observability, backup/deletion operations, and release evidence.

## Non-goals

Phase 8 does not add AI-generated meal plans, AI-selected meals, AI-authored authoritative values, persistent assistant memory, retailer/live-price integrations, barcode/OCR, pantry lots/expiry, payments, notifications, collaboration, or marketplace behavior.

Phase 8 must not change deterministic meal eligibility, planner scoring/search authority, exact basket pricing, serving quantities, nutrition, hard-rule interpretation, pantry deduction, shopping quantities/provenance, or user-confirmed replacement persistence semantics except where a production-hardening test exposes an actual bug.

## Release model

Use a dedicated feature branch and PR. No feature development occurs directly on `main`. Every code/config change requires exact-head CI before merge and exact-main CI after authorized integration.

Production deployment and production database mutation remain separate, explicit operator actions. A green repository is not equivalent to a successful production launch. `PRODUCTION_READY` is recorded only after the target production deployment, health check, database/catalog readiness, and authenticated deterministic/assistant smoke gates have been verified against the intended environment.

## Workstream 1 — Repository governance

Protect `main` with repository rules/branch protection when the connected GitHub permissions allow it:

- require changes through pull requests;
- require the canonical `web` and `database` CI checks before merge;
- block force pushes;
- block deletion of `main`;
- preserve administrator override only if GitHub/Hobby/account constraints make it necessary, and document the exception.

If the connected GitHub tool cannot write rulesets/branch protection, Phase 8 records the exact manual setting required and treats governance as blocked rather than pretending it is enforced.

Remove Phase-7-only workflow files after confirming they are no longer needed. Keep `ci.yml` as the canonical full release gate and `fast-ci.yml` for non-main branch feedback.

Upgrade GitHub Actions versions where the currently supported action release removes the Node-runtime deprecation warning, but only through a dedicated tested change. Do not weaken or skip any CI step to save Actions minutes.

## Workstream 2 — Release evidence correctness

Update the Phase 7 exit audit to its actual final state after PR #3 and exact-main CI #450:

- final main SHA `ba8b90ea8cfd32dc02964fb28197a7f84e598995`;
- exact-main CI run `33752677760` / run number 450;
- both `web` and `database` successful;
- assistant integration/E2E, planner, shopping, pantry, catalog-readiness, accessibility, type drift, dependency audit and secret scan successful.

Create a Phase 8 release record that remains `PHASE_8_BLOCKED` until all code and external production gates are complete.

## Workstream 3 — Gemini abuse and cost protection

Add a bounded server-side rate limiter to `/api/assistant` without giving Gemini any new authority.

Requirements:

- rate limiting executes after authentication and before provider invocation;
- key by authenticated user identity, with optional coarse IP information only if already available and privacy-safe;
- default production policy is small and explicit (for example a bounded per-minute burst plus a bounded daily allowance), configurable through server-only environment variables;
- invalid rate-limit configuration fails closed to a conservative default rather than disabling protection;
- a limited request returns HTTP `429` with a stable application error code and optional safe retry metadata;
- rate-limit state must not include the user prompt, provider response, access token, household/plan/revision IDs in logs, or authoritative planner data;
- CI uses an injected/fake limiter or deterministic clock/store and never calls Gemini;
- planner/replacement/pantry/shopping functionality remains available if Gemini is disabled or rate-limited.

For a single-instance/local implementation, an in-memory limiter is acceptable only as development/test fallback. Production must use a multi-instance-safe shared mechanism before public launch. Preferred production implementation is a platform/shared store that can enforce quotas across Vercel function instances; if no such production store is connected, Phase 8 may land the port/adapters/tests and keep public Gemini activation blocked.

## Workstream 4 — Frontend and test hardening

Reduce avoidable initial JavaScript without changing product behavior:

- route-level lazy loading/code splitting for protected feature areas where compatible with the existing React Router/Vite architecture;
- preserve direct/deep-link behavior under `vercel.json` SPA rewrites;
- establish a bundle regression check or documented ceiling so the current >500 kB minified warning cannot silently worsen.

Coverage hardening:

- record the current verified baseline;
- add conservative coverage floors at or slightly below the verified baseline so future changes cannot significantly regress without an explicit review;
- prioritize server repository/admin error paths rather than chasing 100% coverage.

No threshold may be set above evidence that actually passes on the exact candidate.

## Workstream 5 — Production Supabase and catalog launch gate

The repository never auto-migrates a remote database. Production database work requires explicit production target resolution and operator approval.

Before applying anything remotely:

1. identify the intended production Supabase project and confirm it is not a local/test project;
2. perform a read-only migration-history/schema preflight;
3. confirm backup/restore readiness and the rollback/forward-fix owner;
4. compare remote migration history with the repository migrations;
5. only then apply missing approved migrations;
6. run production-safe catalog readiness checks without destructive reset or test-fixture writes;
7. verify the curated catalog has enough published meal options, price lineage, nutrient/allergen/conversion lineage and current/stale-but-usable price evidence for representative launch scenarios.

No `supabase db reset`, local fixture seeding, pgTAP fixture mutation, or destructive cleanup command may run against production.

If the production Supabase project cannot be discovered through connected tools and no safe credentials/project identifier are available, Phase 8 records `PRODUCTION_SUPABASE_UNRESOLVED` and stops before remote mutation.

## Workstream 6 — Vercel production deployment

Create or identify the BepNha Vercel project linked to `ntgiang1235-ux/Bepnha` and configure the production environment with only the required variables:

Public/browser:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Server:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` for the narrowly approved server persistence/admin paths
- optional `GEMINI_API_KEY`
- optional `GEMINI_MODEL`
- production rate-limit/shared-store configuration when Gemini is enabled publicly

Never create `VITE_GEMINI_*`, `VITE_*` secret/service-role variables, or log secret values.

The production deployment must build from the exact approved `main` SHA. After deployment:

- `GET /api/health` returns HTTP 200 with exactly `{ "status": "ok" }`;
- security headers remain present;
- deep links resolve correctly;
- runtime error clusters/logs show no new launch blocker.

The currently connected Vercel account/team must actually contain or create BepNha before this gate can pass. A deployment of another project does not count.

## Workstream 7 — Production smoke and observability

Run deterministic smoke independently of Gemini:

1. sign-in/sign-up path appropriate for production;
2. onboarding or existing household load;
3. household settings read/write under owner scope;
4. plan generation;
5. one deterministic replacement preview and explicit apply;
6. pantry read/update;
7. owned shopping list read/check-state flow;
8. historical revision behavior where applicable.

Then run assistant smoke separately:

- disabled/unconfigured assistant does not break planner;
- enabled assistant explanation is advisory only;
- variety proposal can only open deterministic preview;
- no revision is written until explicit apply;
- old advice clears after revision change;
- rate limiting returns bounded `429` behavior without leaking data.

Use correlation IDs and bounded operational telemetry. Do not log prompts, responses, tokens, secrets, raw planner snapshots, or household payloads.

## Workstream 8 — Backup, retention, deletion and operational ownership

Before public launch, document:

- production backup cadence and restore owner;
- one restore-drill procedure and evidence location;
- account-deletion request intake, identity verification and owned-record deletion/retention rules;
- incident rollback path for application regression;
- forward-fix policy for already-applied migrations;
- Gemini key rotation/revocation owner;
- where release evidence and production smoke results are recorded.

Automation may be added only where the connected platform supports it safely; otherwise the runbook must state the manual operator action explicitly.

## Error handling and fail-closed rules

- Missing production target information blocks remote mutation/deployment rather than guessing.
- Missing Gemini configuration disables only the assistant.
- Missing/misconfigured production rate-limit shared storage blocks public Gemini activation rather than removing the limiter.
- Production catalog insufficiency blocks planner launch rather than lowering eligibility/safety thresholds.
- Production smoke failures block `PRODUCTION_READY` and retain the last known-good deployment/rollback option.
- No secret value is ever written to Git, a PR body, issue, CI log, telemetry event, or client error.

## Test strategy

Every behavior change follows RED → GREEN → refactor.

Required exact-head gates before PR merge:

- `npm ci`
- `npm run verify:release:web`
- `git diff --check`
- full GitHub Actions `web` and `database`
- focused rate-limit tests/integration/E2E
- bundle/code-splitting regression gate if added
- coverage floors passing on the exact candidate

After authorized merge, exact-main `web` and `database` must pass again.

External production gates are separate from CI and must be recorded explicitly: production Supabase preflight/migration/catalog readiness, Vercel deployment from exact main, `/api/health`, deterministic smoke, assistant smoke when enabled, runtime error review, backup/restore ownership.

## Recommended implementation order

1. repository governance + Phase 7 audit correction;
2. remove obsolete Phase-7 workflows and upgrade CI actions;
3. Gemini rate-limit port/adapters/tests;
4. route-level code splitting + bundle/coverage regression gates;
5. exact-head PR CI and review;
6. authorized merge + exact-main CI;
7. resolve production Supabase target, perform read-only preflight, then approved migrations/catalog readiness;
8. create/identify BepNha Vercel project, set envs and deploy exact main;
9. production health/security/runtime checks and deterministic/assistant smoke;
10. close backup/restore/deletion/operational evidence and record `PRODUCTION_READY` only if every mandatory gate is green.

## Exit criteria

`PHASE_8_PASS` requires the repository hardening work to be merged with exact-main CI green and the repository governance/rate-limit/release-evidence requirements satisfied.

`PRODUCTION_READY` is a stricter status and additionally requires:

- resolved production Supabase project with approved migration state and launch-ready catalog;
- resolved BepNha Vercel production project deploying the exact approved `main` SHA;
- required environment variables configured without browser-visible secrets;
- `/api/health` and security headers verified;
- deterministic production smoke successful;
- Gemini disabled safely or enabled with shared rate limiting and separate assistant smoke successful;
- runtime error review clean enough for launch;
- backup/restore and account-deletion ownership documented.

If any external dependency is unavailable, record the exact blocker and do not mislabel the repository as production-ready.
