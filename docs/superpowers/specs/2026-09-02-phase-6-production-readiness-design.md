# Bếp Nhà — Phase 6 Production Readiness Design

**Status:** Approved for implementation  
**Date:** 2026-09-02  
**Base:** `main@5b356d1c9323ff10b9519445f473db1486f619f7`  
**Parent spec:** `docs/superpowers/specs/2026-08-25-bep-nha-design.md`

## 1. Goal

Phase 6 hardens the already-stable deterministic product for launch without changing planner authority or widening product scope. It focuses on accessibility, resilient UI states, measurable performance, structured observability, production HTTP hardening, catalog-readiness evidence, release automation, and operator documentation.

## 2. Non-goals

Phase 6 does not add AI, chat, retailer integration, background jobs, inventory lots/expiry, OCR/barcodes, household collaboration, medical nutrition claims, or a new design system. It does not change deterministic planner ranking semantics unless a measured launch-SLO failure forces a separately reviewed engine/config version change.

## 3. Architecture approach

Use incremental hardening inside the existing modular monolith:

- keep React/Vite, Vercel Functions, Supabase and existing domain boundaries;
- add shared server operational helpers for correlation IDs, sanitized structured telemetry, security headers and method/request hardening;
- add shared UI resilient-state/accessibility primitives only where repeated behavior exists;
- make performance/catalog readiness executable release evidence rather than prose-only checks;
- keep all launch gates deterministic and CI-verifiable where practical, with a short manual QA checklist for checks automation cannot prove.

No external observability SaaS is introduced. Structured JSON events go to the existing server runtime output so Vercel logs can ingest them without a new dependency.

## 4. Server observability and error contract

Every trusted planner request receives a correlation ID. A valid incoming `x-correlation-id` is reused only when it matches a conservative printable ASCII format and length cap; otherwise the server generates a UUID. The ID is returned in `x-correlation-id` on every response.

Planner endpoints emit one sanitized JSON event at completion with only operational fields:

- event name and operation (`generate`, `preview`, `apply`);
- correlation ID;
- duration in milliseconds;
- HTTP status and typed outcome code;
- engine version when available;
- safe planner metrics when available (eligible candidate count, search states explored, budget status, coverage summary).

Events never include access tokens, request bodies, household notes, full exclusion/allergy lists, food-rule contents, secret environment values, SQL text, or stack traces.

Unknown failures return a correlation ID plus the existing sanitized typed error. Existing domain error codes remain authoritative.

## 5. HTTP and production hardening

All API responses receive baseline defensive headers suitable for the current same-origin SPA/API deployment:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `X-Frame-Options: DENY`
- `Permissions-Policy` disabling unused high-risk browser capabilities
- conservative `Cache-Control` for authenticated/domain API responses

Vercel config adds equivalent static security headers for the SPA and preserves the existing API-first rewrite followed by SPA fallback. No cross-origin API use is enabled in Phase 6; CORS remains same-origin by default.

Request-body and method caps already present in planner HTTP remain. Phase 6 makes the operational behavior testable and consistent.

## 6. Resilient UX and accessibility

The mobile UI keeps current flows and Vietnamese terminology, but Phase 6 standardizes:

- visible keyboard focus on interactive elements;
- minimum practical touch target sizing;
- loading/error/status announcements using appropriate live-region semantics;
- retry actions for recoverable dependency failures;
- disabled/submitting states that prevent duplicate writes;
- preserved user context after transient failures;
- no color-only warning meaning;
- horizontal overflow avoidance at 320 px;
- a skip-to-main-content link and stable main landmark target;
- clear copy that preserves the spec's trust language (estimated cost/nutrition, saved-exclusion filtering, bounded-search wording).

The weekly plan, pantry, shopping list, onboarding/auth and household screens are checked, but this phase avoids visual redesign unrelated to usability or accessibility.

## 7. Performance and launch SLO evidence

The Phase 6 release gate introduces a deterministic benchmark command that exercises representative small, median and maximum household/candidate scenarios outside the domain core. The gate records duration and search-state evidence and fails only against a documented CI-safe ceiling chosen to detect regressions. The product launch SLO remains p95 trusted-endpoint latency below 2 seconds at expected launch catalog size; CI benchmark evidence is a regression guard, not a substitute for production-like p95 measurement.

A release document records the production-like p95 measurement requirement as a manual launch gate. Phase 6 does not claim the SLO is met from one unit benchmark.

## 8. Catalog-readiness gate

Create a deterministic catalog-readiness evaluator and integration test around the launch scenarios defined by the parent spec. Each scenario reports:

- eligible meal-option count before weekly constraints;
- whether the count is at least 21;
- protein-group capacity for the two-per-week cap;
- allergen-lineage, unit-conversion and six-launch-nutrient completeness;
- usable target-price-book coverage under `PriceFreshnessConfigV1`;
- scenario-specific blockers.

The release gate fails if seeded launch fixtures do not meet the parent spec. We do not lower the threshold or create mechanically duplicated meal options simply to make CI green. Any catalog expansion must use curated, valid immutable versions and existing publication validation.

## 9. Release automation and operations

Add a single `verify:release` command that composes the existing web/database/integration/e2e gates plus the new accessibility/performance/catalog checks in CI-appropriate form. CI remains split into web/database jobs for runtime practicality, but both jobs must execute the relevant Phase 6 gates.

README/runbook additions cover:

- required production/preview environment variables without secret values;
- Supabase/Vercel separation expectations;
- health endpoint and correlation-ID troubleshooting;
- migration-only production schema changes;
- dependency/secret scan commands;
- database backup/retention/account-deletion responsibilities that must be confirmed operationally before launch;
- manual QA checklist at 320 px, keyboard-only navigation and screen-reader smoke;
- production-like p95 latency evidence and catalog readiness as launch blockers.

## 10. Security/privacy constraints

Phase 6 preserves all existing RLS/grant guarantees. It does not add browser access to service credentials. Telemetry is deliberately data-minimized. No user-entered free text, authentication token, raw request body, SQL/database errors or household rule list may appear in structured logs.

Dependency remediation is non-destructive: do not use force/downgrade fixes merely to eliminate moderate audit findings. High/critical findings remain a CI blocker under the existing audit threshold; safe compatible upgrades may be taken if verified by the full gate.

## 11. Verification strategy

Use TDD for every behavioral change. Required evidence at Phase 6 exit:

1. formatter/lint/typecheck/unit/component/coverage/build green;
2. security dependency and secret scans green under documented thresholds;
3. clean Supabase start/reset/lint/pgTAP/generated-type check;
4. all integration suites green;
5. all focused Playwright journeys green, including a new 320 px accessibility/deep-link smoke;
6. structured telemetry tests prove allowed fields and absence of sensitive request data;
7. security-header tests green;
8. benchmark regression gate green and evidence emitted;
9. catalog-readiness integration gate green for every launch scenario;
10. exact-head CI success on the Phase 6 branch, then exact-head CI success after fast-forward merge to `main`.

Manual launch QA remains separately recorded and must not be represented as automated evidence.

## 12. Exit gate

Phase 6 is complete only when all automated gates above pass on the exact feature HEAD, scope/security review finds no Phase 7 work mixed in, operator documentation is complete, and `main` is fast-forwarded only after that evidence. The final status must distinguish automated readiness from any still-unperformed production-like latency or manual assistive-technology checks.