# Phase 6 Exit Audit — Production Readiness

Date: 2026-09-02
Branch: `codex/phase-6-production-readiness`
Base: `main` at `5b356d1c9323ff10b9519445f473db1486f619f7`
Audited candidate before this record: `a8cebe03debc4797f09cfe771cc958251230c7ed`

## Status

`PHASE_6_BLOCKED` until the exact final feature HEAD that contains this audit record has both GitHub Actions `web` and `database` jobs completed successfully. Do not treat an ancestor run as final Phase 6 evidence.

## Scope audit

`main...codex/phase-6-production-readiness` is 43 commits ahead and 0 behind with the original Phase 5 main SHA as the merge base.

The changed-file set is bounded to Phase 6 production-readiness work:

- health endpoint verification and API hardening;
- operational planner telemetry and correlation IDs;
- security headers;
- planner error/recovery UX and shared page-shell accessibility;
- launch catalog-readiness evaluator, fixtures and integration coverage;
- planner regression/performance evidence;
- price-input filtering required by readiness correctness;
- 320 px accessibility/deep-link Playwright coverage;
- CI release gates, dependency override, release scripts, README and operational runbook.

No Phase 7 assistant/API/provider files are present. No retailer/live-ordering integration, inventory-lot or expiry model, OCR/barcode path, receipt/payment/delivery flow, automatic pantry consumption, collaboration/offline sync, or background inventory job was added.

The deterministic planner authority remains unchanged: Phase 6 does not modify `src/domain/planner/search-week.ts`, package-rounded purchase-basket authority, pantry subtraction authority, shopping snapshot authority, household hard-rule validation, or immutable plan-revision semantics. The only changed `search-week` domain file is its test. Catalog readiness calls the existing normalization/eligibility/search domain rather than replacing it.

## Security and privacy audit

Planner operational telemetry is deliberately bounded to:

- `event=planner_request`;
- operation (`generate`, `preview`, `apply`);
- correlation ID;
- rounded duration;
- HTTP status;
- outcome code.

It does not log household request payloads, access tokens, secret keys, free-text food data, or full request/response bodies. Safe incoming `x-correlation-id` values are returned to the caller; otherwise a UUID is generated.

Production/browser headers retain `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and a restrictive `Permissions-Policy`. API handlers also apply the server security-header helper. Phase 6 does not add a cross-origin relaxation.

Environment and secret boundaries remain unchanged: public Supabase URL/publishable-key variables are the only browser variables; `SUPABASE_SECRET_KEY` remains server-only where required. Repository scripts do not deploy, link, provision, or migrate a remote Supabase/Vercel project.

## Dependency audit

The reviewed lockfile pins the `@vercel/static-config` AJV override to `8.18.0`. The Phase 6 release verifier ran `npm audit --audit-level=moderate` and reported 0 vulnerabilities. The permanent `security:dependencies` gate now fails on moderate-or-higher advisories.

No forced dependency downgrade or `npm audit fix --force` was used.

## Readiness isolation regression

Two independent catalog-readiness test defects were diagnosed rather than weakening the release threshold:

1. earlier integration fixtures polluted the shared local database and could make the readiness coverage result fail;
2. the intentionally infeasible-time household used `maxElapsedMinutes: 5`, outside the authoritative 10–180 minute household domain.

The fix keeps the readiness evaluator and thresholds unchanged:

- CI resets local Supabase immediately before `test:integration:catalog-readiness`;
- the infeasible-time fixture uses the valid lower bound of 10 minutes, while launch recipe elapsed times remain above it so the scenario still exercises the intended deterministic hard-filter failure.

A diagnostic sequence ran the preceding integration suites, reset the database, and then passed catalog readiness.

## Verification evidence before final audit commit

Exact code SHA `f818e34141e33c1b7c54a0a808ba0efdf108f483` had full GitHub Actions CI success:

- `web`: `verify:web`, planner performance gate, Chromium install and smoke E2E all succeeded;
- `database`: local Supabase start/reset, SQL lint, pgTAP, generated-type drift check, Auth/household/catalog/admin/planner/shopping/pantry integrations, second reset, catalog readiness, onboarding/planner/shopping/pantry/accessibility Playwright, generated type artifact and cleanup all succeeded.

The release-documentation helper then verified the changes later committed as `a8cebe03debc4797f09cfe771cc958251230c7ed`:

- `npm audit --audit-level=moderate` succeeded with 0 vulnerabilities;
- `npm run verify:release:web` succeeded;
- `git diff --check` succeeded;
- release DB-script composition includes catalog readiness and accessibility gates;
- README and `docs/operations/production-readiness.md` were formatted before commit.

These ancestor results are supporting evidence only. The exact final HEAD after this audit record must still pass both CI jobs before Phase 6 can be marked `PHASE_6_PASS` or merged to `main`.

## Merge gate

Fast-forward `main` with `force=false` only if:

1. `main` is still the merge base/ancestor and the feature branch is not behind;
2. exact-final-feature-HEAD `web` = success;
3. exact-final-feature-HEAD `database` = success.

After the fast-forward, verify CI again for the exact `main` SHA. Phase 7 must not begin until exact `main` CI is green.
