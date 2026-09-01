# Phase 5 Pantry and Waste Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add simple household pantry amounts, immutable pantry snapshots at plan generation/replacement time, deterministic pantry subtraction before purchase rounding, and a bounded leftover-aware planner signal without silently mutating existing plan revisions.

**Architecture:** Preserve Phase 4 as the authoritative shopping projection and extend the deterministic planner input with an explicit pantry snapshot. Pantry is user-owned mutable intent; each plan revision copies the exact pantry snapshot used by calculation. Shopping deduction happens in pure TypeScript before package rounding, and persistence stores both required and pantry-deducted quantities so old revisions remain reproducible even after pantry edits.

**Tech Stack:** TypeScript strict mode, React/Vite, Vitest/RTL, Supabase/PostgreSQL/RLS, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-25-bep-nha-design.md`

## Global Constraints

- Work only in Phase 5; do not implement Phase 6 launch-hardening or Phase 7 AI behavior early.
- Pantry is one current quantity per `(household_id, food_id)`; no lots, expiry dates, consumption ledger, barcode/OCR, retailer integration, automatic decrement, or background jobs.
- Pantry quantities keep `food_fact_version_id` + unit lineage so conversion semantics are explicit.
- Existing plan revisions are immutable; changing pantry never rewrites an existing plan or shopping list.
- Checking a shopping item never mutates pantry.
- Deterministic core remains framework-independent and cannot use wall-clock/random/LLM behavior.
- Allergy/exclusion, quantities, nutrition, price, eligibility, budget, and shopping math remain authoritative deterministic outputs.
- All schema changes are additive migrations with least-privilege RLS and no production mutation in this phase.
- Every completed task requires focused tests; phase exit requires exact-final-head web + database CI, including pgTAP, integration, and Playwright.

---

### Task 1: Define pantry domain and snapshot contracts

**Files:**
- Create: `src/domain/pantry/pantry.ts`
- Create: `src/domain/pantry/normalize-pantry-snapshot.ts`
- Test: `src/domain/pantry/normalize-pantry-snapshot.test.ts`
- Modify: `tsconfig.app.json`
- Modify: `tsconfig.api.json`
- Modify: `tsconfig.integration.json`

**Interfaces:**
- Produces `PantryItemSnapshotV1` with `pantryItemId`, `foodId`, `foodFactVersionId`, `quantity`, `unitId`, `baseQuantity`, `baseUnitId`, and `version`.
- Produces `PantrySnapshotV1` with deterministic `items` ordering by `foodId`, then `pantryItemId`.
- Produces `normalizePantrySnapshotV1(items)` which rejects duplicate food IDs, negative quantities, invalid canonical decimals, dimension mismatch, and mismatched food/fact lineage.

- [ ] Write failing unit tests for canonical ordering, zero quantities, duplicate foods, invalid decimals, mismatched units/fact lineage, and byte-equivalent repeated normalization.
- [ ] Run the focused test and verify RED.
- [ ] Implement minimal types + normalization with canonical decimals and stable ordering.
- [ ] Run focused tests and `npm run typecheck`; verify GREEN.
- [ ] Commit `feat: add deterministic pantry snapshot contract`.

### Task 2: Subtract pantry before purchase rounding

**Files:**
- Create: `src/domain/pantry/apply-pantry-deduction.ts`
- Test: `src/domain/pantry/apply-pantry-deduction.test.ts`
- Modify: `src/domain/shopping/shopping-list.ts`
- Modify: `src/domain/shopping/build-shopping-list-snapshot.ts`
- Modify: `src/domain/shopping/build-shopping-list-snapshot.test.ts`

**Interfaces:**
- Produces `applyPantryDeduction(requiredBaseQuantity, availableBaseQuantity)` returning `deductedBaseQuantity` and `remainingBaseQuantity`, both canonical decimals and floor at zero.
- `ShoppingListSnapshotV1.items[]` retains `requiredQuantity`, adds authoritative `pantryDeductedQuantity`, and computes purchase packages/cost only from `remainingBaseQuantity`.
- No second package-rounding implementation is introduced; Phase 3/4 purchase basket math remains the single package authority.

- [ ] Write RED tests for no pantry, partial deduction, exact deduction, pantry surplus floors remaining requirement at zero, package-boundary changes, and monotonicity.
- [ ] Run focused tests to verify RED.
- [ ] Implement pure subtraction and adapt shopping snapshot builder to consume explicit pantry snapshot input.
- [ ] Add regression test proving check-state does not affect pantry math.
- [ ] Run shopping/pantry tests + typecheck; verify GREEN.
- [ ] Commit `feat: apply pantry deductions to shopping snapshots`.

### Task 3: Add pantry to planner input fingerprints and immutable calculation evidence

**Files:**
- Modify: `src/domain/planner/planner-input.ts`
- Modify: `src/domain/planner/normalize-planner-input.ts`
- Modify: `src/domain/planner/normalize-planner-input.test.ts`
- Modify: `src/domain/planner/planner-snapshot.ts`
- Modify: `src/domain/planner/planner-snapshot.test.ts`
- Modify: `src/application/planner/planner-use-cases.ts`
- Modify: `src/application/planner/planner-use-cases.test.ts`

**Interfaces:**
- `PlannerInputV1` receives explicit `pantrySnapshot` and includes it in canonical input fingerprinting.
- Calculation snapshots copy the exact pantry snapshot used by that revision.
- Generation/replacement never load pantry implicitly inside the domain layer.

- [ ] Write RED tests proving pantry changes alter input/calculation fingerprints, stable pantry ordering does not, and old snapshots remain byte-stable.
- [ ] Run focused planner tests to verify RED.
- [ ] Thread `pantrySnapshot` through normalization/use-cases and snapshot evidence.
- [ ] Add replacement regression proving six locked days remain unchanged while the new revision records its own exact pantry snapshot.
- [ ] Run planner unit suite + typecheck; verify GREEN.
- [ ] Commit `feat: bind pantry snapshots to planner revisions`.

### Task 4: Add pantry persistence, RLS, and read/write RPCs

**Files:**
- Create: `supabase/migrations/20260901000000_phase_5_pantry.sql`
- Create: `supabase/tests/database/phase_5_pantry_schema.test.sql`
- Create: `supabase/tests/database/phase_5_pantry_rls.test.sql`
- Create: `supabase/tests/database/phase_5_pantry_integrity.test.sql`
- Modify: `supabase/migrations/20260827000000_phase_4_shopping_list.sql` only if a forward-compatible function signature must be replaced by the new migration rather than edited in place; historical migration contents remain unchanged.

**Interfaces:**
- Adds `pantry_items` with unique `(household_id, food_id)`, composite food/fact lineage, canonical quantity/unit validation, integer `version`, and updated timestamp.
- Authenticated owner can read/write only own pantry through narrow RPCs; cross-owner access fails closed.
- Trusted planner loader can read the exact owner pantry snapshot; plan persistence stores pantry evidence only in immutable calculation snapshot, not as a mutable foreign-key dependency.
- No trigger automatically decrements pantry when shopping items are checked or plans are generated.

- [ ] Write pgTAP RED tests for schema, lineage, owner isolation, optimistic version conflict, zero quantity, and forbidden cross-owner writes.
- [ ] Confirm database CI fails for missing Phase 5 schema, not unrelated reasons.
- [ ] Implement additive migration, indexes, RLS, `get_pantry`, `upsert_pantry_item`, and `delete_pantry_item` with strict ownership/version checks.
- [ ] Run reset/lint/pgTAP until GREEN.
- [ ] Commit `feat: add owner-scoped pantry persistence`.

### Task 5: Regenerate DB types and add pantry repositories

**Files:**
- Modify generated: `src/infrastructure/supabase/database.types.ts`
- Create: `src/application/pantry/pantry-repository.ts`
- Create: `src/infrastructure/supabase/supabase-pantry-repository.ts`
- Create: `src/infrastructure/supabase/supabase-pantry-repository.test.ts`
- Modify: `src/infrastructure/server/supabase-planner-input-loader.ts`
- Modify: `src/infrastructure/server/supabase-planner-input-loader.test.ts`

**Interfaces:**
- Browser repository exposes `load()`, `upsert(item)`, and `remove(itemId, expectedVersion)` only.
- Server planner input loader converts authoritative pantry rows into `PantrySnapshotV1` and fails closed on malformed lineage/conversion data.
- Generated database types come only from clean CI/local reset output; never hand-edit generated types.

- [ ] Generate types from a clean reset and verify `db:types:check`.
- [ ] Write repository RED tests for owner reads, insert/update/version conflict/delete, malformed RPC data, unauthorized, and transient errors.
- [ ] Implement strict DTO parser and repository.
- [ ] Write planner-loader RED tests for deterministic ordering and malformed pantry data.
- [ ] Implement loader wiring.
- [ ] Run focused tests + typecheck; verify GREEN.
- [ ] Commit `feat: add pantry repository boundary`.

### Task 6: Add a simple pantry management UI

**Files:**
- Create: `src/features/pantry/pantry-page.tsx`
- Create: `src/features/pantry/pantry-page.test.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/main.tsx`
- Modify: `src/features/plans/weekly-plan-page.tsx`

**Interfaces:**
- Protected `/pantry` route loads current pantry and published/stable food display metadata required for selection.
- UI supports add/update/remove current quantity with clear unit/fact context and conflict reload.
- No expiry, lot, barcode, automatic consume, or free-text food creation.

- [ ] Write RTL RED tests for protected routing, empty/loading/error states, add/update/remove, zero quantity, optimistic version conflict reload, keyboard labels, and no automatic mutation from shopping check-state.
- [ ] Implement mobile-first pantry page using existing repository DI pattern.
- [ ] Add navigation from plan/shopping surfaces without changing authoritative calculations in the browser.
- [ ] Run RTL + lint + typecheck; verify GREEN.
- [ ] Commit `feat: add pantry management flow`.

### Task 7: Add deterministic leftover-aware scoring signal

**Files:**
- Create: `src/domain/planner/score-pantry-reuse.ts`
- Create: `src/domain/planner/score-pantry-reuse.test.ts`
- Modify: `src/domain/planner/planner-config.ts`
- Modify: `src/domain/planner/score-week.ts`
- Modify: `src/domain/planner/score-week.test.ts`
- Modify: `src/domain/planner/search-week.test.ts`

**Interfaces:**
- Adds a bounded soft score derived only from pantry food overlap/usable quantities; it never overrides hard eligibility or budget authority.
- Lower score remains better; deterministic tie-break remains stable ID.
- Search lower bound must remain admissible; if no formal non-zero lower bound is proven, pantry-reuse contribution to the partial-state lower bound is zero.

- [ ] Write RED tests that pantry overlap can improve otherwise-equal quality, cannot make an unsafe/ineligible meal eligible, cannot override within-budget preference rules, and remains deterministic under candidate reorder.
- [ ] Add multi-day regression proving lower-bound admissibility with pantry reuse.
- [ ] Implement minimal integer-basis-point score and config version update if required by fingerprint semantics.
- [ ] Run planner golden/determinism/frontier tests; verify GREEN.
- [ ] Commit `feat: add pantry reuse planner signal`.

### Task 8: Add Phase 5 integration and browser coverage

**Files:**
- Create: `tests/integration/pantry.integration.test.ts`
- Create: `tests/pantry.spec.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Integration proves pantry owner isolation, snapshot binding, deterministic deduction, replacement with changed pantry creates a new immutable revision, and existing revisions remain byte-stable.
- Playwright proves add pantry → generate plan → shopping deduction → edit pantry → old revision unchanged → new generation/replacement uses new pantry snapshot.

- [ ] Add integration RED test and wire `test:integration:pantry` into database CI.
- [ ] Add Playwright RED flow and `test:e2e:pantry` after shopping E2E.
- [ ] Implement any missing wiring found by the tests without broadening scope.
- [ ] Update README with pantry semantics and explicit no-auto-decrement/no-lots limitations.
- [ ] Run full web + database CI on exact HEAD; require all steps GREEN.
- [ ] Commit `test: verify Phase 5 pantry flow`.

### Task 9: Phase 5 scope/security audit and exit gate

**Files:**
- No production files unless the audit discovers a real defect.

**Interfaces:**
- Exit evidence must show one authoritative package-rounding implementation, immutable plan revisions, no browser authoritative write path, no auto pantry decrement, and no Phase 6/7 feature leakage.

- [ ] Compare Phase 4 final SHA to Phase 5 candidate and inspect all changed files.
- [ ] Verify no forbidden scope terms/code paths for lots, expiry, barcode/OCR, retailer ordering, background jobs, or AI.
- [ ] Verify RLS/grants and security-definer functions remain least-privilege.
- [ ] Verify `git diff --check`, `verify:web`, clean Supabase reset/lint, all pgTAP, all integrations, onboarding/planner/shopping/pantry Playwright, generated DB types, and artifact upload on one exact SHA.
- [ ] Fast-forward `codex/phase-5-pantry` only after exact-head success.
- [ ] Fast-forward `main` only after the review checkpoint and rerun CI on `main`; require web + database success.

## Phase 5 Exit Criteria

Phase 5 is complete only when pantry changes never rewrite an existing plan silently; every generated/replacement revision records the exact pantry snapshot used; deductions are traceable from pantry item through shopping line; package rounding remains single-authority; owner isolation holds; and exact-final-head CI is green on both the feature branch and `main`.
