# Phase 6 Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Bếp Nhà for launch with measurable accessibility, resilience, observability, performance, security-header, catalog-readiness and release-operation gates without changing deterministic planner authority.

**Architecture:** Extend the existing modular monolith with small shared server operational helpers and minimal shared UI accessibility primitives. Keep telemetry dependency-free and sanitized, keep existing domain/planner behavior authoritative, and turn launch requirements into CI-verifiable evidence plus a clearly separated manual QA checklist.

**Tech Stack:** React 19, Vite 8, TypeScript, Vitest/RTL, Playwright, Vercel Functions, Supabase/PostgreSQL/pgTAP, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-02-phase-6-production-readiness-design.md`

## Global Constraints

- Do not add Phase 7 AI/chat functionality.
- Do not change deterministic planner scoring/search semantics unless a measured SLO blocker requires a separately reviewed engine/config version change.
- Never log tokens, request bodies, household notes, full rule lists, SQL text, secret environment values or stack traces.
- Keep service credentials server-only; no new `VITE_` secret.
- Keep same-origin API behavior; do not broaden CORS.
- Do not lower the parent spec's launch catalog threshold of 21 eligible meal options per golden scenario.
- Do not create mechanically duplicated catalog entries to satisfy readiness gates.
- Do not use force/downgrade dependency remediation.
- Every behavioral change follows RED → GREEN → refactor and is committed independently.
- Feature exact-head CI must succeed before any fast-forward to `main`; `main` exact-head CI must succeed afterward.

---

### Task 1: Correlation IDs and sanitized planner telemetry

**Files:**
- Create: `src/infrastructure/server/operational-telemetry.ts`
- Create: `src/infrastructure/server/operational-telemetry.test.ts`
- Modify: `src/infrastructure/server/planner-http.ts`
- Modify: `src/infrastructure/server/planner-http.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface OperationalEvent {
    event: "planner_request"
    operation: "generate" | "preview" | "apply"
    correlationId: string
    durationMs: number
    httpStatus: number
    outcomeCode: string
  }

  export interface OperationalTelemetry {
    emit(event: OperationalEvent): void
  }

  export function correlationId(input: unknown, create?: () => string): string
  export function createConsoleOperationalTelemetry(): OperationalTelemetry
  ```
- `createPlannerHttpHandlers` gains optional `telemetry`, `createCorrelationId`, and `now` dependencies for deterministic tests.

- [ ] **Step 1: Write failing telemetry unit tests**

  Cover valid correlation-ID reuse, invalid/oversized input replacement with a generated UUID, JSON-only event emission, non-negative rounded duration, and absence of forbidden keys/values.

  ```ts
  test("rejects unsafe correlation ids", () => {
    expect(correlationId("token\nsecret", () => "generated-id")).toBe("generated-id")
  })
  ```

- [ ] **Step 2: Run the focused test and verify RED**

  Run in CI helper or branch workflow:
  `npx vitest run src/infrastructure/server/operational-telemetry.test.ts`

  Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement minimal telemetry helper**

  Use a conservative correlation-ID pattern such as `/^[A-Za-z0-9._:-]{1,96}$/u`; generate `crypto.randomUUID()` when invalid. `createConsoleOperationalTelemetry()` must emit exactly `console.info(JSON.stringify(event))` and receive already-sanitized event objects only.

- [ ] **Step 4: Add failing planner HTTP tests**

  Assert every planner response includes `x-correlation-id`; thrown dependency details are still absent; one operational event is emitted on success and failure; request body fields such as `householdId`, bearer token, or injected secret strings never appear in emitted events.

- [ ] **Step 5: Wire telemetry through planner HTTP**

  Create a per-request operational context at handler entry. Route all response paths through small helpers that set the correlation header and record the final status/outcome. Preserve existing public response body shapes except unknown-server failures may include `{ error, correlationId }` only if corresponding tests and UI handling are updated consistently; preferred implementation keeps the body unchanged and uses the response header.

- [ ] **Step 6: Run focused tests GREEN and commit**

  Run:
  `npx vitest run src/infrastructure/server/operational-telemetry.test.ts src/infrastructure/server/planner-http.test.ts`

  Commit: `feat: add sanitized planner telemetry`

---

### Task 2: Security headers and health endpoint operational contract

**Files:**
- Create: `src/infrastructure/server/security-headers.ts`
- Create: `src/infrastructure/server/security-headers.test.ts`
- Modify: `api/health.ts`
- Modify: `api/health.test.ts`
- Modify: `src/infrastructure/server/planner-http.ts`
- Modify: `vercel.json`

**Interfaces:**
- Produces:
  ```ts
  export function applyApiSecurityHeaders(response: VercelResponse): void
  ```
- Required headers include `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, and authenticated API `Cache-Control: no-store`.

- [ ] **Step 1: Write failing security-header tests**

  Test exact defensive values on planner and health responses and confirm `Allow` remains present on 405 responses.

- [ ] **Step 2: Verify RED**

  Run:
  `npx vitest run src/infrastructure/server/security-headers.test.ts api/health.test.ts src/infrastructure/server/planner-http.test.ts`

  Expected: missing module/header assertions fail.

- [ ] **Step 3: Implement shared header helper and wire APIs**

  Apply headers before any status/body path. Health stays unauthenticated and returns only `{ status: "ok" }`; it must not reveal environment/database details.

- [ ] **Step 4: Add static SPA headers in `vercel.json`**

  Preserve the API rewrite first and SPA fallback second. Add Vercel `headers` entries for the SPA without adding cross-origin permissions. Do not add a CSP that would break Supabase connectivity without a complete tested source list; document CSP as a future tightening item if not safely expressible now.

- [ ] **Step 5: Run focused tests GREEN and commit**

  Commit: `feat: harden production HTTP responses`

---

### Task 3: Shared accessibility shell and 320 px resilience

**Files:**
- Create: `src/app/components/app-page-shell.tsx`
- Create: `src/app/components/app-page-shell.test.tsx`
- Modify: `src/index.css`
- Modify: `src/features/plans/weekly-plan-page.tsx`
- Modify: `src/features/pantry/pantry-page.tsx`
- Modify: `src/features/shopping/shopping-list-page.tsx`
- Modify: onboarding/auth/household page files only where the shell/focus behavior is applicable
- Modify relevant RTL tests

**Interfaces:**
- Produces:
  ```tsx
  export function AppPageShell(props: {
    children: React.ReactNode
    className?: string
  }): React.ReactElement
  ```
- The shell owns a skip link to `#main-content` and a single main landmark with that ID.

- [ ] **Step 1: Write failing shell tests**

  Assert skip link target, one main landmark, keyboard-visible focus classes, and no duplicated `main-content` ID.

- [ ] **Step 2: Verify RED**

  Run focused RTL tests; expected missing component failure.

- [ ] **Step 3: Implement minimal shell and global focus treatment**

  Use existing Tailwind classes and a small global fallback in `src/index.css` for `:focus-visible`. Do not redesign typography/colors.

- [ ] **Step 4: Migrate primary signed-in flows**

  Replace repeated page `<main>` wrappers with `AppPageShell`. Ensure sticky replacement controls wrap at 320 px, long Vietnamese copy wraps, touch targets remain at least the existing `min-h-11`, and warnings include text labels rather than color alone.

- [ ] **Step 5: Add/adjust RTL tests**

  Verify loading uses `role="status"`, failures use `role="alert"`, submitting buttons disable duplicate action, and the pantry/shopping/plan pages retain their user context after recoverable failures.

- [ ] **Step 6: Run focused tests GREEN and commit**

  Commit: `feat: improve mobile accessibility shell`

---

### Task 4: Recoverable planner UX states and correlation-aware retry

**Files:**
- Modify: `src/features/plans/planner-api.ts`
- Modify: `src/features/plans/planner-api.test.ts`
- Modify: `src/features/plans/weekly-plan-page.tsx`
- Modify: `src/features/plans/weekly-plan-page.test.tsx`

**Interfaces:**
- Planner client failure shape becomes:
  ```ts
  export interface PlannerApiFailure {
    error: string
    correlationId?: string
  }
  ```
  while success contracts stay unchanged.

- [ ] **Step 1: Write failing API parsing tests**

  Assert `x-correlation-id` is captured on non-2xx responses without trusting arbitrary body fields.

- [ ] **Step 2: Verify RED**

  Run planner API tests; expected failure on missing correlation field.

- [ ] **Step 3: Implement minimal client parsing**

  Preserve current typed error code. Only accept correlation IDs matching the same safe printable pattern; ignore malformed headers.

- [ ] **Step 4: Write failing weekly-plan recovery tests**

  For `AUTH_UNAVAILABLE`, `PLANNER_UNAVAILABLE`, and `TRANSIENT_DEPENDENCY_FAILURE`, assert a retry button is presented, household/current ready plan context is not discarded unnecessarily, and correlation ID is displayed only as a short support reference when present.

- [ ] **Step 5: Implement recoverable-state UI**

  Do not retry automatically. User-triggered retry repeats the same intent with a fresh idempotency key only for a new generation action; replacement retry must preserve the current plan version and re-preview before apply where required by existing invariants.

- [ ] **Step 6: Run focused tests GREEN and commit**

  Commit: `feat: add resilient planner recovery states`

---

### Task 5: Deterministic performance regression gate

**Files:**
- Modify: `src/test/planner-benchmark.test.ts`
- Create: `src/test/planner-performance-gate.test.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Add script:
  `"test:performance:planner": "vitest run src/test/planner-performance-gate.test.ts --reporter=verbose"`

- [ ] **Step 1: Write failing multi-scenario performance test**

  Build small/median/max deterministic fixtures with different member counts and candidate counts. For each, record candidate count, frontier max, explored states and duration. Assert deterministic plan identity across repeated runs and a CI regression ceiling chosen from existing green baseline with generous headroom.

  The test must clearly state that it is a regression guard, not the production p95 SLO proof.

- [ ] **Step 2: Verify RED or baseline evidence**

  Run the focused test once. If the only failure is the intentionally strict provisional ceiling, use the measured evidence to set a documented non-flaky CI ceiling; never tune planner semantics merely to pass timing.

- [ ] **Step 3: Finalize gate and package script**

  Keep the parent launch SLO documented as p95 < 2 seconds in production-like conditions. Use CI ceiling only to catch gross regressions.

- [ ] **Step 4: Add CI web-job execution and run GREEN**

  Commit: `test: add planner performance release gate`

---

### Task 6: Catalog launch-readiness evaluator and integration gate

**Files:**
- Create: `src/application/release/catalog-readiness.ts`
- Create: `src/application/release/catalog-readiness.test.ts`
- Create: `tests/integration/catalog-readiness.integration.test.ts`
- Modify/create integration fixture helpers only as needed for curated launch scenarios
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces:
  ```ts
  export interface CatalogReadinessScenarioResult {
    scenarioCode: string
    eligibleMealOptionCount: number
    minimumEligibleMealOptionCount: 21
    proteinCapacityOk: boolean
    coverageOk: boolean
    blockers: readonly string[]
    ready: boolean
  }

  export function evaluateCatalogReadiness(input: PlannerInputV1, scenarioCode: string): CatalogReadinessScenarioResult
  ```
- Add script `test:integration:catalog-readiness` using local Supabase admin env.

- [ ] **Step 1: Write failing pure evaluator tests**

  Cover exactly 20 vs 21 eligible options, hard-filter effects, protein-group capacity, incomplete allergen/unit/nutrient/price coverage, stale-but-usable price acceptance, and too-old price rejection.

- [ ] **Step 2: Verify RED**

  Expected missing evaluator failure.

- [ ] **Step 3: Implement evaluator by reusing authoritative eligibility/coverage rules**

  Do not duplicate safety logic where a domain evaluator already exists. The release evaluator may orchestrate `normalizePlannerInput` + `evaluatePlannerEligibility` and inspect published candidate metadata, but it must not redefine allergy or price semantics independently.

- [ ] **Step 4: Add database-backed launch scenarios**

  Use curated immutable catalog fixtures and the same publication validation path. Scenario set must cover parent-spec representative households: two adults; two adults + young child; multigenerational; vegetarian exclusions; common allergen exclusion; tight feasible budget; infeasible time/catalog combination; minimum-cost over-budget fallback; high reuse opportunity.

  For scenarios intended to be launch-ready, assert `eligibleMealOptionCount >= 21`. The intentionally infeasible scenario asserts the precise blocker rather than being counted as launch-ready.

- [ ] **Step 5: Expand catalog only if evidence says it is genuinely insufficient**

  Any new catalog rows must be culinary-distinct curated options with valid immutable facts/recipes/prices. Do not duplicate IDs/names/ingredients mechanically. If meaningful curation cannot be completed from authoritative data, leave the gate failing and report the blocker rather than weakening the requirement.

- [ ] **Step 6: Add CI database-job execution, run GREEN, commit**

  Commit: `test: enforce launch catalog readiness`

---

### Task 7: 320 px Playwright accessibility/deep-link smoke

**Files:**
- Create: `tests/accessibility-mobile.spec.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Add script:
  `"test:e2e:accessibility": "npm run preflight:db && node scripts/local-supabase-env.mjs -- npx playwright test tests/accessibility-mobile.spec.ts"`

- [ ] **Step 1: Write failing Playwright test**

  At a 320 px viewport, exercise sign-in/onboarding or seeded signed-in flow, direct refresh on a protected deep link, skip-link focus, keyboard traversal of primary actions, plan/pantry/shopping pages, and assert no document-level horizontal overflow.

- [ ] **Step 2: Verify RED**

  Run against the Phase 6 branch environment; expected failure on currently missing skip-link/focus or overflow requirement.

- [ ] **Step 3: Fix only discovered accessibility/responsive defects**

  Keep fixes scoped to actual failing behavior. Do not add a visual redesign.

- [ ] **Step 4: Run GREEN and add CI database-job execution**

  Commit: `test: add mobile accessibility smoke`

---

### Task 8: Release command, operational runbook and final audit

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Create: `docs/operations/production-readiness.md`
- Modify: `.env.example` only if a new non-secret operational variable is actually required

**Interfaces:**
- Add scripts that compose existing gates without recursively starting/stopping Supabase in unsafe ways. Prefer separate `verify:release:web` and `verify:release:db` scripts if a single local command would duplicate lifecycle management; README documents the exact sequence.

- [ ] **Step 1: Add runbook content**

  Document environment variable names without values; project separation; health endpoint; correlation-ID troubleshooting; migration-only schema changes; dependency/secret scan; account deletion/backup/retention responsibilities; 320 px keyboard/screen-reader manual smoke; production-like p95 measurement; catalog-readiness report.

- [ ] **Step 2: Add release scripts and CI wiring**

  Ensure web job runs security/format/lint/type/coverage/build/performance and lightweight e2e; database job runs reset/lint/pgTAP/types/integrations/catalog-readiness and all focused Playwright suites.

- [ ] **Step 3: Scope/security audit**

  Compare `main...codex/phase-6-production-readiness`. Reject any AI/chat, retailer, inventory-lot/expiry, OCR/barcode, background-job, or planner-semantic changes. Verify telemetry contains no sensitive fields and headers do not weaken same-origin security.

- [ ] **Step 4: Full exact-head verification**

  Required exact Phase 6 HEAD evidence:
  - `npm run verify:web`
  - planner performance gate
  - clean Supabase start/reset/lint/pgTAP
  - generated DB types check
  - all integration suites including catalog readiness
  - onboarding/planner/shopping/pantry/accessibility Playwright suites
  - `git diff --check` equivalent via clean patch/format gate
  - GitHub Actions web = success
  - GitHub Actions database = success

- [ ] **Step 5: Finish branch**

  Use `superpowers:verification-before-completion`, then `superpowers:finishing-a-development-branch`. With the user's standing approval, fast-forward `main` non-force only when the feature exact-head CI is green. Re-run/check exact-head `main` CI and do not declare Phase 6 complete until it is green.

- [ ] **Step 6: Commit**

  Commit: `docs: finalize Phase 6 release readiness`
