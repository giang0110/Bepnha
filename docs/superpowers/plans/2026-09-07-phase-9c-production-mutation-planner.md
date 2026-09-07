# Phase 9C Production Catalog Mutation Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, fail-closed, offline `CatalogMutationPlanV1` planner that converts one exact Phase 9A catalog pack plus its exact Phase 9B resolved manifest into a dependency-safe dry-run application-command plan without performing production I/O or inventing production UUIDs.

**Architecture:** Keep Phase 9C entirely under `scripts/catalog-pack`. A strict manifest parser and small contract module feed one pure local planner that replays Phase 9A, verifies pack/manifest integrity, constructs typed symbolic bindings plus application-command templates, builds a DAG, and emits one canonical topological order. A thin Node 24 CLI only reads/writes local files and delegates all planning semantics to the pure planner.

**Tech Stack:** Node 24, TypeScript strict mode, Vitest 4, Zod 4 only if needed for local strict parsing, existing Phase 9A validator/report code, existing Phase 9B manifest types, Node `crypto` SHA-256, repository canonical JSON utilities.

**Spec:** `docs/superpowers/specs/2026-09-07-phase-9c-production-mutation-planner-design.md`

## Global Constraints

- Phase 9C is dry-run only: zero Supabase, Vercel, HTTP admin, RPC, database, auth, Gemini, or other remote I/O.
- Do not read `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, Gemini credentials, deployment configuration, clock, hostname, process ID, or random source while constructing a plan.
- Do not add migrations, schema changes, API handlers, production credentials, deployment workflow, PR creation, merge, or production mutation.
- Re-run Phase 9A against the exact input pack bytes and require `valid=true` and `ready=true` before planning.
- Strictly parse the Phase 9B manifest; reject unknown schema versions, malformed/unknown keys, `resolved=false`, error diagnostics, conflicts, collisions, missing required reference UUIDs, and invalid state combinations.
- Require `manifest.catalogCode === pack.catalogCode` and `manifest.inputSha256 === sha256(exact pack bytes)`.
- Carry `productionSnapshotSha256` from the Phase 9B manifest as provenance; Phase 9C must not recompute it with a production read.
- Hash exact manifest bytes into `resolvedManifestSha256`.
- Existing production UUIDs come only from the Phase 9B manifest.
- Missing production identity/version UUIDs are represented only by non-UUID symbolic handles and executor-time `allocate_uuid` bindings; never call `randomUUID()` in Phase 9C.
- Target only existing application commands: `create_food`, `save_food_fact_draft`, `publish_food_fact`, `create_recipe`, `save_recipe_version_draft`, `publish_recipe`, `create_price_book`, `save_price_book_draft`, `publish_price_book`, `create_meal_option`, `save_meal_option_version_draft`, `publish_meal_option`.
- Do not emit retire, rename, repair, SQL, direct PostgREST, or direct RPC operations.
- New food-fact, recipe-version, and meal-option-version first-save templates use literal `expectedRevision: 1`; publish operations reference the exact revision output returned by their preceding save operation.
- Price-book save references the exact ID/revision returned by `create_price_book`; price-book publish references the exact revision returned by `save_price_book_draft`.
- Preserve validated source decimal/date/editorial strings exactly; only canonical structural ordering is allowed.
- Same exact pack bytes + same exact manifest bytes must produce byte-equivalent plan output.
- TDD is mandatory: each behavior task starts RED, proceeds to minimal GREEN, then commits.
- No feature development on `main`; implement only on `codex/phase-9c-production-mutation-planner` or an isolated worktree created from it.
- Do not claim completion until focused tests, formatting, lint, typecheck, full `verify:web`, `git diff --check`, and exact-final-HEAD GitHub CI evidence are green. Database CI is not required by Phase 9C semantics because this phase contains no DB code, but ordinary repository CI may still run and must not be reported green until observed.

---

## File Structure

Create or modify only these Phase 9C files unless a test reveals a narrowly required adjacent change:

- `scripts/catalog-pack/catalog-mutation-types.ts` — stable Phase 9C plan, diagnostic, binding, reference-template, and operation contracts.
- `scripts/catalog-pack/catalog-mutation-manifest-parser.ts` — strict UTF-8/JSON/shape parser for `ResolvedCatalogManifestV1`; no planning logic.
- `scripts/catalog-pack/catalog-mutation-test-builder.ts` — deterministic synthetic Phase 9B manifest builder for Phase 9C tests, derived from existing Phase 9A/9B builders.
- `scripts/catalog-pack/catalog-mutation-planner.ts` — Phase 9A replay, integrity gates, binding construction, operation DAG construction, deterministic ordering, hashing, and final `CatalogMutationPlanV1` creation.
- `scripts/catalog-pack/catalog-mutation-planner.test.ts` — pure planner RED/GREEN coverage.
- `scripts/catalog-pack/catalog-mutation-cli.ts` — local-file CLI only; no environment/production dependencies.
- `scripts/catalog-pack/catalog-mutation-cli.test.ts` — CLI exit code, exact byte output, and local I/O tests.
- `scripts/catalog-pack/catalog-mutation-authority-regression.test.ts` — static regression proving Phase 9C files do not import/use production SDKs, env, network, RPC, mutation repositories, or random UUID allocation.
- `package.json` — add only `catalog:plan` script.

Do not modify Phase 9A or Phase 9B behavior to make Phase 9C easier. Consume their public functions/types as-is.

---

### Task 1: Lock Phase 9C contracts and strict manifest parsing

**Files:**
- Create: `scripts/catalog-pack/catalog-mutation-types.ts`
- Create: `scripts/catalog-pack/catalog-mutation-manifest-parser.ts`
- Create: `scripts/catalog-pack/catalog-mutation-test-builder.ts`
- Create/Test: `scripts/catalog-pack/catalog-mutation-planner.test.ts`

**Interfaces:**
- Consumes: `ResolvedCatalogManifestV1`, `ResolvedIdentityVersion`, and resolved reference types from `./catalog-production-types.ts`; `CatalogPackV1` test fixtures from `./catalog-pack-test-builder.ts`; resolvable production snapshots from `./catalog-production-test-builder.ts`; `resolveCatalogProductionReferences(pack, inputSha256, snapshot)` from Phase 9B.
- Produces:

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

- Produces parser:

```ts
export type ParseResolvedManifestResult =
  | { readonly ok: true; readonly manifest: ResolvedCatalogManifestV1 }
  | { readonly ok: false }

export function parseResolvedCatalogManifestBytes(
  bytes: Uint8Array
): ParseResolvedManifestResult
```

- Produces test helper:

```ts
export function buildResolvedManifestForPack(
  pack: CatalogPackV1,
  inputSha256: string
): ResolvedCatalogManifestV1
```

- [ ] **Step 1: Write the failing contract/parser tests**

Add tests that require a valid Phase 9B manifest to parse, malformed UTF-8/JSON to fail, unknown top-level keys to fail, unknown nested keys to fail, unsupported `schemaVersion` to fail, and malformed state/UUID fields to fail.

```ts
import { describe, expect, test } from "vitest"

import { buildValidCatalogPack } from "./catalog-pack-test-builder.ts"
import { buildResolvedManifestForPack } from "./catalog-mutation-test-builder.ts"
import { parseResolvedCatalogManifestBytes } from "./catalog-mutation-manifest-parser.ts"

const bytes = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value))

describe("parseResolvedCatalogManifestBytes", () => {
  test("accepts the exact Phase 9B manifest contract", () => {
    const pack = buildValidCatalogPack()
    const manifest = buildResolvedManifestForPack(pack, "a".repeat(64))
    expect(parseResolvedCatalogManifestBytes(bytes(manifest))).toEqual({ ok: true, manifest })
  })

  test("rejects unknown keys instead of silently dropping them", () => {
    const pack = buildValidCatalogPack()
    const manifest = buildResolvedManifestForPack(pack, "a".repeat(64))
    expect(
      parseResolvedCatalogManifestBytes(bytes({ ...manifest, productionOverride: true }))
    ).toEqual({ ok: false })
  })

  test("rejects unsupported manifest schema versions", () => {
    const pack = buildValidCatalogPack()
    const manifest = buildResolvedManifestForPack(pack, "a".repeat(64))
    expect(parseResolvedCatalogManifestBytes(bytes({ ...manifest, schemaVersion: "2" }))).toEqual({
      ok: false
    })
  })
})
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
npx vitest run scripts/catalog-pack/catalog-mutation-planner.test.ts --reporter=verbose
```

Expected: FAIL because `catalog-mutation-types.ts`, `catalog-mutation-manifest-parser.ts`, and `catalog-mutation-test-builder.ts` do not exist.

- [ ] **Step 3: Implement the stable contracts and strict parser**

Create `catalog-mutation-types.ts` with the exact interfaces above. Implement the manifest parser as a strict local parser. Use either Zod `.strict()` objects or explicit exact-key guards, but return only `{ ok: false }` on any parse/shape failure and never preserve raw parser/vendor text in future deterministic diagnostics.

The parser must validate all nested Phase 9B fields, including:

```ts
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const SHA256 = /^[0-9a-f]{64}$/u

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}
```

Validate resolved reference IDs and non-null existing identity IDs as UUIDs. Permit `null` exactly where the Phase 9B type permits it. Permit only the exact state/status enums already defined in `catalog-production-types.ts`.

Implement `buildResolvedManifestForPack` by using the existing Phase 9B resolver so tests do not duplicate resolution semantics:

```ts
export function buildResolvedManifestForPack(
  pack: CatalogPackV1,
  inputSha256: string
): ResolvedCatalogManifestV1 {
  return resolveCatalogProductionReferences(
    pack,
    inputSha256,
    buildResolvableProductionSnapshot(pack)
  )
}
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
npx vitest run scripts/catalog-pack/catalog-mutation-planner.test.ts --reporter=verbose
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

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

**Interfaces:**
- Consumes: `validateCatalogPackBytes(inputBytes)` from `./catalog-pack-report.ts`; `validateCatalogPackValue(value)` from `./catalog-pack-validator.ts`; `parseResolvedCatalogManifestBytes(manifestBytes)` from Task 1.
- Produces:

```ts
export function planCatalogMutations(
  inputBytes: Uint8Array,
  manifestBytes: Uint8Array
): CatalogMutationPlanV1
```

- Internal binding helpers with exact stable handle forms:

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

- [ ] **Step 1: Write failing gate and binding tests**

Cover these exact cases:

1. Phase 9A-invalid pack -> `PHASE_9A_INVALID`, `executable=false`, zero operations/bindings.
2. Phase 9A-valid but not ready -> `PHASE_9A_NOT_READY`.
3. malformed manifest -> `MANIFEST_INVALID`.
4. `resolved=false` -> `MANIFEST_NOT_RESOLVED`.
5. exact input SHA mismatch -> `INPUT_SHA_MISMATCH`.
6. catalog code mismatch -> `CATALOG_CODE_MISMATCH`.
7. missing required reference UUID -> `REFERENCE_MISSING`.
8. identity `conflict` -> `IDENTITY_STATE_INVALID`.
9. version `collision` -> `VERSION_STATE_INVALID`.
10. missing identity -> symbolic `operation_output` binding.
11. existing identity -> `resolved_uuid` binding using Phase 9B UUID.
12. every new food-fact/recipe-version/meal-option-version -> `allocate_uuid` binding.
13. no binding handle matches UUID syntax.

Representative tests:

```ts
test("binds an existing food identity to the Phase 9B UUID", () => {
  const { packBytes, manifestBytes, manifest } = buildPlanningFixture({ existingFood: true })
  const plan = planCatalogMutations(packBytes, manifestBytes)
  const food = manifest.foods[0]!

  expect(plan.bindings).toContainEqual({
    handle: `identity:food:${food.code}`,
    source: { kind: "resolved_uuid", id: food.identity.id }
  })
})

test("never fabricates a UUID for a new version", () => {
  const { packBytes, manifestBytes } = buildPlanningFixture()
  const plan = planCatalogMutations(packBytes, manifestBytes)

  expect(plan.bindings).toContainEqual({
    handle: "version:food_fact:gao_trang:1",
    source: { kind: "allocate_uuid" }
  })
})
```

Extend `catalog-mutation-test-builder.ts` with deterministic helpers that alter the otherwise resolved Phase 9B manifest without changing unrelated fields:

```ts
export function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}
```

- [ ] **Step 2: Run focused tests to verify RED**

```bash
npx vitest run scripts/catalog-pack/catalog-mutation-planner.test.ts --reporter=verbose
```

Expected: FAIL because `planCatalogMutations` does not exist.

- [ ] **Step 3: Implement the fail-closed source/manifest gates**

In `catalog-mutation-planner.ts`, hash exact bytes synchronously and construct deterministic failure plans:

```ts
import { createHash } from "node:crypto"

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function failedPlan(
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

Gate in this order so a malformed source never advances into later planning logic:

```ts
const phase9A = validateCatalogPackBytes(inputBytes)
if (!phase9A.valid) return failure("PHASE_9A_INVALID", ...)
if (!phase9A.ready) return failure("PHASE_9A_NOT_READY", ...)

const parsedManifest = parseResolvedCatalogManifestBytes(manifestBytes)
if (!parsedManifest.ok) return failure("MANIFEST_INVALID", ...)
if (!parsedManifest.manifest.resolved || parsedManifest.manifest.diagnostics.length > 0) {
  return failure("MANIFEST_NOT_RESOLVED", ...)
}
if (parsedManifest.manifest.inputSha256 !== phase9A.inputSha256) {
  return failure("INPUT_SHA_MISMATCH", ...)
}
if (parsedManifest.manifest.catalogCode !== phase9A.catalogCode) {
  return failure("CATALOG_CODE_MISMATCH", ...)
}
```

Decode and revalidate the pack only after Phase 9A says the bytes are valid, matching the Phase 9B CLI pattern.

- [ ] **Step 4: Implement target/reference validation and bindings**

Require exactly one manifest target per pack target by stable key (`code + requestedVersionNumber`, and region/version for price book). Reject duplicates before constructing operations.

Construct bindings canonically:

- existing food/recipe/meal-option identity -> `resolved_uuid`;
- missing food/recipe/meal-option identity -> `operation_output` pointing to the future create operation's `id` output;
- every new food-fact/recipe-version/meal-option-version -> `allocate_uuid`;
- price book -> `operation_output` from `create_price_book` because Phase 9B requires requested price-book version to be missing for an executable plan.

Sort bindings by `handle` using lexical comparison with explicit `<`/`>` rather than locale-dependent collation.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
npx vitest run scripts/catalog-pack/catalog-mutation-planner.test.ts --reporter=verbose
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add scripts/catalog-pack/catalog-mutation-planner.ts \
  scripts/catalog-pack/catalog-mutation-planner.test.ts \
  scripts/catalog-pack/catalog-mutation-test-builder.ts
git commit -m "feat: add Phase 9C planning gates"
```

---

### Task 3: Build application-command templates, DAG dependencies, and canonical ordering

**Files:**
- Modify: `scripts/catalog-pack/catalog-mutation-planner.ts`
- Modify/Test: `scripts/catalog-pack/catalog-mutation-planner.test.ts`

**Interfaces:**
- Consumes: validated `CatalogPackV1`, validated `ResolvedCatalogManifestV1`, and Task 2 bindings.
- Produces exact operation IDs:

```ts
const op = {
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

- Operation inputs use only JSON-safe values plus these marker objects:

```ts
const bind = (handle: string): MutationBindingReference => ({ $binding: handle })
const output = (
  operationId: string,
  field: "id" | "revision"
): MutationOperationOutputReference => ({ $operationOutput: { operationId, field } })
```

- [ ] **Step 1: Write failing operation payload tests**

Require exact application-command payload semantics for one minimal valid pack.

Food create/draft/publish:

```ts
expect(byId(plan, "create_food:gao_trang")).toMatchObject({
  kind: "create_food",
  input: {
    code: "gao_trang",
    nameVi: "Gạo trắng",
    baseDimension: "mass",
    baseUnitId: { $binding: "reference:unit:g" }
  }
})

expect(byId(plan, "save_food_fact_draft:gao_trang:1")).toMatchObject({
  kind: "save_food_fact_draft",
  input: {
    foodFactVersionId: { $binding: "version:food_fact:gao_trang:1" },
    expectedRevision: 1,
    foodId: { $binding: "identity:food:gao_trang" },
    versionNumber: 1
  }
})

expect(byId(plan, "publish_food_fact:gao_trang:1")).toMatchObject({
  input: {
    foodFactVersionId: { $binding: "version:food_fact:gao_trang:1" },
    expectedRevision: {
      $operationOutput: { operationId: "save_food_fact_draft:gao_trang:1", field: "revision" }
    }
  }
})
```

Also assert that the food-fact draft contains the exact pack `edibleFraction`, provenance, allergen statuses/provenance, nutrients/provenance, category ancestry, dietary tag codes, and conversions with unit IDs replaced only by reference bindings.

Recipe save/publish must include exact pack ingredient quantities, notes, orders, step text/timers/ingredientCodes, resolved tag bindings, and publication revision output from save. Use stable recipe ingredient logical IDs:

```ts
recipeIngredientId: `ingredient:${recipe.code}:${ingredient.ingredientCode}`
```

Step `ingredientIds` must reference those same stable logical IDs; they are local command correlation keys, not production row UUID claims.

Price-book create/save/publish must preserve effective dates, price numeric strings/integers, observed dates, source references, and reference bindings. `save_price_book_draft.expectedRevision` must point to `create_price_book:*` revision output; publish revision must point to `save_price_book_draft:*` revision output.

Meal-option save/publish must preserve exact multipliers/roles/orders and bind exact recipe identity/version/tag IDs.

- [ ] **Step 2: Write failing DAG/order tests**

Require these bucket ordering invariants:

```ts
const kinds = plan.operations.map((operation) => operation.kind)
expect(firstIndex(kinds, "create_food")).toBeLessThan(firstIndex(kinds, "save_food_fact_draft"))
expect(firstIndex(kinds, "save_food_fact_draft")).toBeLessThan(firstIndex(kinds, "publish_food_fact"))
expect(firstIndex(kinds, "publish_food_fact")).toBeLessThan(firstIndex(kinds, "create_recipe"))
expect(firstIndex(kinds, "publish_recipe")).toBeLessThan(firstIndex(kinds, "create_price_book"))
expect(firstIndex(kinds, "publish_price_book")).toBeLessThan(firstIndex(kinds, "create_meal_option"))
```

Test existing identities suppress their create operation but keep dependent version operations.

Test source arrays shuffled into different orders produce byte-equivalent `JSON.stringify(plan)` after the Phase 9C planner's own canonical ordering.

Test every `dependsOn` points to a real operation ID and every dependency appears earlier in the emitted order.

Inject one internal test seam or directly unit-test an exported deterministic DAG helper:

```ts
export function orderMutationOperations(
  operations: readonly CatalogMutationPlanOperationV1[]
):
  | { readonly ok: true; readonly operations: readonly CatalogMutationPlanOperationV1[] }
  | { readonly ok: false; readonly code: "DEPENDENCY_MISSING" | "DEPENDENCY_CYCLE" }
```

Require missing edge -> `DEPENDENCY_MISSING`, cycle -> `DEPENDENCY_CYCLE`.

- [ ] **Step 3: Run focused tests to verify RED**

```bash
npx vitest run scripts/catalog-pack/catalog-mutation-planner.test.ts --reporter=verbose
```

Expected: FAIL because Task 2 emits bindings/gates but not the full operation DAG and payloads.

- [ ] **Step 4: Add resolved reference bindings**

Create canonical reference bindings for every Phase 9B reference needed by command templates:

```ts
reference:unit:<code>
reference:category:<code>
reference:allergen:<code>
reference:nutrient:<code>
reference:dietary_tag:<code>
reference:price_region:<code>
reference:recipe_tag:<semantic-code>:<kind>
```

Each source is `{ kind: "resolved_uuid", id }`. Recipe-tag handles must include kind so a semantic code used in two structured contexts cannot collide.

- [ ] **Step 5: Construct exact command-template operations**

Build operations from pack content only after all gates pass. Do not call the application executors; Phase 9C emits templates whose `kind` is the existing command action.

For missing identity create operations, emit `outputs: ["id", "revision", "status"]`. For save/publish operations emit the same result fields because current application command results expose them. Publication operations do not embed content hashes; current application executors reload, validate, canonicalize, hash, and publish at execution time.

Dependency rules must be explicit:

- `save_food_fact` depends on `create_food` only when food identity is missing.
- `publish_food_fact` depends on its save.
- `save_recipe` depends on optional `create_recipe` plus every referenced `publish_food_fact` operation when that fact is created by this plan.
- `publish_recipe` depends on its save.
- `create_price_book` has no operation dependency once region binding is validated.
- `save_price_book` depends on create price book plus all referenced food-fact publish operations created by this plan.
- `publish_price_book` depends on save price book.
- `save_meal_option` depends on optional `create_meal_option` plus every referenced recipe publish operation created by this plan.
- `publish_meal_option` depends on save meal option.

For dependencies already published/existing outside this plan, no fake dependency operation is emitted; the real UUID binding is sufficient.

- [ ] **Step 6: Implement deterministic topological ordering**

Use fixed bucket ranks matching the spec and stable logical-key tie breaking. Still validate the DAG rather than blindly sorting by bucket.

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

When multiple zero-indegree nodes are available, choose by `(rank, logicalKey, operationId)` with explicit code-point lexical comparison. Sort each operation's `dependsOn` array lexically before output.

If ordering returns missing/cycle failure, return a non-executable plan with the corresponding stable diagnostic and no partially executable operation list.

- [ ] **Step 7: Add determinism and provenance assertions**

Require success plans to contain:

```ts
expect(plan).toMatchObject({
  schemaVersion: "1",
  catalogCode: pack.catalogCode,
  inputSha256: sha256(packBytes),
  resolvedManifestSha256: sha256(manifestBytes),
  productionSnapshotSha256: manifest.productionSnapshotSha256,
  executable: true,
  diagnostics: []
})
```

Require no timestamp/random/env field names anywhere in serialized output.

- [ ] **Step 8: Run focused tests, typecheck, format check**

```bash
npx vitest run scripts/catalog-pack/catalog-mutation-planner.test.ts --reporter=verbose
npm run typecheck
npm run format:check
```

Expected: PASS. If Prettier fails only for the new files, run `npx prettier --write scripts/catalog-pack/catalog-mutation-*.ts` and rerun the three commands.

- [ ] **Step 9: Commit Task 3**

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
- Consumes: `planCatalogMutations(inputBytes, manifestBytes)` from Task 3.
- Produces:

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

CLI command:

```bash
npm run catalog:plan -- --input <catalog.json> --manifest <catalog.resolved.json> [--output <catalog.plan.json>]
```

Exit codes:

- `0` — executable dry-run plan emitted.
- `1` — CLI usage, unreadable local input/manifest file, or unwritable output path.
- `2` — Phase 9A invalid.
- `3` — Phase 9A valid but not ready.
- `4` — manifest invalid/not resolved/integrity/state/dependency planning failure.

No dependency/configuration exit code exists because Phase 9C has no remote dependency or runtime secret configuration.

- [ ] **Step 1: Write failing CLI tests**

Cover:

```ts
test("requires both --input and --manifest", () => {
  expect(runCatalogPlanCli(["--input", "pack.json"], deps)).toBe(1)
  expect(stderr).toHaveBeenCalledWith(expect.stringContaining("Usage:"))
})

test("writes exactly the same canonical bytes to stdout and --output", () => {
  // create temp pack + manifest, run once without output and once with output
  // assert captured stdout bytes === readFileSync(outputPath, "utf8")
})

test("returns 4 for a tampered manifest without reading environment configuration", () => {
  // mutate inputSha256, run CLI, assert deterministic INPUT_SHA_MISMATCH plan
})
```

Also test duplicate args, unknown args, missing arg values, unreadable pack, unreadable manifest, unwritable output, and an executable plan returning 0.

- [ ] **Step 2: Run CLI tests to verify RED**

```bash
npx vitest run scripts/catalog-pack/catalog-mutation-cli.test.ts --reporter=verbose
```

Expected: FAIL because the CLI does not exist.

- [ ] **Step 3: Implement argument parsing and local file I/O**

Follow the Phase 9B CLI shape but remove all environment/reader dependencies:

```ts
const USAGE =
  "Usage: npm run catalog:plan -- --input <path> --manifest <path> [--output <path>]"
```

Parse only `--input`, `--manifest`, and `--output`; reject duplicates and all unknown tokens.

Read both files with `readFileSync` as bytes. Call `planCatalogMutations`. Serialize with one deterministic formatting function:

```ts
function serializePlan(plan: CatalogMutationPlanV1): string {
  return `${JSON.stringify(plan, null, 2)}\n`
}
```

Because the planner already canonically orders every collection, pretty-printing must not change semantics. Use the same serialized string for stdout and optional output file.

Operational local-file messages go only to stderr. Do not print raw file exception messages.

Map plan diagnostics to exit codes deterministically:

```ts
if (plan.executable) return 0
const code = plan.diagnostics[0]?.code
if (code === "PHASE_9A_INVALID") return 2
if (code === "PHASE_9A_NOT_READY") return 3
return 4
```

- [ ] **Step 4: Add package script**

Add exactly:

```json
"catalog:plan": "node scripts/catalog-pack/catalog-mutation-cli.ts"
```

Place it beside `catalog:validate` and `catalog:resolve`; do not alter unrelated scripts or dependencies.

- [ ] **Step 5: Run CLI tests, planner tests, and typecheck**

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

### Task 5: Prove the authority boundary and run final verification

**Files:**
- Create/Test: `scripts/catalog-pack/catalog-mutation-authority-regression.test.ts`
- Modify only if verification exposes a Phase 9C-scoped defect: Phase 9C files from Tasks 1-4.

**Interfaces:**
- Consumes: the final Phase 9C source files.
- Produces: static regression evidence that Phase 9C remains offline/dry-run, plus exact-final-HEAD verification evidence.

- [ ] **Step 1: Write the failing authority regression test**

The test should read the Phase 9C implementation files and fail if forbidden production/runtime capabilities appear.

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
  /supabase-meal-option-admin-repository/u
]

describe("Phase 9C authority boundary", () => {
  test.each(phase9CFiles)("keeps %s offline and non-mutating", (path) => {
    const source = readFileSync(path, "utf8")
    for (const pattern of forbidden) expect(source).not.toMatch(pattern)
  })
})
```

Also assert `package.json` maps `catalog:plan` only to the local CLI and does not inject environment wrappers.

- [ ] **Step 2: Run the authority test to verify its first result**

```bash
npx vitest run scripts/catalog-pack/catalog-mutation-authority-regression.test.ts --reporter=verbose
```

Expected: PASS if Tasks 1-4 respected the design. If it fails, treat the failure as a real Phase 9C boundary defect and remove the forbidden dependency/path; do not weaken the regression regex merely to make it green unless the match is demonstrably a false positive in test-only text.

- [ ] **Step 3: Run all Phase 9A/9B/9C catalog-pack tests together**

```bash
npx vitest run scripts/catalog-pack --reporter=verbose
```

Expected: PASS, proving Phase 9C did not regress Phase 9A validation or Phase 9B resolution.

- [ ] **Step 4: Run formatting, lint, typecheck, and diff checks**

```bash
npm run format:check
npm run lint
npm run typecheck
git diff --check
```

Expected: PASS with no warnings/errors.

If format only fails for task files:

```bash
npx prettier --write scripts/catalog-pack/catalog-mutation-*.ts package.json
npm run format:check
```

Then rerun lint, typecheck, and `git diff --check`.

- [ ] **Step 5: Run the full non-database repository verifier**

```bash
npm run verify:web
```

Expected: PASS, including environment validation, secret scan, dependency audit at moderate severity, Prettier, ESLint, TypeScript, coverage, production build, and bundle check.

Do not substitute a focused test run for this gate.

- [ ] **Step 6: Inspect status and commit only Phase 9C files**

```bash
git status --short
git diff --stat
git diff --check
```

Expected: only Phase 9C files and `package.json` from this plan are modified. Preserve and exclude any unrelated changes.

Commit final regression/format-only adjustments if any exist:

```bash
git add scripts/catalog-pack/catalog-mutation-authority-regression.test.ts \
  scripts/catalog-pack/catalog-mutation-types.ts \
  scripts/catalog-pack/catalog-mutation-manifest-parser.ts \
  scripts/catalog-pack/catalog-mutation-test-builder.ts \
  scripts/catalog-pack/catalog-mutation-planner.ts \
  scripts/catalog-pack/catalog-mutation-planner.test.ts \
  scripts/catalog-pack/catalog-mutation-cli.ts \
  scripts/catalog-pack/catalog-mutation-cli.test.ts \
  package.json
git commit -m "test: lock Phase 9C authority boundary"
```

If only the new regression test changed, stage/commit only that file instead.

- [ ] **Step 7: Re-run verification on the exact final local HEAD**

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

Expected: all commands PASS and working tree clean.

- [ ] **Step 8: Push the approved Phase 9C branch**

```bash
git push -u origin codex/phase-9c-production-mutation-planner
```

Expected: successful non-force push.

- [ ] **Step 9: Verify exact-final-HEAD GitHub Actions**

Fetch CI for the exact SHA from Step 7. Require the ordinary GitHub Actions checks triggered for the branch/PR context to complete successfully before reporting Phase 9C verified. If CI does not trigger from the authenticated push, use the repository's existing safe verification-trigger pattern without changing the final source tree, then prove the verification-trigger round trip has zero file diff against the final source commit.

Do not create a PR, merge, deploy, run production migrations, or mutate production at this step.

- [ ] **Step 10: Completion report**

Report:

```text
TASK_COMPLETE_PUSHED
PHASE_9C_COMPLETE_VERIFIED
Branch: codex/phase-9c-production-mutation-planner
Final HEAD: <exact SHA>
Push: successful
Focused catalog-pack tests: PASS
format:check: PASS
lint: PASS
typecheck: PASS
verify:web: PASS
git diff --check: PASS
GitHub Actions exact-final-HEAD: PASS
Production I/O/mutation: NOT PERFORMED
PR/merge/deploy: NOT PERFORMED
```

Do not use `PHASE_9C_COMPLETE_VERIFIED` if exact-final-HEAD CI is failed, cancelled, pending, absent without an approved substitute verification trigger, or if the working tree is not clean.

---

## Plan Self-Review Record

The plan covers every approved Phase 9C design requirement:

- exact pack + exact manifest inputs and byte hashes — Tasks 2-4;
- Phase 9A replay — Task 2;
- strict Phase 9B manifest parser and `resolved=true` gate — Tasks 1-2;
- catalog/input SHA/reference/identity/version integrity checks — Task 2;
- existing UUIDs only from Phase 9B — Tasks 2-3;
- symbolic identity/version handles and executor-time UUID allocation — Tasks 1-3;
- fixed first-save `expectedRevision: 1` and dynamic subsequent revisions — Task 3;
- existing application command templates only — Task 3;
- dependency DAG and canonical topological order — Task 3;
- exact source values preserved — Task 3;
- price-book and meal-option ordering/reference semantics — Task 3;
- deterministic plan/provenance output — Tasks 2-4;
- local CLI and stable exit categories — Task 4;
- zero production/network/environment/random authority boundary — Task 5;
- no retire/SQL/direct RPC/migration/deploy — Global Constraints + Task 5;
- TDD, focused tests, full verifier, clean status, push, and exact-final-HEAD CI — every task + Task 5.

Placeholder scan: no `TBD`, `TODO`, "implement later", or undefined neighboring interface remains in this plan. Type names and operation IDs used by later tasks are defined in Tasks 1-3 and remain consistent through CLI/tests.
