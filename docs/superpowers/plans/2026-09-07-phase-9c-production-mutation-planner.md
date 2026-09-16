# Phase 9C Production Catalog Mutation Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, fail-closed, offline `CatalogMutationPlanV1` planner that converts one exact Phase 9A catalog pack plus its exact Phase 9B resolved manifest into a dependency-safe dry-run application-command plan without performing production I/O or inventing production UUIDs.

**Architecture:** Keep Phase 9C entirely under `scripts/catalog-pack`. A strict manifest parser and focused contract module feed one pure local planner that replays Phase 9A, verifies pack/manifest integrity, constructs typed symbolic bindings plus application-command payload templates, builds a DAG, and emits one canonical topological order. A thin Node 24 CLI only reads/writes local files and delegates all planning semantics to the pure planner.

**Tech Stack:** Node 24, TypeScript strict mode, Vitest 4, existing Phase 9A validation/report code, existing Phase 9B resolver/types, Node `crypto` SHA-256, repository canonical JSON conventions. No new runtime dependency is required.

**Spec:** `docs/superpowers/specs/2026-09-07-phase-9c-production-mutation-planner-design.md`

## Global Constraints

- Phase 9C is dry-run only: zero Supabase, Vercel, HTTP admin, RPC, database, auth, Gemini, or other remote I/O.
- Do not read `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, Gemini credentials, deployment configuration, clock, hostname, process ID, or random source while constructing a plan.
- Do not add migrations, schema changes, API handlers, production credentials, deployment workflow, PR creation, merge, or production mutation.
- Re-run Phase 9A against the exact input pack bytes and require `valid=true` and `ready=true` before planning.
- Strictly parse the Phase 9B manifest; reject unknown schema versions, malformed/unknown keys, `resolved=false`, error diagnostics, conflicts, collisions, missing required reference IDs, and invalid state combinations.
- Require `manifest.catalogCode === pack.catalogCode` and `manifest.inputSha256 === sha256(exact pack bytes)`.
- Carry `productionSnapshotSha256` from the Phase 9B manifest as provenance; Phase 9C must not recompute it with a production read.
- Hash exact manifest bytes into `resolvedManifestSha256`.
- Existing production IDs come only from the Phase 9B manifest.
- Missing production identity/version UUIDs are represented only by non-UUID symbolic handles and executor-time `allocate_uuid` bindings; never call `randomUUID()` in Phase 9C.
- Target only existing application commands: `create_food`, `save_food_fact_draft`, `publish_food_fact`, `create_recipe`, `save_recipe_version_draft`, `publish_recipe`, `create_price_book`, `save_price_book_draft`, `publish_price_book`, `create_meal_option`, `save_meal_option_version_draft`, `publish_meal_option`.
- Do not emit retire, rename, repair, SQL, direct PostgREST, or direct RPC operations.
- New food-fact, recipe-version, and meal-option-version first-save templates use literal `expectedRevision: 1`; publish operations reference the exact revision output returned by their preceding save operation.
- Price-book save references the exact ID/revision returned by `create_price_book`; price-book publish references the exact revision returned by `save_price_book_draft`.
- Preserve validated source decimal/date/editorial strings exactly; only canonical structural ordering is allowed.
- Same exact pack bytes + same exact manifest bytes must produce byte-equivalent plan output.
- TDD is mandatory: each behavior task starts RED, proceeds to minimal GREEN, then commits.
- No feature development on `main`; implement only on `codex/phase-9c-production-mutation-planner` or an isolated worktree created from it.
- Do not modify Phase 9A/9B behavior to make Phase 9C easier.
- Do not claim completion until focused tests, formatting, lint, typecheck, full `verify:web`, `git diff --check`, clean status, push, and exact-final-HEAD GitHub CI evidence are green.

---

## File Structure

Create or modify only these files unless a focused test proves one narrowly required adjacent Phase 9C change:

- `scripts/catalog-pack/catalog-mutation-types.ts` — stable Phase 9C plan, diagnostic, binding, template-reference, and operation contracts.
- `scripts/catalog-pack/catalog-mutation-manifest-parser.ts` — strict UTF-8/JSON/shape parser for `ResolvedCatalogManifestV1`; no planning logic.
- `scripts/catalog-pack/catalog-mutation-test-builder.ts` — deterministic Phase 9C fixture built from the existing `buildReadyCatalogPack`, Phase 9B snapshot builder, and Phase 9B resolver.
- `scripts/catalog-pack/catalog-mutation-planner.ts` — Phase 9A replay, integrity gates, binding construction, command templates, DAG validation/order, hashing, and final plan creation.
- `scripts/catalog-pack/catalog-mutation-planner.test.ts` — pure planner tests.
- `scripts/catalog-pack/catalog-mutation-cli.ts` — local-file CLI only.
- `scripts/catalog-pack/catalog-mutation-cli.test.ts` — CLI argument, exit-code, and byte-output tests.
- `scripts/catalog-pack/catalog-mutation-authority-regression.test.ts` — static zero-production-authority regression.
- `package.json` — add only `catalog:plan`.

No `tsconfig` change is planned because `tsconfig.node.json` already includes `scripts/**/*`.

---

### Task 1: Lock Phase 9C contracts, fixture, and strict manifest parser

**Files:**
- Create: `scripts/catalog-pack/catalog-mutation-types.ts`
- Create: `scripts/catalog-pack/catalog-mutation-manifest-parser.ts`
- Create: `scripts/catalog-pack/catalog-mutation-test-builder.ts`
- Create/Test: `scripts/catalog-pack/catalog-mutation-planner.test.ts`

**Interfaces:**

Consumes:

```ts
import type { CatalogPackV1 } from "./catalog-pack-types.ts"
import { buildReadyCatalogPack } from "./catalog-pack-test-builder.ts"
import { buildResolvableProductionSnapshot } from "./catalog-production-test-builder.ts"
import { resolveCatalogProductionReferences } from "./catalog-production-resolver.ts"
import type { ResolvedCatalogManifestV1 } from "./catalog-production-types.ts"
```

Produces these exact Phase 9C contracts:

```ts
export type CatalogMutationDiagnosticCode =
  | "PHASE_9A_INVALID"
  | "PHASE_9A_NOT_READY"
  | "MANIFEST_INVALID"
  | "MANIFEST_NOT_RESOLVED"
  | "INPUT_SHA_MISMATCH"
  | "CATALOG_CODE_MISMATCH"
  | "REFERENCE_MISSING"
  | "REFERENCE_STATE_INVALID"
  | "IDENTITY_STATE_INVALID"
  | "VERSION_STATE_INVALID"
  | "MANIFEST_TARGET_MISSING"
  | "MANIFEST_TARGET_DUPLICATE"
  | "DEPENDENCY_MISSING"
  | "DEPENDENCY_CYCLE"
  | "UNSUPPORTED_OPERATION"

export interface CatalogMutationDiagnostic {
  readonly severity: "error"
  readonly code: CatalogMutationDiagnosticCode
  readonly path: string
  readonly message: string
}

export interface MutationBindingReference {
  readonly $binding: string
}

export interface MutationOperationOutputReference {
  readonly $operationOutput: {
    readonly operationId: string
    readonly field: "id" | "revision"
  }
}

export type MutationPlanBindingSource =
  | { readonly kind: "resolved_uuid"; readonly id: string }
  | { readonly kind: "operation_output"; readonly operationId: string; readonly field: "id" }
  | { readonly kind: "allocate_uuid" }

export interface MutationPlanBindingV1 {
  readonly handle: string
  readonly source: MutationPlanBindingSource
}

export type CatalogMutationOperationKind =
  | "create_food"
  | "save_food_fact_draft"
  | "publish_food_fact"
  | "create_recipe"
  | "save_recipe_version_draft"
  | "publish_recipe"
  | "create_price_book"
  | "save_price_book_draft"
  | "publish_price_book"
  | "create_meal_option"
  | "save_meal_option_version_draft"
  | "publish_meal_option"

export interface CatalogMutationPlanOperationV1 {
  readonly operationId: string
  readonly kind: CatalogMutationOperationKind
  readonly logicalKey: string
  readonly dependsOn: readonly string[]
  readonly input: unknown
  readonly outputs: readonly ("id" | "revision" | "status")[]
}

export interface CatalogMutationPlanV1 {
  readonly schemaVersion: "1"
  readonly catalogCode: string | null
  readonly inputSha256: string
  readonly resolvedManifestSha256: string
  readonly productionSnapshotSha256: string
  readonly executable: boolean
  readonly operations: readonly CatalogMutationPlanOperationV1[]
  readonly bindings: readonly MutationPlanBindingV1[]
  readonly diagnostics: readonly CatalogMutationDiagnostic[]
}
```

Produces parser:

```ts
export type ParseResolvedManifestResult =
  | { readonly ok: true; readonly manifest: ResolvedCatalogManifestV1 }
  | { readonly ok: false }

export function parseResolvedCatalogManifestBytes(
  bytes: Uint8Array
): ParseResolvedManifestResult
```

Produces fixture:

```ts
export interface CatalogMutationPlanningFixture {
  readonly pack: CatalogPackV1
  readonly packBytes: Uint8Array
  readonly inputSha256: string
  readonly manifest: ResolvedCatalogManifestV1
  readonly manifestBytes: Uint8Array
}

export function encodeJson(value: unknown): Uint8Array
export function sha256(bytes: Uint8Array): string
export function buildPlanningFixture(): CatalogMutationPlanningFixture
```

- [ ] **Step 1: Write the failing parser/contract tests**

Start `catalog-mutation-planner.test.ts` with parser behavior that uses the actual repository fixture name:

```ts
import { describe, expect, test } from "vitest"

import { buildPlanningFixture, encodeJson } from "./catalog-mutation-test-builder.ts"
import { parseResolvedCatalogManifestBytes } from "./catalog-mutation-manifest-parser.ts"

describe("parseResolvedCatalogManifestBytes", () => {
  test("accepts a Phase 9B manifest built from the ready Phase 9A fixture", () => {
    const fixture = buildPlanningFixture()
    expect(parseResolvedCatalogManifestBytes(fixture.manifestBytes)).toEqual({
      ok: true,
      manifest: fixture.manifest
    })
  })

  test("rejects an unknown top-level key", () => {
    const fixture = buildPlanningFixture()
    expect(
      parseResolvedCatalogManifestBytes(
        encodeJson({ ...fixture.manifest, productionOverride: true })
      )
    ).toEqual({ ok: false })
  })

  test("rejects an unsupported schema version", () => {
    const fixture = buildPlanningFixture()
    expect(
      parseResolvedCatalogManifestBytes(encodeJson({ ...fixture.manifest, schemaVersion: "2" }))
    ).toEqual({ ok: false })
  })
})
```

Add separate cases for malformed UTF-8, malformed JSON, unknown nested keys, invalid state/status enum values, invalid SHA-256 fields, and malformed UUID-shaped non-null production IDs.

- [ ] **Step 2: Run RED**

```bash
npx vitest run scripts/catalog-pack/catalog-mutation-planner.test.ts --reporter=verbose
```

Expected: FAIL because the three Phase 9C modules do not exist.

- [ ] **Step 3: Implement the contracts and deterministic fixture**

`catalog-mutation-test-builder.ts` must use the existing ready fixture and Phase 9B logic rather than reimplementing them:

```ts
import { createHash } from "node:crypto"

export function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

export function buildPlanningFixture(): CatalogMutationPlanningFixture {
  const pack = buildReadyCatalogPack()
  const packBytes = encodeJson(pack)
  const inputSha256 = sha256(packBytes)
  const manifest = resolveCatalogProductionReferences(
    pack,
    inputSha256,
    buildResolvableProductionSnapshot(pack)
  )
  const manifestBytes = encodeJson(manifest)
  return { pack, packBytes, inputSha256, manifest, manifestBytes }
}
```

Do not hard-code another catalog fixture.

- [ ] **Step 4: Implement the strict manifest parser**

Use explicit exact-key guards or strict local schemas. Do not coerce strings/numbers and do not return parser/vendor error text.

Use the repository-compatible UUID lexical check rather than requiring an RFC version/variant bit pattern, because existing Phase 9B synthetic fixtures deliberately use deterministic UUID-shaped IDs:

```ts
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu
const SHA256 = /^[0-9a-f]{64}$/u

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}
```

Validate all nested arrays/objects from `ResolvedCatalogManifestV1`; permit `null` only where Phase 9B permits it. A resolved reference's `id`, a non-null identity/version `id`, `regionId`, and recipe-tag ID must match `UUID_SHAPE`. Permit only exact Phase 9B state/status/kind enums.

- [ ] **Step 5: Run GREEN and typecheck**

```bash
npx vitest run scripts/catalog-pack/catalog-mutation-planner.test.ts --reporter=verbose
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add scripts/catalog-pack/catalog-mutation-types.ts \
  scripts/catalog-pack/catalog-mutation-manifest-parser.ts \
  scripts/catalog-pack/catalog-mutation-test-builder.ts \
  scripts/catalog-pack/catalog-mutation-planner.test.ts
git commit -m "feat: add Phase 9C mutation plan contracts"
```

---

### Task 2: Add Phase 9A replay, manifest integrity gates, and symbolic bindings

**Files:**
- Create: `scripts/catalog-pack/catalog-mutation-planner.ts`
- Modify/Test: `scripts/catalog-pack/catalog-mutation-planner.test.ts`
- Modify: `scripts/catalog-pack/catalog-mutation-test-builder.ts`

**Interfaces:**

Consumes:

```ts
validateCatalogPackBytes(inputBytes)
validateCatalogPackValue(value)
parseResolvedCatalogManifestBytes(manifestBytes)
```

Produces:

```ts
export function planCatalogMutations(
  inputBytes: Uint8Array,
  manifestBytes: Uint8Array
): CatalogMutationPlanV1
```

Stable handles:

```ts
const foodIdentityHandle = (code: string): string => `identity:food:${code}`
const foodFactVersionHandle = (code: string, version: number): string =>
  `version:food_fact:${code}:${version}`
const recipeIdentityHandle = (code: string): string => `identity:recipe:${code}`
const recipeVersionHandle = (code: string, version: number): string =>
  `version:recipe:${code}:${version}`
const priceBookHandle = (regionCode: string, version: number): string =>
  `identity:price_book:${regionCode}:${version}`
const mealOptionIdentityHandle = (code: string): string => `identity:meal_option:${code}`
const mealOptionVersionHandle = (code: string, version: number): string =>
  `version:meal_option:${code}:${version}`
```

- [ ] **Step 1: Add failing gate tests**

Cover exactly:

1. Phase 9A invalid -> `PHASE_9A_INVALID`, no operations/bindings.
2. Phase 9A valid but not ready -> `PHASE_9A_NOT_READY`.
3. malformed manifest -> `MANIFEST_INVALID`.
4. parsed manifest with `resolved=false` or any error diagnostic -> `MANIFEST_NOT_RESOLVED`.
5. exact pack SHA mismatch -> `INPUT_SHA_MISMATCH`.
6. catalog code mismatch -> `CATALOG_CODE_MISMATCH`.
7. missing/null required resolved reference ID -> `REFERENCE_MISSING`.
8. identity `conflict` -> `IDENTITY_STATE_INVALID`.
9. version `collision` -> `VERSION_STATE_INVALID`.
10. duplicate or absent manifest target for a pack food/recipe/meal option -> `MANIFEST_TARGET_DUPLICATE` / `MANIFEST_TARGET_MISSING`.
11. mismatched requested version number -> `VERSION_STATE_INVALID`.

Use fixture mutation helpers that return a new manifest object and then `encodeJson`; do not mutate the shared fixture in place.

- [ ] **Step 2: Add failing binding tests**

The default Phase 9B fixture contains missing identities, so require symbolic sources:

```ts
const fixture = buildPlanningFixture()
const plan = planCatalogMutations(fixture.packBytes, fixture.manifestBytes)

expect(plan.bindings).toContainEqual({
  handle: "identity:food:test_tofu",
  source: {
    kind: "operation_output",
    operationId: "create_food:test_tofu",
    field: "id"
  }
})
expect(plan.bindings).toContainEqual({
  handle: "version:food_fact:test_tofu:1",
  source: { kind: "allocate_uuid" }
})
```

Create one fixture variant with `test_tofu` represented as an existing compatible production identity and require:

```ts
expect(plan.bindings).toContainEqual({
  handle: "identity:food:test_tofu",
  source: { kind: "resolved_uuid", id: existingFoodId }
})
```

Also require all symbolic handles to fail `UUID_SHAPE`.

- [ ] **Step 3: Run RED**

```bash
npx vitest run scripts/catalog-pack/catalog-mutation-planner.test.ts --reporter=verbose
```

Expected: FAIL because `planCatalogMutations` does not exist.

- [ ] **Step 4: Implement exact-byte hashing and fail-closed gates**

In `catalog-mutation-planner.ts`:

```ts
import { createHash } from "node:crypto"

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function failurePlan(
  catalogCode: string | null,
  inputSha256: string,
  resolvedManifestSha256: string,
  productionSnapshotSha256: string,
  diagnostic: CatalogMutationDiagnostic
): CatalogMutationPlanV1 {
  return {
    schemaVersion: "1",
    catalogCode,
    inputSha256,
    resolvedManifestSha256,
    productionSnapshotSha256,
    executable: false,
    operations: [],
    bindings: [],
    diagnostics: [diagnostic]
  }
}
```

Gate order:

```ts
const phase9A = validateCatalogPackBytes(inputBytes)
if (!phase9A.valid) return fail("PHASE_9A_INVALID")
if (!phase9A.ready) return fail("PHASE_9A_NOT_READY")

const parsedManifest = parseResolvedCatalogManifestBytes(manifestBytes)
if (!parsedManifest.ok) return fail("MANIFEST_INVALID")
const manifest = parsedManifest.manifest
if (!manifest.resolved || manifest.diagnostics.length !== 0) {
  return fail("MANIFEST_NOT_RESOLVED")
}
if (manifest.inputSha256 !== phase9A.inputSha256) return fail("INPUT_SHA_MISMATCH")
if (manifest.catalogCode !== phase9A.catalogCode) return fail("CATALOG_CODE_MISMATCH")
```

Only after Phase 9A succeeds, decode JSON and call `validateCatalogPackValue(value).pack` to recover the typed pack, matching the existing Phase 9B CLI's defensive pattern.

- [ ] **Step 5: Validate all manifest references and target states**

Validate every Phase 9B reference collection even if the later application command passes a logical code instead of the UUID. This preserves the Phase 9B safety gate.

Required production reference IDs:

- every unit used by the pack;
- every category and ancestry category represented by Phase 9B;
- all resolved allergens;
- all resolved nutrients;
- every dietary tag used by the pack;
- `priceRegion`;
- every recipe tag used by recipes or meal-option structured fields.

For food/recipe/meal-option targets, allow only:

```text
identity existing + non-null id
identity missing + null id
version missing + null id
version pending_parent_creation + null id
```

Reject `conflict`, `collision`, unknown state, a non-null ID in a missing/new slot, or a null ID in an existing slot.

Price-book target must exist, match pack region/version exactly, have a real region ID, and have version state `missing` with `id: null`; Phase 9B collision is non-executable.

- [ ] **Step 6: Build canonical bindings**

Create bindings only for values a later command template actually needs as IDs:

- units: `reference:unit:<code>` -> resolved UUID;
- leaf category used as `categoryId`: `reference:category:<code>` -> resolved UUID;
- recipe tags: `reference:recipe_tag:<kind>:<semantic-code>` -> resolved UUID;
- price region: `reference:price_region:<code>` -> resolved UUID;
- food/recipe/meal-option identities;
- food-fact/recipe-version/meal-option-version executor-time UUID allocations;
- price-book ID from `create_price_book` operation output.

Do **not** add unused ID bindings for allergens, nutrients, or dietary tags because the current application command accepts their canonical codes. Still validate their Phase 9B resolution in Step 5.

Sort bindings by `handle` using explicit code-point lexical comparison.

- [ ] **Step 7: Run GREEN and typecheck**

```bash
npx vitest run scripts/catalog-pack/catalog-mutation-planner.test.ts --reporter=verbose
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add scripts/catalog-pack/catalog-mutation-planner.ts \
  scripts/catalog-pack/catalog-mutation-planner.test.ts \
  scripts/catalog-pack/catalog-mutation-test-builder.ts
git commit -m "feat: add Phase 9C planning gates"
```

---

### Task 3: Build exact command templates, DAG dependencies, and canonical order

**Files:**
- Modify: `scripts/catalog-pack/catalog-mutation-planner.ts`
- Modify/Test: `scripts/catalog-pack/catalog-mutation-planner.test.ts`

**Interfaces:**

Produces exact operation IDs:

```ts
const operationId = {
  createFood: (code: string) => `create_food:${code}`,
  saveFoodFact: (code: string, version: number) => `save_food_fact_draft:${code}:${version}`,
  publishFoodFact: (code: string, version: number) => `publish_food_fact:${code}:${version}`,
  createRecipe: (code: string) => `create_recipe:${code}`,
  saveRecipe: (code: string, version: number) => `save_recipe_version_draft:${code}:${version}`,
  publishRecipe: (code: string, version: number) => `publish_recipe:${code}:${version}`,
  createPriceBook: (region: string, version: number) => `create_price_book:${region}:${version}`,
  savePriceBook: (region: string, version: number) => `save_price_book_draft:${region}:${version}`,
  publishPriceBook: (region: string, version: number) => `publish_price_book:${region}:${version}`,
  createMealOption: (code: string) => `create_meal_option:${code}`,
  saveMealOption: (code: string, version: number) => `save_meal_option_version_draft:${code}:${version}`,
  publishMealOption: (code: string, version: number) => `publish_meal_option:${code}:${version}`
} as const
```

Template helpers:

```ts
const bind = (handle: string): MutationBindingReference => ({ $binding: handle })
const output = (
  operationId: string,
  field: "id" | "revision"
): MutationOperationOutputReference => ({ $operationOutput: { operationId, field } })
```

DAG helper:

```ts
export function orderMutationOperations(
  operations: readonly CatalogMutationPlanOperationV1[]
):
  | { readonly ok: true; readonly operations: readonly CatalogMutationPlanOperationV1[] }
  | { readonly ok: false; readonly code: "DEPENDENCY_MISSING" | "DEPENDENCY_CYCLE" }
```

- [ ] **Step 1: Write failing food command-template tests**

Use actual fixture code `test_tofu`:

```ts
expect(byId(plan, "create_food:test_tofu")).toMatchObject({
  kind: "create_food",
  input: {
    code: "test_tofu",
    nameVi: "Đậu hũ kiểm thử",
    baseDimension: "mass",
    baseUnitId: { $binding: "reference:unit:g" }
  }
})
```

Require `save_food_fact_draft:test_tofu:1` to include:

- `foodFactVersionId: {$binding:"version:food_fact:test_tofu:1"}`;
- literal `expectedRevision: 1`;
- `foodId` identity binding;
- exact version number;
- resolved leaf `categoryId` binding;
- exact pack `edibleFraction` and provenance;
- allergen assessments with exact canonical codes/status/provenance from the pack;
- nutrients with exact canonical codes/decimal strings/provenance;
- `categoryAncestry` preserved exactly as validated Phase 9A code strings;
- `dietaryTagCodes` preserved exactly as pack code strings;
- conversions with exact numeric/provenance strings and `unitId` replaced by the resolved unit binding.

Require publish to use the same version binding plus the save operation's returned revision:

```ts
expect(byId(plan, "publish_food_fact:test_tofu:1")?.input).toEqual({
  foodFactVersionId: { $binding: "version:food_fact:test_tofu:1" },
  expectedRevision: {
    $operationOutput: {
      operationId: "save_food_fact_draft:test_tofu:1",
      field: "revision"
    }
  }
})
```

- [ ] **Step 2: Write failing recipe command-template tests**

For `test_tofu_recipe`, require stable command-local ingredient IDs:

```ts
recipeIngredientId: "ingredient:test_tofu_recipe:test_tofu_recipe_ingredient"
```

This string is a deterministic correlation key for the application command, not a production row UUID. Step `ingredientIds` must refer to the same string.

Require ingredient `foodId`, `foodFactVersionId`, and `unitId` through bindings; exact quantity/note/order from pack. Require exact step text/timer/order and `tagIds` mapped from the Phase 9B recipe-tag IDs.

Require first save `expectedRevision: 1`; recipe publish revision must come from the save operation output.

If recipe identity is `existing`, assert no `create_recipe:<code>` operation is emitted and the save still uses the resolved identity binding.

- [ ] **Step 3: Write failing price-book command-template tests**

Require:

```ts
expect(byId(plan, "create_price_book:vn_baseline:1")?.input).toEqual({
  regionId: { $binding: "reference:price_region:vn_baseline" },
  versionNumber: 1,
  effectiveFrom: fixture.pack.priceBook.effectiveFrom,
  effectiveTo: fixture.pack.priceBook.effectiveTo
})
```

`save_price_book_draft` must bind:

- `priceBookId` to `identity:price_book:vn_baseline:1`;
- `expectedRevision` to `create_price_book:vn_baseline:1` revision output;
- exact effective dates;
- each price's exact source values;
- `foodId`, `foodFactVersionId`, package unit, and base unit through bindings.

Use deterministic command-local `foodPriceId`:

```ts
`price:vn_baseline:1:${price.foodCode}`
```

The current repository does not use that field as the inserted production row ID; it exists because the application command contract requires a stable string. Do not allocate a production UUID for it in Phase 9C.

Price-book publish must use save operation revision output.

- [ ] **Step 4: Write failing meal-option command-template tests**

For each missing meal option, require `create_meal_option` with exact code/name.

`save_meal_option_version_draft` must include:

- allocated version binding;
- identity binding;
- literal `expectedRevision: 1`;
- exact version/yield/time values;
- exact components with recipe identity/version bindings, quantity multiplier, meal role, order;
- tag IDs containing exactly the resolved protein-hint, cooking-style, and dish-role tag IDs required by the pack, canonically sorted by their stable reference handle.

Publish uses version binding plus save revision output.

- [ ] **Step 5: Write failing dependency and ordering tests**

Require these dependency rules:

- food fact save -> optional food create when identity missing;
- food fact publish -> food fact save;
- recipe save -> optional recipe create + every referenced food-fact publish operation created by this plan;
- recipe publish -> recipe save;
- price-book save -> price-book create + referenced food-fact publish operations created by this plan;
- price-book publish -> price-book save;
- meal-option save -> optional meal-option create + every referenced recipe publish operation created by this plan;
- meal-option publish -> meal-option save.

For an already-existing external dependency, do not invent a fake operation; its resolved binding is sufficient.

Require fixed bucket ranks:

```ts
const rank: Record<CatalogMutationOperationKind, number> = {
  create_food: 1,
  save_food_fact_draft: 2,
  publish_food_fact: 3,
  create_recipe: 4,
  save_recipe_version_draft: 5,
  publish_recipe: 6,
  create_price_book: 7,
  save_price_book_draft: 8,
  publish_price_book: 9,
  create_meal_option: 10,
  save_meal_option_version_draft: 11,
  publish_meal_option: 12
}
```

Test missing dependency -> `DEPENDENCY_MISSING`; cycle -> `DEPENDENCY_CYCLE`.

Test each emitted operation's dependencies exist and appear earlier in the final order.

- [ ] **Step 6: Write failing determinism tests**

Exact same byte inputs twice must be byte-equivalent:

```ts
const first = planCatalogMutations(fixture.packBytes, fixture.manifestBytes)
const second = planCatalogMutations(fixture.packBytes, fixture.manifestBytes)
expect(JSON.stringify(first)).toBe(JSON.stringify(second))
```

For a semantically equivalent pack whose source arrays are shuffled, rebuild its matching Phase 9B manifest and assert `operations` and `bindings` are equal after canonical Phase 9C ordering. Do **not** compare the whole plan because exact pack/manifest byte hashes are intentionally different provenance.

Require success provenance:

```ts
expect(plan).toMatchObject({
  schemaVersion: "1",
  catalogCode: fixture.pack.catalogCode,
  inputSha256: fixture.inputSha256,
  resolvedManifestSha256: sha256(fixture.manifestBytes),
  productionSnapshotSha256: fixture.manifest.productionSnapshotSha256,
  executable: true,
  diagnostics: []
})
```

- [ ] **Step 7: Run RED**

```bash
npx vitest run scripts/catalog-pack/catalog-mutation-planner.test.ts --reporter=verbose
```

Expected: FAIL because Task 2 has gates/bindings but not the complete command DAG.

- [ ] **Step 8: Implement exact command operations**

Build only the 12 allowlisted command kinds. Do not import/call application executors or repositories.

Every operation must set `logicalKey` to a stable entity/version key. Sort any set-like tag binding list canonically; preserve source order where order is authoritative (`ingredients`, `steps`, `components`) after verifying Phase 9A already guaranteed contiguous order.

Do not emit content hashes in publish inputs. Existing application publish executors reload the aggregate, validate it, canonicalize it, calculate the content hash, then write; Phase 9C must preserve that authority boundary.

- [ ] **Step 9: Implement DAG validation and deterministic topological order**

Use Kahn's algorithm. When multiple zero-indegree operations are available, choose by `(rank, logicalKey, operationId)` using explicit `<`/`>` lexical comparison. Canonically sort each `dependsOn` array before output.

If a missing dependency or cycle is found, return a non-executable plan with the corresponding stable diagnostic and no partially executable `operations` list.

- [ ] **Step 10: Run GREEN, typecheck, and format check**

```bash
npx vitest run scripts/catalog-pack/catalog-mutation-planner.test.ts --reporter=verbose
npm run typecheck
npm run format:check
```

Expected: PASS. If only new files need formatting:

```bash
npx prettier --write scripts/catalog-pack/catalog-mutation-*.ts
```

Then rerun all three commands.

- [ ] **Step 11: Commit Task 3**

```bash
git add scripts/catalog-pack/catalog-mutation-planner.ts \
  scripts/catalog-pack/catalog-mutation-planner.test.ts \
  scripts/catalog-pack/catalog-mutation-types.ts \
  scripts/catalog-pack/catalog-mutation-test-builder.ts
git commit -m "feat: build Phase 9C mutation plan DAG"
```

---

### Task 4: Add the offline `catalog:plan` CLI

**Files:**
- Create: `scripts/catalog-pack/catalog-mutation-cli.ts`
- Create/Test: `scripts/catalog-pack/catalog-mutation-cli.test.ts`
- Modify: `package.json`

**Interfaces:**

Consumes:

```ts
planCatalogMutations(inputBytes, manifestBytes)
```

Produces:

```ts
export interface CatalogPlanCliDependencies {
  readonly stdout: (value: string) => void
  readonly stderr: (value: string) => void
}

export function runCatalogPlanCli(
  argv: readonly string[],
  dependencies?: CatalogPlanCliDependencies
): number
```

Command:

```bash
npm run catalog:plan -- --input <catalog.json> --manifest <catalog.resolved.json> [--output <catalog.plan.json>]
```

Exit codes:

- `0` executable dry-run plan emitted;
- `1` usage/unreadable local input/unreadable local manifest/unwritable local output;
- `2` Phase 9A invalid;
- `3` Phase 9A valid but not ready;
- `4` manifest invalid/not resolved/integrity/state/dependency planning failure.

- [ ] **Step 1: Write failing CLI tests**

Cover unknown args, duplicate args, missing values, missing `--input`, missing `--manifest`, unreadable pack, unreadable manifest, unwritable output, Phase 9A exit 2, not-ready exit 3, manifest/integrity exit 4, and executable exit 0.

Representative usage assertion:

```ts
expect(runCatalogPlanCli(["--input", "pack.json"], deps)).toBe(1)
expect(stderr).toHaveBeenCalledWith(
  "Usage: npm run catalog:plan -- --input <path> --manifest <path> [--output <path>]\n"
)
```

Use temp directories/files for byte-output tests.

- [ ] **Step 2: Run RED**

```bash
npx vitest run scripts/catalog-pack/catalog-mutation-cli.test.ts --reporter=verbose
```

Expected: FAIL because the CLI does not exist.

- [ ] **Step 3: Implement strict argument parsing and local I/O**

Use only `node:fs`, `node:process`, and `node:url` runtime helpers. Do not read `process.env`.

```ts
const USAGE =
  "Usage: npm run catalog:plan -- --input <path> --manifest <path> [--output <path>]"
```

Read pack and manifest as exact bytes with `readFileSync`. Do not include raw filesystem exception text in deterministic plan JSON or stderr.

Serialize once:

```ts
function serializePlan(plan: CatalogMutationPlanV1): string {
  return `${JSON.stringify(plan, null, 2)}\n`
}
```

Use the exact same serialized string for stdout and optional output file.

Map diagnostics:

```ts
if (plan.executable) return 0
const code = plan.diagnostics[0]?.code
if (code === "PHASE_9A_INVALID") return 2
if (code === "PHASE_9A_NOT_READY") return 3
return 4
```

- [ ] **Step 4: Add the package script**

Add beside the two existing catalog commands:

```json
"catalog:plan": "node scripts/catalog-pack/catalog-mutation-cli.ts"
```

Do not change dependencies or unrelated scripts.

- [ ] **Step 5: Run GREEN and typecheck**

```bash
npx vitest run \
  scripts/catalog-pack/catalog-mutation-planner.test.ts \
  scripts/catalog-pack/catalog-mutation-cli.test.ts \
  --reporter=verbose
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add scripts/catalog-pack/catalog-mutation-cli.ts \
  scripts/catalog-pack/catalog-mutation-cli.test.ts \
  package.json
git commit -m "feat: add Phase 9C mutation plan CLI"
```

---

### Task 5: Prove zero production authority and run final verification

**Files:**
- Create/Test: `scripts/catalog-pack/catalog-mutation-authority-regression.test.ts`
- Modify only Phase 9C files if verification exposes a Phase 9C-scoped defect.

**Interfaces:**
- Consumes final Phase 9C source files.
- Produces static authority-boundary evidence and exact-final-HEAD verification evidence.

- [ ] **Step 1: Add the authority regression test**

```ts
import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"

const phase9CFiles = [
  "scripts/catalog-pack/catalog-mutation-manifest-parser.ts",
  "scripts/catalog-pack/catalog-mutation-planner.ts",
  "scripts/catalog-pack/catalog-mutation-cli.ts"
]

const forbidden = [
  /@supabase\/supabase-js/u,
  /createClient\s*\(/u,
  /\.rpc\s*\(/u,
  /\.insert\s*\(/u,
  /\.upsert\s*\(/u,
  /\.update\s*\(/u,
  /\.delete\s*\(/u,
  /process\.env/u,
  /SUPABASE_/u,
  /GEMINI_/u,
  /fetch\s*\(/u,
  /randomUUID\s*\(/u,
  /api\/admin/u,
  /supabase-catalog-admin-repository/u,
  /supabase-meal-option-admin-repository/u,
  /executeCatalogAdminCommand/u,
  /executeMealOptionAdminCommand/u
]

describe("Phase 9C authority boundary", () => {
  test.each(phase9CFiles)("keeps %s offline and non-mutating", (path) => {
    const source = readFileSync(path, "utf8")
    for (const pattern of forbidden) expect(source).not.toMatch(pattern)
  })
})
```

Also read `package.json` and assert `scripts["catalog:plan"] === "node scripts/catalog-pack/catalog-mutation-cli.ts"`.

- [ ] **Step 2: Run the authority test**

```bash
npx vitest run scripts/catalog-pack/catalog-mutation-authority-regression.test.ts --reporter=verbose
```

Expected: PASS. If it fails, remove the forbidden production/runtime dependency. Do not weaken a valid boundary check merely to make it green.

- [ ] **Step 3: Run all catalog-pack tests**

```bash
npx vitest run scripts/catalog-pack --reporter=verbose
```

Expected: PASS, including Phase 9A, 9B, and 9C tests.

- [ ] **Step 4: Run static gates**

```bash
npm run format:check
npm run lint
npm run typecheck
git diff --check
```

Expected: PASS.

If formatting only fails on new Phase 9C files/package JSON:

```bash
npx prettier --write scripts/catalog-pack/catalog-mutation-*.ts package.json
npm run format:check
npm run lint
npm run typecheck
git diff --check
```

- [ ] **Step 5: Run the full non-database verifier**

```bash
npm run verify:web
```

Expected: PASS, including environment validation, secret scan, dependency audit at moderate severity, formatting, lint, TypeScript, coverage, production build, and bundle check.

- [ ] **Step 6: Inspect scope before final commit**

```bash
git status --short
git diff --stat
git diff --check
```

Expected: only Phase 9C files and `package.json`. Preserve/exclude unrelated changes.

Stage only files that actually changed. If the only uncommitted file is the authority regression test:

```bash
git add scripts/catalog-pack/catalog-mutation-authority-regression.test.ts
git commit -m "test: lock Phase 9C authority boundary"
```

If formatting or a narrow defect changed another Phase 9C file, stage that exact file too; do not use a blanket add.

- [ ] **Step 7: Re-run verification on exact final local HEAD**

```bash
npx vitest run scripts/catalog-pack --reporter=verbose
npm run format:check
npm run lint
npm run typecheck
npm run verify:web
git diff --check
git status --short
git rev-parse HEAD
```

Expected: all PASS and working tree clean.

- [ ] **Step 8: Push the branch**

```bash
git push -u origin codex/phase-9c-production-mutation-planner
```

Expected: successful non-force push.

- [ ] **Step 9: Verify exact-final-HEAD GitHub Actions**

Fetch CI for the exact SHA from Step 7. Require the ordinary GitHub Actions checks applicable to the branch/PR context to complete successfully before reporting verified.

If authenticated automation pushes do not trigger the repository's ordinary CI, use only the already-established safe verification-trigger pattern: create/remove a harmless marker so CI runs, then prove the final source tree is byte-identical to the verified source commit using a zero-file compare. Do not alter Phase 9C source merely to trigger CI.

Do not create a PR, merge, deploy, run production migrations, or mutate production.

- [ ] **Step 10: Completion report**

Report only after exact-final evidence:

```text
TASK_COMPLETE_PUSHED
PHASE_9C_COMPLETE_VERIFIED
Branch: codex/phase-9c-production-mutation-planner
Final HEAD: <exact SHA>
Push: successful
Catalog-pack tests: PASS
format:check: PASS
lint: PASS
typecheck: PASS
verify:web: PASS
git diff --check: PASS
GitHub Actions exact-final-HEAD/source-identical verification: PASS
Production I/O/mutation: NOT PERFORMED
PR/merge/deploy: NOT PERFORMED
```

Do not use `PHASE_9C_COMPLETE_VERIFIED` while CI is failed, cancelled, pending, or unverified, or while the working tree is dirty.

---

## Plan Self-Review Record

Spec coverage is complete:

- exact pack + exact manifest inputs and byte hashes — Tasks 1-4;
- Phase 9A replay — Task 2;
- strict Phase 9B parse and `resolved=true` gate — Tasks 1-2;
- SHA/catalog/reference/identity/version integrity — Task 2;
- existing IDs only from Phase 9B — Task 2;
- symbolic identities/versions and executor-time UUID allocation — Tasks 1-3;
- first-save `expectedRevision: 1`, then authoritative operation-output revisions — Task 3;
- existing application command templates only — Task 3;
- correct code-vs-ID treatment for allergen/nutrient/dietary/category ancestry fields — Tasks 2-3;
- deterministic command-local recipe ingredient and price correlation IDs without claiming production UUIDs — Task 3;
- dependency DAG + fixed canonical topological order — Task 3;
- exact source values and tag resolution — Task 3;
- price-book and meal-option dependencies — Task 3;
- deterministic provenance/output — Tasks 2-4;
- offline CLI and stable exit codes — Task 4;
- zero production/network/env/random/executor authority — Task 5;
- no retire/SQL/direct RPC/migration/deploy — Global Constraints + Task 5;
- TDD, focused tests, full verifier, clean scope, push, and exact-final CI — all tasks + Task 5.

Placeholder scan: no `TBD`, `TODO`, "implement later", or undefined neighboring interface remains. Actual repository fixture names are used (`buildReadyCatalogPack`). UUID lexical validation is compatible with existing deterministic Phase 9B synthetic IDs while still distinguishing all symbolic handles from UUID-shaped production IDs. Full-plan byte equality is required only for identical input bytes; semantic shuffle tests compare canonical operations/bindings while allowing provenance hashes to differ as designed.
