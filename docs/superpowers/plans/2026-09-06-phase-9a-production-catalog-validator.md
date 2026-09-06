# Phase 9A Production Catalog Pack & Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, offline `CatalogPackV1` validator and CLI that can prove a human-curated BepNha production catalog pack is structurally valid and launch-pack ready before any production database write.

**Architecture:** Keep Phase 9A entirely under `scripts/catalog-pack/` so it cannot acquire Supabase write capabilities by accident. A strict Zod parser establishes shape, a semantic validator checks authoritative field/graph invariants, a readiness evaluator computes launch blockers/warnings, and a tiny Node 24 CLI reads bytes, computes a stable report, and exits with the spec-defined code. Runtime modules use relative `.ts` imports and Node 24 native TypeScript stripping; only self-contained deterministic domain helpers/constants are reused from `src/domain`.

**Tech Stack:** Node 24, native TypeScript type stripping, TypeScript 6/7 toolchain already in the repo, Zod 4, Decimal.js through the existing `parseCanonicalDecimal`, Vitest 4, Node `crypto`/`fs` APIs.

**Spec:** `docs/superpowers/specs/2026-09-06-phase-9a-production-catalog-validator-design.md`

## Global Constraints

- Phase 9A is offline only: no Supabase, Vercel, HTTP, scraping, Gemini, or other LLM calls.
- Phase 9A never authors, infers, repairs, rounds, trims, lower-cases, substitutes, or defaults authoritative nutrition, allergy, yield, recipe quantity, conversion, meal composition, or price values.
- Real production packs are input files supplied explicitly at runtime; they are not committed automatically.
- The existing CI catalog-readiness fixture is test-only and must never be imported as production seed data.
- Logical codes are validated offline; production UUID/reference resolution belongs to Phase 9B.
- Existing planner/publication/allergy/price rules are not weakened.
- `unknown` allergen assessment is invalid for a Phase 9A-valid pack because current deterministic food lineage rejects it.
- Price `observedAt` remains a strict `YYYY-MM-DD` date to match the current catalog-admin authority path.
- Existing launch requirement remains at least 21 meal options; Phase 9A additionally requires at least 3 distinct primary protein hint codes for generic launch-pack diversity.
- No migration, production catalog mutation, PR creation, merge, or deployment is part of this plan.
- Work stays on `codex/phase-9a-production-catalog-validator` until a separate review/PR authorization.

---

## File Structure

- Create `scripts/catalog-pack/catalog-pack-types.ts` — public Phase 9A pack/report/diagnostic types and fixed launch reference sets.
- Create `scripts/catalog-pack/catalog-pack-schema.ts` — strict Zod shape parser; primitive/unknown-key validation only.
- Create `scripts/catalog-pack/catalog-pack-validator.ts` — field, graph, lineage, coverage, warning, and readiness validation.
- Create `scripts/catalog-pack/catalog-pack-validator.test.ts` — unit tests for shape, semantic, graph, readiness, and deterministic ordering.
- Create `scripts/catalog-pack/catalog-pack-test-builder.ts` — synthetic human-like test pack builder only; never exported by the production CLI.
- Create `scripts/catalog-pack/catalog-pack-cli.ts` — argument parsing, file I/O, SHA-256, report output, exit-code mapping.
- Create `scripts/catalog-pack/catalog-pack-cli.test.ts` — CLI contract tests using temporary files/directories.
- Modify `tsconfig.node.json` — enable `.ts` import specifiers for no-emit Node 24 scripts.
- Modify `package.json` — add `catalog:validate` and include validator tests naturally under existing script-project Vitest discovery.

---

### Task 1: Strict `CatalogPackV1` Shape and Launch Reference Policy

**Files:**
- Create: `scripts/catalog-pack/catalog-pack-types.ts`
- Create: `scripts/catalog-pack/catalog-pack-schema.ts`
- Create: `scripts/catalog-pack/catalog-pack-validator.test.ts`
- Modify: `tsconfig.node.json`

**Interfaces:**
- Consumes: `SUPPORTED_ALLERGEN_CODES` and `REQUIRED_NUTRIENT_CODES` from `../../src/domain/catalog/catalog.ts`.
- Produces: `CatalogPackV1`, `CatalogPackDiagnostic`, `CatalogPackValidationReport`, launch reference constants, and `parseCatalogPackShape(value: unknown)`.

- [ ] **Step 1: Enable explicit `.ts` imports for Node scripts**

Add this compiler option to `tsconfig.node.json` next to `noEmit`:

```json
"allowImportingTsExtensions": true
```

This is legal because the config is no-emit and allows Node 24 scripts to use the same explicit `.ts` paths that native TypeScript execution requires.

- [ ] **Step 2: Define pack/report types and reviewed launch reference constants**

Create `scripts/catalog-pack/catalog-pack-types.ts` with the exact public shapes from the spec. The module must include these exported constants:

```ts
import {
  REQUIRED_NUTRIENT_CODES,
  SUPPORTED_ALLERGEN_CODES
} from "../../src/domain/catalog/catalog.ts"

export const CATALOG_PACK_SCHEMA_VERSION = "1" as const
export const LAUNCH_ALLERGEN_CODES = SUPPORTED_ALLERGEN_CODES
export const LAUNCH_REQUIRED_NUTRIENT_CODES = REQUIRED_NUTRIENT_CODES
export const LAUNCH_UNIT_CODES = ["g", "kg", "ml", "l", "tsp", "tbsp", "item"] as const
export const LAUNCH_CATEGORY_CODES = [
  "food",
  "pork",
  "beef",
  "poultry",
  "seafood",
  "fish",
  "crustacean",
  "mollusc",
  "egg",
  "dairy",
  "tofu",
  "vegetable",
  "staple",
  "seasoning"
] as const
export const LAUNCH_REGION_CODE = "vn_baseline" as const

export type CatalogPackDiagnosticSeverity = "error" | "warning"

export interface CatalogPackDiagnostic {
  readonly severity: CatalogPackDiagnosticSeverity
  readonly code: string
  readonly path: string
  readonly message: string
}

export interface CatalogPackValidationReport {
  readonly schemaVersion: "1"
  readonly inputSha256: string
  readonly catalogCode: string | null
  readonly valid: boolean
  readonly ready: boolean
  readonly summary: {
    readonly foods: number
    readonly recipes: number
    readonly priceRows: number
    readonly mealOptions: number
    readonly primaryProteinGroups: number
    readonly reachableFoods: number
    readonly pricedReachableFoods: number
  }
  readonly blockers: readonly string[]
  readonly diagnostics: readonly CatalogPackDiagnostic[]
}
```

Define `CatalogPackFood`, `CatalogPackRecipe`, `CatalogPackPriceBook`, `CatalogPackMealOption`, and `CatalogPackV1` exactly as approved in the spec. Do not add UUIDs or database-only fields.

- [ ] **Step 3: Write failing strict-shape tests**

In `scripts/catalog-pack/catalog-pack-validator.test.ts`, start with tests that prove strict parsing rejects unknown keys and wrong primitive types:

```ts
import { describe, expect, test } from "vitest"

import { parseCatalogPackShape } from "./catalog-pack-schema.ts"

const minimumShape = {
  schemaVersion: "1",
  catalogCode: "launch_v1",
  preparedAt: "2026-09-06T00:00:00Z",
  source: { name: "Catalog team", provenance: "Reviewed source bundle" },
  foods: [],
  recipes: [],
  priceBook: {
    regionCode: "vn_baseline",
    versionNumber: 1,
    effectiveFrom: "2026-09-06",
    effectiveTo: null,
    prices: []
  },
  mealOptions: []
} as const

describe("parseCatalogPackShape", () => {
  test("rejects unknown top-level keys", () => {
    const result = parseCatalogPackShape({ ...minimumShape, unexpected: true })
    expect(result.success).toBe(false)
  })

  test("does not coerce numbers from strings", () => {
    const result = parseCatalogPackShape({
      ...minimumShape,
      priceBook: { ...minimumShape.priceBook, versionNumber: "1" }
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 4: Run the shape tests to prove RED**

Run:

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
```

Expected: FAIL because `catalog-pack-schema.ts` does not yet exist.

- [ ] **Step 5: Implement strict Zod schemas**

Create `scripts/catalog-pack/catalog-pack-schema.ts`. Use `z.strictObject` at every object level and `z.array` without coercion. Keep this file limited to JSON shape and primitive enums; semantic checks belong to Task 2.

Core pattern:

```ts
import { z } from "zod"

import {
  CATALOG_PACK_SCHEMA_VERSION,
  LAUNCH_REGION_CODE,
  type CatalogPackV1
} from "./catalog-pack-types.ts"

const codeSchema = z.string()
const trimmedStringSchema = z.string()
const canonicalDecimalTextSchema = z.string()

const foodSchema = z.strictObject({
  code: codeSchema,
  nameVi: trimmedStringSchema,
  baseDimension: z.enum(["mass", "volume", "count"]),
  baseUnitCode: codeSchema,
  fact: z.strictObject({
    versionNumber: z.number(),
    categoryCode: codeSchema,
    categoryAncestry: z.array(codeSchema),
    edibleFraction: canonicalDecimalTextSchema,
    provenance: trimmedStringSchema,
    allergenAssessments: z.array(
      z.strictObject({
        allergenCode: codeSchema,
        status: z.enum(["absent", "contains", "may_contain", "unknown"]),
        provenance: trimmedStringSchema
      })
    ),
    nutrients: z.array(
      z.strictObject({
        nutrientCode: codeSchema,
        amountPer100g: canonicalDecimalTextSchema,
        provenance: trimmedStringSchema
      })
    ),
    dietaryTagCodes: z.array(codeSchema),
    conversions: z.array(
      z.strictObject({
        unitCode: codeSchema,
        baseQuantityPerUnit: canonicalDecimalTextSchema,
        grossGramsPerUnit: canonicalDecimalTextSchema,
        displayStep: canonicalDecimalTextSchema,
        provenance: trimmedStringSchema
      })
    )
  })
})
```

Define the recipe, price-book, meal-option, source, and top-level schemas the same way. Top level must use:

```ts
const catalogPackSchema = z.strictObject({
  schemaVersion: z.literal(CATALOG_PACK_SCHEMA_VERSION),
  catalogCode: codeSchema,
  preparedAt: z.string(),
  source: z.strictObject({ name: z.string(), provenance: z.string() }),
  foods: z.array(foodSchema),
  recipes: z.array(recipeSchema),
  priceBook: z.strictObject({
    regionCode: z.literal(LAUNCH_REGION_CODE),
    versionNumber: z.number(),
    effectiveFrom: z.string(),
    effectiveTo: z.string().nullable(),
    prices: z.array(priceSchema)
  }),
  mealOptions: z.array(mealOptionSchema)
})

export function parseCatalogPackShape(value: unknown) {
  return catalogPackSchema.safeParse(value) as ReturnType<typeof catalogPackSchema.safeParse> & {
    readonly data?: CatalogPackV1
  }
}
```

Do not put `.trim()`, `.toLowerCase()`, `z.coerce`, numeric rounding, or default values in any schema.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add tsconfig.node.json scripts/catalog-pack/catalog-pack-types.ts scripts/catalog-pack/catalog-pack-schema.ts scripts/catalog-pack/catalog-pack-validator.test.ts
git commit -m "feat: add Phase 9A catalog pack schema"
```

---

### Task 2: Authoritative Field and Lineage Validation

**Files:**
- Create: `scripts/catalog-pack/catalog-pack-validator.ts`
- Modify: `scripts/catalog-pack/catalog-pack-validator.test.ts`

**Interfaces:**
- Consumes: `parseCatalogPackShape`, launch reference constants, `parseCanonicalDecimal` from `../../src/domain/shared/decimal.ts`.
- Produces: `validateCatalogPackValue(value: unknown): CatalogPackValidationCoreResult` where the core result contains `pack`, diagnostics, blocker candidates, and summary inputs but no input SHA.

Define the internal result shape in `catalog-pack-validator.ts`:

```ts
export interface CatalogPackValidationCoreResult {
  readonly pack: CatalogPackV1 | null
  readonly catalogCode: string | null
  readonly diagnostics: readonly CatalogPackDiagnostic[]
  readonly blockers: readonly string[]
  readonly summary: CatalogPackValidationReport["summary"]
}
```

- [ ] **Step 1: Add a synthetic pack builder for tests**

Create `scripts/catalog-pack/catalog-pack-test-builder.ts` with `buildReadyCatalogPack()` returning a fully synthetic, deterministic pack. Use only obvious test values and label every provenance/source value as synthetic test data.

The builder must create exactly:

- 3 foods: `test_tofu`, `test_chicken`, `test_fish`;
- 3 recipes: one per food;
- one price row per food;
- 21 meal options, cycling protein hints `plant`, `poultry`, `fish`;
- all 10 allergen assessments per food, all explicitly `absent` except `soy: contains` for `test_tofu` and `fish: contains` for `test_fish`;
- all six required nutrient entries with clearly synthetic numeric strings;
- only `g` conversions/base units;
- preparation/source/provenance strings containing `Synthetic Phase 9A test data`.

Generate the 21 meal options programmatically so the test file stays readable:

```ts
const mealOptions = Array.from({ length: 21 }, (_, index) => {
  const slot = index % 3
  const recipeCode = slot === 0 ? "test_tofu_recipe" : slot === 1 ? "test_chicken_recipe" : "test_fish_recipe"
  const proteinHintCode = slot === 0 ? "plant" : slot === 1 ? "poultry" : "fish"
  return {
    code: `test_meal_${String(index + 1).padStart(2, "0")}`,
    nameVi: `Bữa kiểm thử ${index + 1}`,
    version: {
      versionNumber: 1,
      yieldAdultEquivalent: "1",
      activeMinutes: 10,
      elapsedMinutes: 20,
      proteinHintCode,
      cookingStyleCodes: ["boil"],
      dishRoleCodes: ["main"],
      components: [
        {
          recipeCode,
          recipeVersionNumber: 1,
          quantityMultiplier: "1",
          mealRole: "main" as const,
          order: 1
        }
      ]
    }
  }
})
```

This builder is test support only. `catalog-pack-cli.ts` must never import it.

- [ ] **Step 2: Write RED tests for exact authoritative-field invariants**

Add focused tests using the builder:

```ts
import { buildReadyCatalogPack } from "./catalog-pack-test-builder.ts"
import { validateCatalogPackValue } from "./catalog-pack-validator.ts"

test("rejects unknown allergen status instead of repairing it", () => {
  const pack = structuredClone(buildReadyCatalogPack())
  pack.foods[0]!.fact.allergenAssessments[0]!.status = "unknown"
  const result = validateCatalogPackValue(pack)
  expect(result.diagnostics.map((item) => item.code)).toContain("UNKNOWN_ALLERGEN_LINEAGE")
})

test("rejects non-canonical decimals", () => {
  const pack = structuredClone(buildReadyCatalogPack())
  pack.foods[0]!.fact.edibleFraction = "01.0"
  const result = validateCatalogPackValue(pack)
  expect(result.diagnostics.map((item) => item.code)).toContain("INVALID_DECIMAL")
})

test("rejects observation timestamps because observedAt is a date", () => {
  const pack = structuredClone(buildReadyCatalogPack())
  pack.priceBook.prices[0]!.observedAt = "2026-09-06T12:00:00Z"
  const result = validateCatalogPackValue(pack)
  expect(result.diagnostics.map((item) => item.code)).toContain("INVALID_DATE")
})
```

Add at least one test each for: untrimmed label/provenance, unsupported unit/category, base-dimension mismatch, duplicate food code, duplicate allergen/nutrient/conversion code, missing required allergen/nutrient, invalid date ordering, placeholder source reference, invalid recipe timing/order, invalid meal-option timing/order, duplicate meal-option recipe component, and missing `main` component.

- [ ] **Step 3: Run the focused validator tests to prove RED**

Run:

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
```

Expected: FAIL because `validateCatalogPackValue` is not implemented.

- [ ] **Step 4: Implement deterministic primitive helpers**

In `catalog-pack-validator.ts`, implement only pure helpers. Reuse `parseCanonicalDecimal` rather than introducing a second decimal parser:

```ts
import { parseCanonicalDecimal } from "../../src/domain/shared/decimal.ts"

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/u
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u
const PLACEHOLDER_SOURCE = /^(?:unknown|n\/a|na|todo|tbd)$/iu

function isTrimmedLength(value: string, min: number, max: number): boolean {
  const length = Array.from(value).length
  return value.trim() === value && length >= min && length <= max
}

function isValidDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

function isPositiveDecimal(value: string): boolean {
  return parseCanonicalDecimal(value, {
    maxScale: 18,
    maxIntegerDigits: 34,
    allowNegative: false,
    allowZero: false
  }).ok
}

function isNonNegativeDecimal(value: string): boolean {
  return parseCanonicalDecimal(value, {
    maxScale: 6,
    maxIntegerDigits: 12,
    allowNegative: false
  }).ok
}
```

For `edibleFraction`, use the existing parser with `{ maxScale: 6, maxIntegerDigits: 1, allowNegative: false, allowZero: false }` and separately reject values greater than `1`.

- [ ] **Step 5: Implement diagnostics without input mutation**

Use one helper for diagnostics:

```ts
function pushDiagnostic(
  diagnostics: CatalogPackDiagnostic[],
  severity: "error" | "warning",
  code: string,
  path: string,
  message: string
): void {
  diagnostics.push({ severity, code, path, message })
}
```

Validate the original parsed pack without modifying it. Paths must use deterministic JSON-path-like strings, for example:

- `$.foods[0].fact.edibleFraction`
- `$.recipes[2].version.ingredients[1].foodCode`
- `$.priceBook.prices[0].sourceReference`
- `$.mealOptions[5].version.components[0].recipeCode`

For shape failures, translate each Zod issue into code `INVALID_SHAPE` and a path built from the issue path. Do not expose stack traces.

- [ ] **Step 6: Implement food, recipe, price, and meal-option field validation**

Use small pure functions:

```ts
function validateFoodFields(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[]): void
function validateRecipeFields(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[]): void
function validatePriceBookFields(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[]): void
function validateMealOptionFields(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[]): void
```

Required behaviors are exactly those in the spec. In particular:

- allergen set must equal the 10 launch allergen codes and no assessment may be `unknown`;
- nutrient set must equal the six required nutrient codes;
- `categoryAncestry[0] === categoryCode` and the last entry is `food`;
- launch unit/category codes only;
- unit dimension mapping is `g/kg -> mass`, `ml/l/tsp/tbsp -> volume`, `item -> count`;
- recipe ingredient/step/component orders are contiguous `1..N`;
- recipe step instruction maximum is 500 characters, matching current deterministic recipe authority;
- preparation note maximum is 120 characters, matching the reviewed database constraint;
- `packagePriceVnd` is a positive safe integer;
- `observedAt` is `YYYY-MM-DD`;
- placeholder source references are errors;
- no automatic trimming/normalization occurs.

- [ ] **Step 7: Run Task 2 tests and typecheck**

Run:

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add scripts/catalog-pack/catalog-pack-test-builder.ts scripts/catalog-pack/catalog-pack-validator.ts scripts/catalog-pack/catalog-pack-validator.test.ts
git commit -m "feat: validate Phase 9A catalog pack fields"
```

---

### Task 3: Cross-Pack Graph Validation and Launch Readiness

**Files:**
- Modify: `scripts/catalog-pack/catalog-pack-validator.ts`
- Modify: `scripts/catalog-pack/catalog-pack-validator.test.ts`

**Interfaces:**
- Consumes: a shape-valid `CatalogPackV1`.
- Produces: graph diagnostics, stable blocker codes, reachable/price/protein summary counts, and final `valid`/`ready` semantics for the report builder.

- [ ] **Step 1: Write RED graph tests**

Add tests that mutate one field at a time from `buildReadyCatalogPack()`:

```ts
test("rejects recipe food references that do not resolve inside the pack", () => {
  const pack = structuredClone(buildReadyCatalogPack())
  pack.recipes[0]!.version.ingredients[0]!.foodCode = "missing_food"
  const result = validateCatalogPackValue(pack)
  expect(result.blockers).toContain("CATALOG_LINEAGE_INCOMPLETE")
  expect(result.diagnostics.map((item) => item.code)).toContain("UNRESOLVED_FOOD_REFERENCE")
})

test("blocks readiness when a reachable food has no price", () => {
  const pack = structuredClone(buildReadyCatalogPack())
  pack.priceBook.prices = pack.priceBook.prices.filter((row) => row.foodCode !== "test_fish")
  const result = validateCatalogPackValue(pack)
  expect(result.blockers).toContain("PRICE_COVERAGE_INCOMPLETE")
})

test("blocks readiness below 21 meal options", () => {
  const pack = structuredClone(buildReadyCatalogPack())
  pack.mealOptions = pack.mealOptions.slice(0, 20)
  const result = validateCatalogPackValue(pack)
  expect(result.blockers).toContain("MINIMUM_MEAL_OPTIONS_NOT_MET")
})

test("blocks readiness below three protein hint groups", () => {
  const pack = structuredClone(buildReadyCatalogPack())
  for (const meal of pack.mealOptions) meal.version.proteinHintCode = "plant"
  const result = validateCatalogPackValue(pack)
  expect(result.blockers).toContain("INSUFFICIENT_PRIMARY_PROTEIN_GROUP_CAPACITY")
})
```

Also cover exact version pin mismatches, ingredient unit not present in conversion/base unit, unresolved step ingredient, ingredient never referenced by a step, unresolved meal-option recipe version, unused recipe warning, unused food warning, and `UNUSED_FOOD_WITHOUT_PRICE` warning.

- [ ] **Step 2: Run graph tests to prove RED**

Run:

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
```

Expected: FAIL on graph/readiness expectations.

- [ ] **Step 3: Build deterministic indexes without UUIDs**

Inside `catalog-pack-validator.ts`, create code maps only after shape parsing:

```ts
const foodsByCode = new Map(pack.foods.map((food) => [food.code, food]))
const recipesByCode = new Map(pack.recipes.map((recipe) => [recipe.code, recipe]))
const mealOptionsByCode = new Map(pack.mealOptions.map((meal) => [meal.code, meal]))
const priceByFoodVersion = new Map(
  pack.priceBook.prices.map((price) => [`${price.foodCode}:${price.foodFactVersionNumber}`, price])
)
```

Duplicate detection must occur before trusting these maps. A duplicate remains an error even if JavaScript `Map` would overwrite one entry.

- [ ] **Step 4: Validate explicit graph/version pins**

Implement exact graph checks:

```ts
function validateGraph(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[]): {
  readonly reachableFoodCodes: ReadonlySet<string>
  readonly reachableRecipeCodes: ReadonlySet<string>
  readonly pricedReachableFoodCodes: ReadonlySet<string>
}
```

Rules:

1. Every recipe ingredient resolves `foodCode` inside this pack.
2. `foodFactVersionNumber` equals that food's `fact.versionNumber` exactly.
3. Ingredient unit is either the food base unit or one of its fact conversion unit codes.
4. Every step ingredient code resolves inside the same recipe; every recipe ingredient is referenced by at least one step.
5. Every meal-option component resolves a recipe inside this pack and pins its exact version number.
6. Reachability starts from all meal-option components, then follows recipe ingredients to foods.
7. Every reachable food/version must have exactly one matching price row.
8. No implicit latest-version behavior exists.

Every unresolved required edge emits a specific error diagnostic and adds `CATALOG_LINEAGE_INCOMPLETE`; missing reachable prices add `PRICE_COVERAGE_INCOMPLETE`.

- [ ] **Step 5: Implement warnings for unused content**

Warnings are deterministic and do not set `valid` false:

- food not reachable from any meal option -> `UNUSED_FOOD`;
- recipe not reachable from any meal option -> `UNUSED_RECIPE`;
- unused food with no price -> `UNUSED_FOOD_WITHOUT_PRICE`.

Do not warn twice for the same entity/code combination.

- [ ] **Step 6: Implement launch-pack blocker calculation**

Calculate blockers after semantic/graph validation:

```ts
if (pack.mealOptions.length < 21) blockers.add("MINIMUM_MEAL_OPTIONS_NOT_MET")

const proteinGroups = new Set(pack.mealOptions.map((meal) => meal.version.proteinHintCode))
if (proteinGroups.size < 3) blockers.add("INSUFFICIENT_PRIMARY_PROTEIN_GROUP_CAPACITY")
```

Also add:

- `REQUIRED_NUTRITION_COVERAGE_INCOMPLETE` if any food is missing/duplicates a required nutrient;
- `ALLERGEN_COVERAGE_INCOMPLETE` if any food is missing/duplicates a required allergen or contains `unknown`;
- `REFERENCE_CODE_UNSUPPORTED` for unsupported launch unit/category/region references.

The validator may still report multiple blockers for one bad pack; it must not stop at the first semantic failure.

- [ ] **Step 7: Compute summary counts from validated graph facts**

Return exactly:

```ts
{
  foods: pack.foods.length,
  recipes: pack.recipes.length,
  priceRows: pack.priceBook.prices.length,
  mealOptions: pack.mealOptions.length,
  primaryProteinGroups: proteinGroups.size,
  reachableFoods: reachableFoodCodes.size,
  pricedReachableFoods: pricedReachableFoodCodes.size
}
```

For a Layer-1 shape failure, all summary counters are zero because no typed pack exists.

- [ ] **Step 8: Run Task 3 tests and typecheck**

Run:

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

```bash
git add scripts/catalog-pack/catalog-pack-validator.ts scripts/catalog-pack/catalog-pack-validator.test.ts
git commit -m "feat: add catalog pack graph readiness checks"
```

---

### Task 4: Stable Report Construction and Byte-Level SHA-256

**Files:**
- Modify: `scripts/catalog-pack/catalog-pack-validator.ts`
- Modify: `scripts/catalog-pack/catalog-pack-validator.test.ts`

**Interfaces:**
- Consumes: original input bytes and parsed JSON value.
- Produces: `validateCatalogPackBytes(input: Uint8Array): CatalogPackValidationReport` as the single API the CLI uses.

- [ ] **Step 1: Write RED determinism tests**

Add:

```ts
import { TextEncoder } from "node:util"

import { validateCatalogPackBytes } from "./catalog-pack-validator.ts"

test("produces the same report for identical bytes", () => {
  const bytes = new TextEncoder().encode(JSON.stringify(buildReadyCatalogPack()))
  expect(validateCatalogPackBytes(bytes)).toEqual(validateCatalogPackBytes(bytes))
})

test("hashes original bytes rather than normalized JSON", () => {
  const compact = new TextEncoder().encode('{"schemaVersion":"1"}')
  const spaced = new TextEncoder().encode('{ "schemaVersion": "1" }')
  expect(validateCatalogPackBytes(compact).inputSha256).not.toBe(
    validateCatalogPackBytes(spaced).inputSha256
  )
})

test("sorts blockers and diagnostics deterministically", () => {
  const pack = structuredClone(buildReadyCatalogPack())
  pack.mealOptions = []
  const report = validateCatalogPackBytes(new TextEncoder().encode(JSON.stringify(pack)))
  expect(report.blockers).toEqual([...report.blockers].sort())
  expect(report.diagnostics).toEqual(
    [...report.diagnostics].sort((left, right) => {
      const leftKey = `${left.severity}\u0000${left.code}\u0000${left.path}\u0000${left.message}`
      const rightKey = `${right.severity}\u0000${right.code}\u0000${right.path}\u0000${right.message}`
      return leftKey.localeCompare(rightKey)
    })
  )
})
```

- [ ] **Step 2: Run report tests to prove RED**

Run:

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
```

Expected: FAIL because byte-level report construction does not yet exist.

- [ ] **Step 3: Implement original-byte hashing and UTF-8/JSON handling**

Use Node crypto:

```ts
import { createHash } from "node:crypto"

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}
```

Decode with a fatal UTF-8 decoder so malformed bytes are not silently replaced:

```ts
function parseJsonBytes(bytes: Uint8Array): { ok: true; value: unknown } | { ok: false } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false }
  }
}
```

A UTF-8/JSON parse failure returns one `error` diagnostic with code `INVALID_JSON`, `catalogCode: null`, zero summary counts, `valid: false`, and `ready: false`.

- [ ] **Step 4: Implement stable report sorting and booleans**

Use explicit sort keys; never depend on insertion order:

```ts
function sortDiagnostics(items: readonly CatalogPackDiagnostic[]): CatalogPackDiagnostic[] {
  return [...items].sort((left, right) => {
    const severity = left.severity.localeCompare(right.severity)
    if (severity !== 0) return severity
    const code = left.code.localeCompare(right.code)
    if (code !== 0) return code
    const path = left.path.localeCompare(right.path)
    if (path !== 0) return path
    return left.message.localeCompare(right.message)
  })
}
```

Build final booleans as:

```ts
const diagnostics = sortDiagnostics(core.diagnostics)
const blockers = [...new Set(core.blockers)].sort()
const valid = !diagnostics.some((item) => item.severity === "error")
const ready = valid && blockers.length === 0
```

Do not include current timestamps, random IDs, environment fields, filesystem paths, or database UUIDs in the report.

- [ ] **Step 5: Verify a ready synthetic pack**

Add one assertion that the builder's untouched pack is exactly valid/ready:

```ts
test("accepts the fully curated synthetic ready pack", () => {
  const bytes = new TextEncoder().encode(JSON.stringify(buildReadyCatalogPack()))
  const report = validateCatalogPackBytes(bytes)
  expect(report.valid).toBe(true)
  expect(report.ready).toBe(true)
  expect(report.summary).toMatchObject({ mealOptions: 21, primaryProteinGroups: 3 })
  expect(report.blockers).toEqual([])
  expect(report.diagnostics.filter((item) => item.severity === "error")).toEqual([])
})
```

- [ ] **Step 6: Run Task 4 tests and typecheck**

Run:

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add scripts/catalog-pack/catalog-pack-validator.ts scripts/catalog-pack/catalog-pack-validator.test.ts
git commit -m "feat: produce deterministic catalog validation reports"
```

---

### Task 5: Offline CLI Contract and Release Verification

**Files:**
- Create: `scripts/catalog-pack/catalog-pack-cli.ts`
- Create: `scripts/catalog-pack/catalog-pack-cli.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `validateCatalogPackBytes(input: Uint8Array)`.
- Produces: `npm run catalog:validate -- --input <path> [--report <path>]` with exit codes 0/1/2/3 exactly as approved.

- [ ] **Step 1: Write RED CLI tests against temporary input files**

Use `mkdtemp`, `writeFile`, `readFile`, and `spawnSync` from Node. Do not call network services.

Core tests:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { describe, expect, test } from "vitest"

import { buildReadyCatalogPack } from "./catalog-pack-test-builder.ts"

function runCli(args: readonly string[]) {
  return spawnSync(process.execPath, ["scripts/catalog-pack/catalog-pack-cli.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8"
  })
}

test("returns 0 and canonical JSON for a ready pack", () => {
  const directory = mkdtempSync(join(tmpdir(), "bepnha-catalog-"))
  const input = join(directory, "pack.json")
  writeFileSync(input, JSON.stringify(buildReadyCatalogPack()), "utf8")
  const result = runCli(["--input", input])
  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, ready: true })
  expect(result.stderr).toBe("")
})

test("returns 2 for validation errors", () => {
  const directory = mkdtempSync(join(tmpdir(), "bepnha-catalog-"))
  const input = join(directory, "pack.json")
  writeFileSync(input, JSON.stringify({ schemaVersion: "2" }), "utf8")
  const result = runCli(["--input", input])
  expect(result.status).toBe(2)
})

test("returns 3 for valid but not ready packs", () => {
  const directory = mkdtempSync(join(tmpdir(), "bepnha-catalog-"))
  const input = join(directory, "pack.json")
  const pack = buildReadyCatalogPack()
  pack.mealOptions = pack.mealOptions.slice(0, 20)
  writeFileSync(input, JSON.stringify(pack), "utf8")
  const result = runCli(["--input", input])
  expect(result.status).toBe(3)
})
```

Also test:

- missing `--input` -> exit `1`, usage text on stderr, empty stdout;
- unreadable/nonexistent input -> exit `1`, concise I/O error on stderr;
- `--report` writes byte-for-byte the same canonical JSON plus trailing newline as stdout;
- unknown CLI flag -> exit `1`;
- the ready CLI report contains no absolute input path.

- [ ] **Step 2: Run CLI tests to prove RED**

Run:

```bash
npx vitest run scripts/catalog-pack/catalog-pack-cli.test.ts --project scripts
```

Expected: FAIL because the CLI does not exist.

- [ ] **Step 3: Implement a no-prompt argument parser**

In `catalog-pack-cli.ts`, parse only `--input` and optional `--report`. Reject duplicates, missing values, positional args, and unknown flags.

Use a typed result:

```ts
type CliArgs = { readonly input: string; readonly report: string | null }
type ParseArgsResult =
  | { readonly ok: true; readonly value: CliArgs }
  | { readonly ok: false; readonly message: string }
```

The parser must not inspect environment variables or prompt.

- [ ] **Step 4: Implement CLI file/read/report behavior**

Use synchronous Node APIs intentionally: this is a one-shot validation command and simpler deterministic error handling is preferred.

```ts
import { readFileSync, writeFileSync } from "node:fs"
import process from "node:process"

import { validateCatalogPackBytes } from "./catalog-pack-validator.ts"

function exitCodeForReport(report: CatalogPackValidationReport): 0 | 2 | 3 {
  if (!report.valid) return 2
  return report.ready ? 0 : 3
}
```

Serialize report with exactly:

```ts
const output = `${JSON.stringify(report, null, 2)}\n`
process.stdout.write(output)
if (args.report !== null) writeFileSync(args.report, output, "utf8")
process.exitCode = exitCodeForReport(report)
```

On usage/I/O/internal errors, print one concise line to stderr and set exit code `1`. Do not print stack traces by default.

- [ ] **Step 5: Add the package script**

Modify `package.json` scripts:

```json
"catalog:validate": "node scripts/catalog-pack/catalog-pack-cli.ts"
```

Do not add Supabase env wrappers or credentials to this command.

- [ ] **Step 6: Run CLI tests and an actual command invocation**

Run:

```bash
npx vitest run scripts/catalog-pack/catalog-pack-cli.test.ts --project scripts
npm run catalog:validate -- --input scripts/catalog-pack/does-not-exist.json
```

Expected:

- CLI tests PASS;
- nonexistent-file invocation exits `1` with a concise stderr I/O error and no secret/env output.

- [ ] **Step 7: Run all focused Phase 9A tests**

Run:

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts scripts/catalog-pack/catalog-pack-cli.test.ts --project scripts
```

Expected: PASS.

- [ ] **Step 8: Run repository verification gates**

Run in this order:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run bundle:check
```

Expected: every command PASS; Phase 8 coverage floors remain at statements >= 78, branches >= 70, functions >= 84, lines >= 82; no generated production catalog data appears in the repository.

If formatting is the only failure, run:

```bash
npm run format
```

Then rerun `npm run format:check` and the remaining verification gates. Do not weaken formatting/lint/coverage/bundle thresholds.

- [ ] **Step 9: Prove Phase 9A has no production/database surface**

Run:

```bash
git diff --check
git diff --name-only 7d9ff0dfe135d09d61424b647cfa61216ae2a77a...HEAD
git status --short
```

Review the file list. It may contain only the approved spec/plan plus `scripts/catalog-pack/**`, `tsconfig.node.json`, and `package.json`. It must not contain:

- `supabase/migrations/**`;
- production catalog JSON/CSV;
- `.env*` changes;
- Vercel deployment config changes;
- service-role/secret material.

- [ ] **Step 10: Commit Task 5**

```bash
git add scripts/catalog-pack/catalog-pack-cli.ts scripts/catalog-pack/catalog-pack-cli.test.ts package.json
git commit -m "feat: add offline catalog validation CLI"
```

- [ ] **Step 11: Final exact-head verification evidence**

Capture:

```bash
git rev-parse HEAD
git status --short
npm run typecheck
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts scripts/catalog-pack/catalog-pack-cli.test.ts --project scripts
npm run verify:web
```

`npm run verify:web` includes environment check, secret scan, dependency audit, format, lint, typecheck, coverage, build, and bundle ceiling. Report the exact final HEAD and fresh results. Do not claim `PHASE_9A_PASS` until these commands have actually passed.

---

## Plan Self-Review Checklist

Before implementation completion, verify all of the following against the spec:

1. Strict JSON object shape and no coercion/defaulting are covered by Task 1.
2. Human-owned authoritative values are only validated, never inferred or repaired.
3. All 10 launch allergens and six required nutrients are mandatory; `unknown` is rejected.
4. Launch units/categories/region and dimension compatibility are validated offline.
5. Recipe, step, meal-option, version, conversion, and price graph pins are exact and code-based.
6. Reachable price coverage and unused-entity warnings are covered.
7. Generic launch pack thresholds are 21 meal options and three protein-hint groups.
8. Report SHA uses original bytes; report/blocker/diagnostic ordering is deterministic.
9. Exit codes are exactly 0 ready, 2 invalid, 3 valid-but-not-ready, 1 invocation/I/O/internal failure.
10. CLI never accesses Supabase/network/env secrets and does not import the synthetic test builder.
11. No migration, production mutation, PR, merge, or Vercel deployment occurs.
12. Full repository verification is rerun on the exact implementation head before any PASS claim.
