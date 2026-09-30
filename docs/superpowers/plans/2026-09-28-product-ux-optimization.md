# BepNha Product UX and Operations Optimization Implementation Plan

> **Required skill:** Execute this plan with `superpowers:executing-plans`, use `superpowers:test-driven-development` for behavior changes, `superpowers:systematic-debugging` for unexpected failures, and `superpowers:verification-before-completion` before reporting completion.

## Goal

Improve BepNha's production readiness and the core household experience without changing its deterministic planner, authoritative calculation snapshots, database schema, or Phase 5+ product boundaries.

## Architecture

Keep calculation authority in the existing domain/application/server layers. UI additions consume existing immutable planner and shopping evidence or derive presentation-only values from it. Device-local conveniences use explicitly non-authoritative local storage. Operational telemetry is a narrow, allowlisted, identifier-free Vercel log endpoint. Catalog health is read-only and protected by the existing server-side admin boundary.

## Tech Stack

React, TypeScript strict mode, Vite, Tailwind CSS, shadcn/ui patterns, Supabase Auth/PostgreSQL, Vercel Functions, Vitest/React Testing Library, Playwright.

## Spec

This plan follows `AGENTS.md`, `docs/superpowers/specs/2026-08-25-bep-nha-design.md`, the implemented Phase 0–4 contracts, and current repository behavior at base commit `622350b95f5a62dc18abc95a5fe11de029e29f4b`.

## Global Constraints

- No schema migration, production migration, deployment, merge, or production-data mutation.
- Do not change planner engine/config versions or canonical calculation fingerprints.
- Do not create a second cost, portion, nutrition, allergy, eligibility, or package-rounding implementation.
- Mutable display labels and device-local state never enter authoritative fingerprints.
- Shopping offline/manual state is clearly non-authoritative and never changes calculated quantities or totals.
- Existing RLS/grants remain unchanged; service-role access stays server-only.
- Preserve old-schema read tolerance and fail-loud write semantics.
- Do not introduce AI, pantry deduction, collaborative/offline sync, retailer, payment, delivery, receipt, OCR, or Phase 5 inventory behavior.

## Review Focus

- Regression risk in planner/shopping immutable evidence.
- Cross-platform verification reliability without weakening test coverage.
- Accessible mobile navigation and form controls.
- Exact distinction between calculated facts and presentation/device-local conveniences.
- No sensitive identifiers or household rules in telemetry.
- Admin-only catalog health and no browser service-role secret.

## Shared Interface Rulings

1. Existing Phase 4 snapshots remain byte-for-byte authoritative. Trust UI reads existing snapshot fields and fixed explanation codes; it does not add fields to persisted canonical inputs.
2. The existing `calculatePurchaseBasket` output remains the sole package-cost source. Shopping additions only cache, project, display, or attach local state.
3. Offline shopping state is keyed by exact plan/revision/item identity. Queued check operations replay through the existing narrow checked-state mutation boundary.
4. Manual “Mua thêm” rows are device-local, excluded from calculated totals, and purged with user-data caches on sign-out.
5. Telemetry accepts only allowlisted event names and bounded numeric/enum properties; no user, household, plan, rule, note, token, or free-text fields.
6. Catalog-health reads use the existing admin authentication and server-only Supabase client. They do not mutate or publish catalog data.

## Task 1 — Make the Local Verification Contract Reliable

**Files**

- Modify: `package.json`
- Modify: `vitest.config.ts`
- Modify: `api/serverless-module-resolution.test.ts`
- Modify: `README.md`
- Modify: `docs/operations/production-readiness.md`
- Test: `src/test/planner-benchmark.test.ts`
- Test: `src/test/planner-performance-gate.test.ts`

**Interfaces consumed/produced**

- Consume current Vitest projects and ESLint configuration.
- Produce deterministic `test`, `test:performance:planner`, and split lint commands suitable for Windows and CI.

**TDD sequence**

1. Add a failing cross-platform assertion for normalized module-resolution paths.
2. Update the resolver test helper to compare slash-normalized repository paths.
3. Move benchmark/performance suites out of the ordinary unit-test project while retaining explicit performance commands and CI coverage.
4. Split the type-aware lint command into bounded source/API/tooling scopes without changing rules.
5. Correct README/runbook claims to match the actual migration count, planner engine, local-Docker/CI model, and production deploy-order constraints.

**Focused verification**

```powershell
npm test -- api/serverless-module-resolution.test.ts
npm test
npm run benchmark:planner
npm run test:performance:planner
npm run lint
npm run typecheck
git diff --check
```

**Commit**

`fix: stabilize local verification workflow`

## Task 2 — Make Today the Mobile Home and Simplify Navigation

**Files**

- Modify: `src/app/router.tsx`
- Modify: `src/app/components/app-nav.tsx`
- Modify: `src/features/household/household-summary-page.tsx`
- Add: `src/features/settings/settings-page.tsx`
- Test: `src/app/router.test.tsx`
- Test: `src/app/components/app-nav.test.tsx`
- Test: `src/features/settings/settings-page.test.tsx`

**Interfaces consumed/produced**

- Consume existing authenticated routes and household/account pages.
- Produce four primary tabs: Hôm nay, Đi chợ, Tủ bếp, Cài đặt; keep compatibility redirects for old household URLs.

**TDD sequence**

1. Write failing router/navigation tests for authenticated `/` → `/plan`, active tab semantics, and compatibility redirects.
2. Implement the four-tab mobile navigation with accessible current-page state.
3. Compose a settings hub from household and account entry points without duplicating ownership logic.

**Focused verification**

```powershell
npm test -- src/app/router.test.tsx src/app/components/app-nav.test.tsx src/features/settings/settings-page.test.tsx
npm run typecheck
git diff --check
```

**Commit**

`feat: make today the primary app destination`

## Task 3 — Reduce Onboarding Input Friction

**Files**

- Modify: `src/features/household/onboarding/onboarding-page.tsx`
- Add: `src/features/household/onboarding/member-count-stepper.tsx`
- Add: `src/features/household/onboarding/budget-presets.tsx`
- Test: `src/features/household/onboarding/onboarding-page.test.tsx`
- Test: `src/features/household/onboarding/member-count-stepper.test.tsx`
- Test: `src/features/household/onboarding/budget-presets.test.tsx`

**Interfaces consumed/produced**

- Consume approved member age bands, household validation, `calculateAdultEquivalent`, and `PORTION_CONFIG_V1`.
- Produce accessible plus/minus member controls, common weekly-budget presets, and a review-only adult-equivalent explanation.

**TDD sequence**

1. Add failing component tests for keyboard/button steppers, min/max enforcement, budget preset selection, and manual override.
2. Implement small reusable controls with proper labels and live validation.
3. Add adult-equivalent display to the existing final review step using the domain calculation only.

**Focused verification**

```powershell
npm test -- src/features/household/onboarding
npm run typecheck
git diff --check
```

**Commit**

`feat: streamline household onboarding inputs`

## Task 4 — Add Planner Trust, Recovery, and Safer Replacement Preview

**Files**

- Modify: `src/application/planner/contracts.ts`
- Modify: `src/application/planner/generate-weekly-plan.ts`
- Modify: `src/application/planner/load-current-plan.ts`
- Modify: `src/application/planner/preview-meal-replacement.ts`
- Modify: `src/features/plans/weekly-plan-page.tsx`
- Add: `src/features/plans/plan-trust-panel.tsx`
- Add: `src/features/plans/replacement-comparison.tsx`
- Test: corresponding application and component test files

**Interfaces consumed/produced**

- Consume already persisted calculation date, portion factor/adult equivalent, basket freshness, coverage-valid ready-plan state, warning codes, and fixed score explanations.
- Produce a presentation DTO containing only reproducible read facts; no snapshot mutation or new fingerprint input.

**TDD sequence**

1. Add failing application tests proving current and newly generated plans expose the same trust projection from immutable evidence.
2. Prove display-name changes do not change fingerprints or trust provenance.
3. Implement the projection and render a compact “Vì sao kế hoạch này phù hợp” panel.
4. Add typed recovery actions for household constraints, stale/current-data retries, and changed-input regeneration.
5. Expand replacement preview to compare old/new meal, cooking time, dishes, weekly cost delta, and full-week basket recalculation notice.
6. Move the assistant below deterministic plan content and collapse it behind explicit explanatory copy.

**Focused verification**

```powershell
npm test -- src/application/planner src/features/plans
npm run typecheck
git diff --check
```

**Commit**

`feat: improve plan trust and recovery guidance`

## Task 5 — Preserve Cooking Progress and Show Exact Step Quantities

**Files**

- Modify: `src/features/cooking/cooking-page.tsx`
- Add: `src/features/cooking/cooking-progress-store.ts`
- Add: `src/features/cooking/step-ingredient-details.ts`
- Test: `src/features/cooking/cooking-page.test.tsx`
- Test: `src/features/cooking/cooking-progress-store.test.ts`
- Test: `src/features/cooking/step-ingredient-details.test.ts`

**Interfaces consumed/produced**

- Consume exact revision/day identity, step ingredient IDs, scaled recipe-ingredient sources, units, and existing timers.
- Produce revision-scoped local progress and exact per-step ingredient labels from existing authoritative quantities.

**TDD sequence**

1. Add failing pure tests for matching step ingredient IDs to scaled quantities and for unknown-source fail-closed presentation.
2. Add failing persistence tests for revision-scoped restore, timer state, completion, and old-revision invalidation.
3. Implement the pure mapping and local progress adapter.
4. Wire them into cooking UI with accessible next/back/complete controls.

**Focused verification**

```powershell
npm test -- src/features/cooking
npm run typecheck
git diff --check
```

**Commit**

`feat: preserve guided cooking progress`

## Task 6 — Add Bounded Offline Shopping and Device-Local Extras

**Files**

- Add: `api/shopping/current.ts`
- Modify: `src/application/shopping/contracts.ts`
- Modify: `src/infrastructure/supabase/supabase-shopping-list-repository.ts`
- Add: `src/features/shopping/offline-shopping-store.ts`
- Add: `src/features/shopping/manual-shopping-extras.tsx`
- Modify: `src/features/shopping/shopping-list-page.tsx`
- Modify: `public/sw.js`
- Modify: sign-out cache purge integration
- Test: API, repository, store, page, and service-worker tests

**Interfaces consumed/produced**

- Consume existing owner-scoped `get_shopping_list` RPC and checked-state mutation RPC.
- Produce same-origin authenticated read-through GET caching, a bounded queued check-state replay, and local manual extras excluded from authoritative totals.

**TDD sequence**

1. Add failing API tests for bearer-token forwarding, input validation, owner-scoped reads, and no service-role/browser leakage.
2. Implement the thin GET function without recalculation.
3. Add failing service-worker tests for network-first exact revision reads, offline fallback, and sign-out purge.
4. Add failing queue tests for latest-state compaction, deterministic replay, failure retention, and exact revision identity.
5. Implement pending-sync UI and replay on reconnect.
6. Add failing local-extra tests for add/check/remove, revision scoping, purge, and exclusion from budget totals.
7. Implement a visually separate “Mua thêm” section marked “chỉ trên thiết bị này”.

**Focused verification**

```powershell
npm test -- api/shopping src/features/shopping src/infrastructure/supabase/supabase-shopping-list-repository.test.ts
npm test -- src/test/service-worker.test.ts
npm run typecheck
git diff --check
```

**Commit**

`feat: add resilient shopping utilities`

## Task 7 — Speed Up Pantry Entry Without Adding Inventory Semantics

**Files**

- Modify: `src/features/pantry/pantry-page.tsx`
- Add: `src/features/pantry/recent-pantry-foods.ts`
- Add: `src/features/pantry/pantry-quantity-presets.tsx`
- Test: pantry page and helper tests

**Interfaces consumed/produced**

- Consume existing pantry mutation/application contracts and exact supported units.
- Produce device-local recent-food shortcuts and unit-aware quantity presets that still submit through existing validation.

**TDD sequence**

1. Add failing tests for deduplicated bounded recents, safe parsing, purge, and no authoritative inventory inference.
2. Add failing component tests for preset selection and manual override.
3. Implement the helpers and wire them to successful existing mutations only.

**Focused verification**

```powershell
npm test -- src/features/pantry
npm run typecheck
git diff --check
```

**Commit**

`feat: speed up pantry entry`

## Task 8 — Add Privacy-Safe Product Telemetry

**Files**

- Add: `src/application/telemetry/events.ts`
- Add: `src/infrastructure/browser/product-telemetry.ts`
- Add: `api/telemetry.ts`
- Modify: selected onboarding/planner/cooking/shopping feature boundaries
- Test: telemetry contract, browser adapter, API, and instrumentation tests

**Interfaces consumed/produced**

- Produce a closed event union for onboarding completion, planner outcomes/latency bucket, replacement preview/apply, cooking start/complete, and shopping completion.
- API emits structured server logs only; it never accepts arbitrary properties or identifiers.

**TDD sequence**

1. Add failing validation tests rejecting unknown events, extra/free-text fields, IDs, oversized payloads, and invalid enums/numbers.
2. Implement a strict parser and a small POST function with method/body limits.
3. Implement a failure-isolated browser sender.
4. Instrument only successful user-boundary events and typed planner outcomes; telemetry failure must never block product behavior.

**Focused verification**

```powershell
npm test -- src/application/telemetry src/infrastructure/browser/product-telemetry.test.ts api/telemetry.test.ts
npm run typecheck
git diff --check
```

**Commit**

`feat: add privacy-safe product telemetry`

## Task 9 — Add Read-Only Admin Catalog Health

**Files**

- Add: `src/application/catalog-health/contracts.ts`
- Add: `src/application/catalog-health/load-catalog-health.ts`
- Add: `src/infrastructure/server/supabase-catalog-health-repository.ts`
- Add: `api/admin/catalog-health.ts`
- Add: `src/features/admin/catalog-health-page.tsx`
- Modify: router/settings discovery only as required
- Test: application, repository, API auth, and component tests

**Interfaces consumed/produced**

- Consume existing admin bearer authentication, server-only Supabase client, published catalog facts, price freshness rules, and readiness concepts.
- Produce read-only aggregate counts/coverage/freshness and actionable missing-data categories; no row editor and no mutation endpoint.

**TDD sequence**

1. Add failing API tests for 401/403, admin access, strict read-only method handling, and safe output.
2. Add failing repository/application tests for deterministic aggregate ordering and stale/unusable separation.
3. Implement minimal queries through the service-role server boundary.
4. Render a compact admin-only health page; ordinary users see no catalog details.

**Focused verification**

```powershell
npm test -- src/application/catalog-health src/infrastructure/server/supabase-catalog-health-repository.test.ts api/admin/catalog-health.test.ts src/features/admin/catalog-health-page.test.tsx
npm run typecheck
git diff --check
```

**Commit**

`feat: add admin catalog health view`

## Task 10 — End-to-End Polish, Accessibility, and Operations

**Files**

- Modify: `tests/smoke.spec.ts`
- Add/modify: focused Playwright specs for onboarding, plan trust/replacement, cooking restore, shopping offline/manual state, pantry shortcuts, and admin denial
- Modify: `docs/operations/production-readiness.md`
- Modify: `README.md`
- Modify touched components only for accessibility/responsive fixes found by tests

**TDD sequence**

1. Add mobile viewport flows for the four-tab shell and today-first route.
2. Add critical-flow assertions without duplicating existing deterministic integration coverage.
3. Run React best-practices review on changed TSX and fix concrete issues.
4. Verify production endpoint before setting `BEPNHA_PRODUCTION_URL`; if DNS/HTTP is not healthy, leave the variable unchanged and report the gate as blocked.
5. Inspect branch protection and configure required exact CI checks only if supported by the repository and current GitHub plan; never weaken existing protection.
6. Update operational documentation with the verified state and commands.

**Focused verification**

```powershell
npm run test:e2e
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run secrets:check
npm run security:dependencies
git diff --check
```

**Commit**

`test: cover optimized household journeys`

## Final Verification and Push Gate

Run locally:

```powershell
npm ci
npm run preflight
npm run env:check
npm run secrets:check
npm run security:dependencies
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run benchmark:planner
npm run test:performance:planner
npm run build
npm run test:e2e
git diff --check
git status --short
```

Local Docker absence records `LOCAL_DB_VERIFICATION_UNAVAILABLE`; because this plan has no schema changes, inherited exact-main database evidence remains the baseline, and exact-final-HEAD GitHub Actions must still pass all configured web/database/catalog jobs after push.

Before completion:

1. Inspect `622350b95f5a62dc18abc95a5fe11de029e29f4b...HEAD` for unrelated changes, migration files, duplicate calculations, secrets, and future-phase leakage.
2. Confirm no production URL/branch-protection setting was changed unless its prerequisite check passed.
3. Push `codex/product-ux-optimization` without force.
4. Require GitHub Actions success for the exact pushed SHA.
5. If a required local or exact-head CI gate fails or is blocked, report `BLOCKED`; do not claim completion.

## Exit Criteria

- Today-first four-tab mobile shell and settings hierarchy pass unit/E2E tests.
- Onboarding uses bounded steppers/presets and shows deterministic adult-equivalent review.
- Plan trust/recovery and replacement comparison use immutable evidence only.
- Cooking quantities and progress restore are revision-safe.
- Shopping offline behavior and manual extras cannot contaminate authoritative totals.
- Pantry shortcuts reuse existing mutations and validation.
- Telemetry is allowlisted, identifier-free, bounded, and failure-isolated.
- Catalog health is read-only, admin-only, and service-role credentials remain server-side.
- No migrations, planner-engine changes, fingerprint changes, duplicate calculation logic, or Phase 5 scope.
- All mandatory local checks and exact-final-HEAD CI pass before `TASK_COMPLETE_PUSHED`.

