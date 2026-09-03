# Phase 8 — Production Hardening & Launch Design

Date: 2026-09-03
Base: `main` at `ba8b90ea8cfd32dc02964fb28197a7f84e598995`
Status: DESIGN_APPROVED_IN_CHAT_PENDING_SPEC_REVIEW

## Goal

Turn the Phase-7-complete BepNha repository into an operationally launchable production application without weakening deterministic planner, pricing, nutrition, pantry, shopping, allergy/exclusion, or revision authority.

Phase 8 is a hardening/launch phase, not a product-feature expansion.

## Non-goals

Do not add AI-generated plans, AI-selected meals, AI-authored authoritative values, persistent assistant memory, retailer/live prices, barcode/OCR, pantry lots/expiry, payments, notifications, collaboration, or marketplace behavior.

Do not change deterministic eligibility, planner scoring/search authority, exact basket pricing, portions, nutrition, hard rules, pantry deduction, shopping quantities/provenance, or explicit replacement-apply semantics unless a Phase 8 hardening test exposes an actual bug.

## Release model

Use a dedicated feature branch and PR. No feature development occurs directly on `main`. Every repository change requires exact-head CI before merge and exact-main CI after authorized integration.

Production database mutation and deployment are separate explicit operator actions. Green CI is not equivalent to a successful production launch. Record `PRODUCTION_READY` only after the intended production database/catalog, exact-main deployment, health/security checks, authenticated deterministic smoke, assistant state, runtime review, and operational ownership gates are verified.

## Workstream 1 — Repository governance

Protect `main` when connected GitHub permissions allow it:

- require pull requests;
- require canonical `web` and `database` CI checks;
- block force pushes;
- block deletion of `main`;
- retain administrator bypass only when account/platform constraints require it and document that exception.

If the connected GitHub surface cannot write rulesets/branch protection, record the exact manual settings and keep governance blocked rather than pretending protection exists.

Remove Phase-7-only workflows after confirming they are obsolete. Keep `ci.yml` as the canonical full gate and `fast-ci.yml` for non-main feedback. Upgrade GitHub Actions versions to currently supported Node-24-compatible releases in a tested change; do not weaken checks to save Actions minutes.

## Workstream 2 — Release evidence correctness

Correct the Phase 7 exit audit to its actual final state:

- final `main`: `ba8b90ea8cfd32dc02964fb28197a7f84e598995`;
- exact-main CI: run `33752677760`, run number 450;
- `web` and `database`: success;
- assistant integration/E2E, planner, shopping, pantry, catalog-readiness, accessibility, generated-type drift, dependency audit, and secret scan: success.

Create a Phase 8 release record that stays `PHASE_8_BLOCKED` until its repository and external production gates are complete.

## Workstream 3 — Gemini abuse and cost protection

Add server-side rate limiting to `/api/assistant` without giving Gemini new authority.

Resolved defaults:

- authenticated-user key only; do not persist prompt/body/token/plan/household identifiers as limiter metadata;
- burst limit: **5 accepted assistant requests per rolling 60 seconds per authenticated user**;
- daily limit: **50 accepted assistant requests per UTC day per authenticated user**;
- server-only overrides may lower or raise those values within validated bounds;
- invalid/missing override values fall back to the defaults rather than disabling protection;
- limited requests return HTTP `429` with stable code `ASSISTANT_RATE_LIMITED` and safe `Retry-After` when deterministically available.

Limiter order: authenticate → validate owner/current revision → rate-limit check → Gemini provider. Ownership/stale-revision failures must not consume quota. Provider failures after quota acceptance may consume quota; the policy is request-attempt based, not provider-success based.

CI uses an injected deterministic limiter clock/store and never calls Gemini. Planner, replacement, pantry, and shopping remain usable when Gemini is disabled or rate-limited.

An in-memory store is allowed only for local/test fallback. Public production Gemini requires a multi-instance-safe shared limiter. If no shared production store is connected, land the port/adapters/tests but keep public Gemini activation blocked rather than silently using per-instance memory.

## Workstream 4 — Frontend and test hardening

Add route-level lazy loading/code splitting for protected feature areas where compatible with the current React Router/Vite architecture. Preserve direct/deep-link behavior under `vercel.json` SPA rewrites.

Bundle gate:

- current build evidence has a single JavaScript chunk around 656.48 kB minified;
- Phase 8 target is **no initial entry JavaScript chunk above 500 kB minified**;
- add a deterministic build-output regression check rather than merely suppressing Vite's warning;
- route chunks may remain separate and are reviewed if any individual chunk exceeds the same 500 kB ceiling.

Coverage gate based on exact-main CI #450 baseline (~78.92% statements, 70.67% branches, 84.64% functions, 82.20% lines):

- statements >= **78%**;
- branches >= **70%**;
- functions >= **84%**;
- lines >= **82%**.

Do not raise thresholds above exact candidate evidence merely to create a target. Prioritize server repository/admin/error paths over chasing 100% coverage.

## Workstream 5 — Production Supabase and catalog launch gate

The repository never auto-migrates a remote database. Remote mutation requires an explicitly resolved production target and operator approval.

Before any remote write:

1. identify the intended production Supabase project and prove it is not local/test;
2. perform read-only migration-history/schema preflight;
3. confirm backup/restore readiness and rollback/forward-fix owner;
4. compare remote migration history with repository migrations;
5. apply only missing approved migrations;
6. run production-safe catalog readiness without destructive reset/test fixtures;
7. confirm enough published meal options and complete price/nutrient/allergen/conversion lineage for representative launch scenarios.

Never run `supabase db reset`, local fixture seeding, pgTAP fixture mutation, or destructive cleanup against production.

If the production Supabase project cannot be discovered safely, record `PRODUCTION_SUPABASE_UNRESOLVED` and stop before remote mutation.

## Workstream 6 — Vercel production deployment

Create or identify a BepNha Vercel project linked to `ntgiang1235-ux/Bepnha`.

Required public/browser variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Required server variables:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` for approved server persistence/admin paths
- optional `GEMINI_API_KEY`
- optional `GEMINI_MODEL`
- production shared-limiter configuration when Gemini is publicly enabled.

Never create `VITE_GEMINI_*`, a `VITE_*` service-role/private secret, or secret-valued logs.

Deployment must use the exact approved `main` SHA. After deployment verify:

- `GET /api/health` -> HTTP 200 and exactly `{ "status": "ok" }`;
- repository security headers remain present;
- SPA deep links resolve;
- production runtime error clusters/logs reveal no launch blocker.

The connected Vercel account/team must actually contain or create BepNha. A deployment of another project does not count.

## Workstream 7 — Production smoke and observability

Run deterministic smoke separately from Gemini:

1. production-appropriate sign-in/sign-up;
2. onboarding or existing household load;
3. owner-scoped household settings read/write;
4. plan generation;
5. deterministic replacement preview + explicit apply;
6. pantry read/update;
7. owned shopping-list read/check-state;
8. historical revision behavior where applicable.

Then assistant smoke:

- disabled/unconfigured Gemini does not break planner;
- explanation remains advisory;
- variety proposal opens deterministic preview only;
- no revision persists before explicit apply;
- advice clears after revision change;
- quota exhaustion returns bounded `429` without data leakage.

Use safe correlation IDs and bounded operational telemetry only. Do not log prompts, responses, tokens, secrets, raw planner snapshots, or household payloads.

## Workstream 8 — Backup, retention, deletion and operational ownership

Before public launch document:

- production backup cadence and restore owner;
- restore-drill procedure and evidence location;
- account-deletion intake, identity verification, and owned-record deletion/retention rules;
- application rollback path;
- forward-fix policy for applied migrations;
- Gemini key rotation/revocation owner;
- release evidence and smoke-test record location.

Automate only where the connected platform safely supports it; otherwise state the manual operator action explicitly.

## Fail-closed rules

- Missing production target data blocks remote mutation/deployment.
- Missing Gemini configuration disables only the assistant.
- Missing production shared limiter blocks public Gemini activation.
- Catalog insufficiency blocks planner launch instead of lowering safety/eligibility thresholds.
- Production smoke failure blocks `PRODUCTION_READY` and preserves rollback to last known good deployment.
- No secret value is written to Git, PR/issue text, CI logs, telemetry, or client errors.

## Test strategy

Every behavior change follows RED -> GREEN -> refactor.

Before PR merge, exact-head evidence must include:

- `npm ci`;
- `npm run verify:release:web`;
- `git diff --check`;
- full GitHub Actions `web` + `database`;
- focused limiter unit/integration/E2E;
- bundle regression gate;
- coverage floors on the exact candidate.

After authorized merge, exact-main `web` and `database` must pass again.

External production gates are recorded separately: production Supabase preflight/migration/catalog readiness, Vercel exact-main deploy, `/api/health`, deterministic smoke, assistant smoke when enabled, runtime error review, backup/restore/deletion ownership.

## Implementation order

1. governance capability check + Phase 7 audit correction;
2. obsolete workflow cleanup + CI action upgrade;
3. Gemini rate-limit port/adapters/tests;
4. route-level code splitting + bundle/coverage gates;
5. exact-head PR CI + review;
6. authorized merge + exact-main CI;
7. production Supabase resolution/read-only preflight, then separately approved migration/catalog actions;
8. BepNha Vercel project/env/deploy from exact main;
9. production health/security/runtime + deterministic/assistant smoke;
10. backup/restore/deletion evidence closure.

## Exit criteria

`PHASE_8_PASS` requires repository hardening merged with exact-main CI green plus satisfied governance, rate-limit, bundle/coverage, and release-evidence requirements.

`PRODUCTION_READY` additionally requires:

- resolved production Supabase with approved migration state and launch-ready catalog;
- resolved BepNha Vercel production deployment of exact approved main;
- correct environment separation with no browser-visible secrets;
- verified health/security/deep-link behavior;
- successful deterministic production smoke;
- Gemini safely disabled or enabled with shared limiting and successful assistant smoke;
- acceptable runtime error review;
- documented backup/restore/account-deletion ownership.

Any unavailable external dependency is recorded as an exact blocker; the repository must not be mislabeled production-ready.
