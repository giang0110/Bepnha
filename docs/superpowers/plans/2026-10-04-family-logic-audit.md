# Family planning logic audit implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` for the planner repair and `superpowers:dispatching-parallel-agents` for independent, non-overlapping audit repairs. Steps use checkbox syntax.

**Goal:** Make weekly meal selection respect saved household preferences and repair confirmed inconsistencies in setup validation, physical quantities and pantry settlement.

**Architecture:** Preserve the existing deterministic scoring policy, hard safety constraints and frozen plan snapshots. Reuse one preference matcher in partial search and final scoring. Keep the pantry SQL repair separate from the web change so production database approval cannot prevent deploying the preference fix.

**Tech stack:** TypeScript, Vitest, React Testing Library, PostgreSQL/pgTAP, GitHub Actions.

**Spec:** The user's 2026-10-04 request to audit household preference, portions and shopping logic; `AGENTS.md`; existing planner and purchase contracts.

## Global constraints

- Do not change scoring weights, dietary policy or `planner-engine-v6` semantics.
- Allergies, exclusions, elapsed time and budget retain their current priority.
- Do not change production catalog prices, nutrient facts or household data.
- Run domain regression tests before implementation; verify the entire web gate before commit.
- Do not reset the shared local Supabase stack. SQL probes use rolled-back transactions.
- Production migrations require explicit approval under `AGENTS.md` section 5.

## Review focus

- Multiple protein preferences must affect the search before frontier pruning.
- Preference matches use food category ancestry, while soup/vegetable preferences use meal roles.
- Contradictory selections and invalid member counts must be rejected even when tabs bypass steps.
- Count/volume conversions to a mass base must agree on physical grams without rejecting valid density conversions.
- A completed shopping line must not deduct newly added pantry stock when the same revision is retried.

### Task 1: Preference-aware bounded search

**Files:** `src/domain/planner/score-week.ts`, `search-week.ts`, `search-week.test.ts`, `planner-v2.test.ts`.

**Interfaces:** Export a matcher accepting the `roles` and `foodCategoryCodes` of a scoring option; retain `qualityLowerBound` and final score contracts.

- [x] Add a regression where a pork/poultry preference changes a within-budget week rather than only its final score; cover v1 and v6 search.
- [x] Run targeted tests and confirm failure from missing early preference penalties.
- [x] Reuse the final-score matcher in `qualityLowerBound`, including protein categories, configured weight and configured day count.
- [x] Verify partial penalties remain lower bounds and selection is deterministic under shuffled candidates.
- [x] Keep affordable branches in the quality frontier before over-budget ones; preserve the cost frontier and over-budget fallback. A catalog replay confirmed an affordable better-ranked pork/poultry swap is missed without this budget-aware retention.

### Task 2: Household validation and saved-plan boundaries

**Files:** Household rule/setup validators, household form state, settings page and their tests. Saved-plan repository/loader files only if a reproducible read defect is confirmed.

**Interfaces:** Preserve existing validation codes and the household save command; reject contradictory hard/soft choices with visible actionable errors.

- [x] Reproduce vegetarian + preferred meat, excluded seafood + preferred fish, and soy allergy + preferred tofu.
- [x] Reproduce direct navigation to Review with invalid members/rules; expect no save command and visible errors.
- [x] Implement shared semantic conflict validation and validate the complete draft before save.
- [x] Verify normal saving, profiles, allergen strictness and preferences remain intact.
- [x] Confirm a saved legacy week can be read without live generation/catalog hydration; fix only if its stored contract permits a safe read.

### Task 3: Physical conversion validation

**Files:** `src/domain/recipe/scale-recipe.ts` and recipe/nutrition regression tests.

**Interfaces:** Keep `conversionIsConsistent(conversion): boolean` and existing error codes.

- [x] Add a failing count/volume → mass conversion regression where required base grams and nutrition grams differ.
- [x] For a mass food base, require gross grams = base quantity × base-unit mass factor, retaining source-mass checks.
- [x] Verify valid count/volume density conversions and existing scaling/nutrition tests pass.

### Task 4: Idempotent zero-change pantry settlement (separate database repair)

**Files:** New SQL migration replacing `apply_shopping_to_pantry`; focused pgTAP regression tests and operations notes.

**Interfaces:** Preserve RPC signature, ownership checks, revision locking, return shape and per-line transfer key.

- [x] Reproduce zero-purchase pantry-covered line with pantry emptied/deleted before settlement; retry after refill must not consume refill.
- [x] Write a durable latch even when consumption/addition is zero; no unnecessary stock entry or ledger mutation.
- [x] Verify normal settlement, retries, ownership and revisions with rolled-back SQL tests.
- [ ] Prepare a reviewable separate PR; obtain explicit production migration approval before applying it.

### Task 5: Whole audit evidence and release

**Files:** `docs/operations/2026-10-04-family-logic-audit.md`.

- [x] Record confirmed defects, validated flows and limits: saved weeks are snapshots; production prices remain fixed-pack; kcal goals do not represent macro targets.
- [x] Run `npm run verify:web`, planner performance gate, applicable browser and database checks.
- [x] Obtain independent code review, commit/push task files, create PR and verify CI at its exact head.
- [x] Use the existing authorization for merge/deploy of web fixes; verify production release and read-only smoke.

## Execution record

- Before repair: production has 48 published meals and 45 fixed-pack price rows; pork/poultry dishes exist.
- Before search repair: synthetic 20-meal replay returns the same protein sequence with no preferences, pork preference, or pork+poultry preferences. Partial fish and pork branches have the same score under `prefer_pork`.
- All synthetic SQL reproductions are local and rolled back; no production household data was inspected.
- Final local gates: 1,897 web tests in 199 files, six planner performance scenarios and 12 Chromium smoke tests passed. The separate pantry repair passed 571 assertions in 29 SQL files and four migration guard probes in rolled-back transactions.
- Independent web review found a stored-output decimal precision defect; generated-snapshot regressions reproduced it, and calculated-output validation now preserves the original canonical finite decimals. Source-input precision restrictions remain unchanged.
- Web PR #101 passed its exact-head CI and merged to main as `26fde62142f24fe79e79fa2f294ad920a0d9c598`. Vercel Production deployment succeeded and the read-only production smoke passed 15 tests. The zero-change pantry migration is prepared separately and remains unapplied pending explicit approval.
