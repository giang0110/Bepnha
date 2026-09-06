# Phase 9A Production Catalog Pack & Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, offline `CatalogPackV1` validator and CLI that proves a human-curated BepNha production catalog pack is structurally valid and launch-pack ready before any production database write.

**Architecture:** Keep Phase 9A under `scripts/catalog-pack/`. A strict Zod parser handles JSON shape only; a semantic validator checks authoritative values and code-based graph pins; deterministic readiness logic calculates blockers/warnings; a Node 24 CLI reads original bytes, emits a stable SHA-256 report, and maps validity/readiness to exit codes. Runtime modules use Node 24 native TypeScript stripping with relative `.ts` imports and reuse only self-contained deterministic domain constants/helpers.

**Tech Stack:** Node 24, TypeScript, Zod 4, existing `parseCanonicalDecimal`, Vitest 4, Node `crypto`/`fs`/`child_process` APIs.

**Spec:** `docs/superpowers/specs/2026-09-06-phase-9a-production-catalog-validator-design.md`

## Global Constraints

- Offline only: no Supabase, Vercel, HTTP, scraping, Gemini, or other LLM calls.
- Never infer, repair, trim, lower-case, round, substitute, or default authoritative nutrition, allergy, yield, recipe quantity, conversion, meal composition, or price values.
- Real production packs are supplied explicitly at runtime and are never generated from the existing CI readiness fixture.
- Logical codes are validated offline; production UUID/reference resolution belongs to Phase 9B.
- `unknown` allergen assessment is invalid because current deterministic food lineage rejects it.
- `observedAt` remains strict `YYYY-MM-DD`, matching current catalog-admin validation.
- Generic launch-pack readiness requires at least 21 meal options and at least 3 distinct `proteinHintCode` values.
- Existing planner/publication/allergy/price rules and Phase 8 quality gates are not weakened.
- No migration, production mutation, PR creation, merge, or deployment is part of this plan.
- Work stays on `codex/phase-9a-production-catalog-validator` until separate review/PR authorization.

---

## File Structure

- Create `scripts/catalog-pack/catalog-pack-types.ts` — exact pack/report types and fixed launch reference sets.
- Create `scripts/catalog-pack/catalog-pack-schema.ts` — strict Zod shape parser only.
- Create `scripts/catalog-pack/catalog-pack-validator.ts` — semantic, graph, readiness, SHA/report logic.
- Create `scripts/catalog-pack/catalog-pack-test-builder.ts` — mutable synthetic test pack builder only.
- Create `scripts/catalog-pack/catalog-pack-validator.test.ts` — shape, authority, graph, readiness, determinism tests.
- Create `scripts/catalog-pack/catalog-pack-cli.ts` — argument parsing, file I/O, output, exit codes.
- Create `scripts/catalog-pack/catalog-pack-cli.test.ts` — spawned CLI contract tests using temp files.
- Modify `tsconfig.node.json` — permit explicit `.ts` imports in no-emit Node scripts.
- Modify `package.json` — add `catalog:validate`.

---

### Task 1: Exact Types, Launch Reference Policy, and Strict Shape Parser

**Files:**
- Create: `scripts/catalog-pack/catalog-pack-types.ts`
- Create: `scripts/catalog-pack/catalog-pack-schema.ts`
- Create: `scripts/catalog-pack/catalog-pack-validator.test.ts`
- Modify: `tsconfig.node.json`

**Interfaces:**
- Consumes: `SUPPORTED_ALLERGEN_CODES`, `REQUIRED_NUTRIENT_CODES` from `../../src/domain/catalog/catalog.ts`.
- Produces: `CatalogPackV1`, report/diagnostic types, launch constants, `parseCatalogPackShape(value: unknown)`.

- [ ] **Step 1: Enable explicit `.ts` imports**

Add next to `noEmit` in `tsconfig.node.json`:

```json
"allowImportingTsExtensions": true
```

Keep `noEmit: true` unchanged.

- [ ] **Step 2: Define launch constants and exact pack/report interfaces**

Create `scripts/catalog-pack/catalog-pack-types.ts`:

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
  "food", "pork", "beef", "poultry", "seafood", "fish", "crustacean",
  "mollusc", "egg", "dairy", "tofu", "vegetable", "staple", "seasoning"
] as const
export const LAUNCH_REGION_CODE = "vn_baseline" as const

export interface CatalogPackFood {
  readonly code: string
  readonly nameVi: string
  readonly baseDimension: "mass" | "volume" | "count"
  readonly baseUnitCode: string
  readonly fact: {
    readonly versionNumber: number
    readonly categoryCode: string
    readonly categoryAncestry: readonly string[]
    readonly edibleFraction: string
    readonly provenance: string
    readonly allergenAssessments: readonly {
      readonly allergenCode: string
      readonly status: "absent" | "contains" | "may_contain" | "unknown"
      readonly provenance: string
    }[]
    readonly nutrients: readonly {
      readonly nutrientCode: string
      readonly amountPer100g: string
      readonly provenance: string
    }[]
    readonly dietaryTagCodes: readonly string[]
    readonly conversions: readonly {
      readonly unitCode: string
      readonly baseQuantityPerUnit: string
      readonly grossGramsPerUnit: string
      readonly displayStep: string
      readonly provenance: string
    }[]
  }
}

export interface CatalogPackRecipe {
  readonly code: string
  readonly nameVi: string
  readonly version: {
    readonly versionNumber: number
    readonly yieldAdultEquivalent: string
    readonly activeMinutes: number
    readonly elapsedMinutes: number
    readonly ingredients: readonly {
      readonly ingredientCode: string
      readonly foodCode: string
      readonly foodFactVersionNumber: number
      readonly quantity: string
      readonly unitCode: string
      readonly preparationNoteVi: string | null
      readonly order: number
    }[]
    readonly steps: readonly {
      readonly order: number
      readonly instructionVi: string
      readonly timerMinutes: number | null
      readonly ingredientCodes: readonly string[]
    }[]
    readonly tagCodes: readonly string[]
  }
}

export interface CatalogPackPriceBook {
  readonly regionCode: "vn_baseline"
  readonly versionNumber: number
  readonly effectiveFrom: string
  readonly effectiveTo: string | null
  readonly prices: readonly {
    readonly foodCode: string
    readonly foodFactVersionNumber: number
    readonly packageQuantity: string
    readonly packageUnitCode: string
    readonly packageBaseQuantity: string
    readonly baseUnitCode: string
    readonly packagePriceVnd: number
    readonly purchaseIncrement: string
    readonly observedAt: string
    readonly sourceReference: string
  }[]
}

export interface CatalogPackMealOption {
  readonly code: string
  readonly nameVi: string
  readonly version: {
    readonly versionNumber: number
    readonly yieldAdultEquivalent: string
    readonly activeMinutes: number
    readonly elapsedMinutes: number
    readonly proteinHintCode: string
    readonly cookingStyleCodes: readonly string[]
    readonly dishRoleCodes: readonly string[]
    readonly components: readonly {
      readonly recipeCode: string
      readonly recipeVersionNumber: number
      readonly quantityMultiplier: string
      readonly mealRole: "staple" | "main" | "vegetable" | "soup" | "side"
      readonly order: number
    }[]
  }
}

export interface CatalogPackV1 {
  readonly schemaVersion: "1"
  readonly catalogCode: string
  readonly preparedAt: string
  readonly source: {
    readonly name: string
    readonly provenance: string
  }
  readonly foods: readonly CatalogPackFood[]
  readonly recipes: readonly CatalogPackRecipe[]
  readonly priceBook: CatalogPackPriceBook
  readonly mealOptions: readonly CatalogPackMealOption[]
}

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

- [ ] **Step 3: Write RED strict-shape tests**

Create `catalog-pack-validator.test.ts`:

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
  test("rejects unknown keys", () => {
    expect(parseCatalogPackShape({ ...minimumShape, unexpected: true }).success).toBe(false)
  })

  test("does not coerce strings into numbers", () => {
    const value = {
      ...minimumShape,
      priceBook: { ...minimumShape.priceBook, versionNumber: "1" }
    }
    expect(parseCatalogPackShape(value).success).toBe(false)
  })
})
```

- [ ] **Step 4: Run RED**

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
```

Expected: FAIL because `catalog-pack-schema.ts` does not exist.

- [ ] **Step 5: Implement strict Zod shape parser**

Use `z.strictObject` at every object level, `z.array` for every list, `z.enum` for `baseDimension`, allergen status, and meal role, and `z.literal("vn_baseline")` for region. Every decimal/date/code field remains `z.string()` at this layer; every integer-like field remains `z.number()`.

The top level is exactly:

```ts
const catalogPackSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  catalogCode: z.string(),
  preparedAt: z.string(),
  source: z.strictObject({ name: z.string(), provenance: z.string() }),
  foods: z.array(foodSchema),
  recipes: z.array(recipeSchema),
  priceBook: priceBookSchema,
  mealOptions: z.array(mealOptionSchema)
})

export function parseCatalogPackShape(value: unknown) {
  return catalogPackSchema.safeParse(value)
}
```

The nested schemas must contain exactly the fields listed in the interfaces in Step 2. Do not use `z.coerce`, `.trim()`, `.transform()`, `.default()`, or `.catch()`.

- [ ] **Step 6: Verify and commit Task 1**

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
npm run typecheck
git add tsconfig.node.json scripts/catalog-pack/catalog-pack-types.ts scripts/catalog-pack/catalog-pack-schema.ts scripts/catalog-pack/catalog-pack-validator.test.ts
git commit -m "feat: add Phase 9A catalog pack schema"
```

Expected: tests/typecheck PASS before commit.

---

### Task 2: Mutable Synthetic Test Pack and Authoritative Field Validation

**Files:**
- Create: `scripts/catalog-pack/catalog-pack-test-builder.ts`
- Create: `scripts/catalog-pack/catalog-pack-validator.ts`
- Modify: `scripts/catalog-pack/catalog-pack-validator.test.ts`

**Interfaces:**
- Consumes: `parseCatalogPackShape`, launch constants, `parseCanonicalDecimal` from `../../src/domain/shared/decimal.ts`.
- Produces: `validateCatalogPackValue(value: unknown): CatalogPackValidationCoreResult`.

- [ ] **Step 1: Create mutable test-only builder**

Use:

```ts
import type { CatalogPackV1 } from "./catalog-pack-types.ts"

type Mutable<T> =
  T extends readonly (infer U)[] ? Mutable<U>[] :
  T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T

export type MutableCatalogPackV1 = Mutable<CatalogPackV1>
```

`buildReadyCatalogPack(): MutableCatalogPackV1` must return exactly:

- foods: `test_tofu`, `test_chicken`, `test_fish`;
- categories: `tofu`, `poultry`, `fish` with ancestry `["tofu","food"]`, `["poultry","food"]`, `["fish","seafood","food"]`;
- base dimension/unit: `mass` / `g` for all three;
- food fact version `1`, edible fraction `"1"`, one `g` conversion (`baseQuantityPerUnit: "1"`, `grossGramsPerUnit: "1"`, `displayStep: "5"`);
- all 10 launch allergen rows; tofu has `soy: contains`, fish has `fish: contains`, all other rows `absent`;
- all six nutrient rows using synthetic values `energy_kcal: "100"`, `protein_g: "10"`, `carbohydrate_g: "5"`, `fat_g: "4"`, `fibre_g: "2"`, `sodium_mg: "50"`;
- recipes `test_tofu_recipe`, `test_chicken_recipe`, `test_fish_recipe`, each version `1`, yield `"1"`, active `10`, elapsed `20`, one ingredient of `"100"` g, one step referencing that ingredient, tagCodes `["main"]`;
- one `vn_baseline` price row per food, version `1`, effectiveFrom/observedAt `"2026-09-06"`, packageQuantity/baseQuantity/purchaseIncrement `"1"`, package/base unit `g`, packagePriceVnd `10000`;
- 21 meal options named `test_meal_01`..`test_meal_21`, cycling the three recipes and `proteinHintCode` values `plant`, `poultry`, `fish`, with cookingStyleCodes `["boil"]`, dishRoleCodes `["main"]`, one `main` component, multiplier `"1"`;
- every provenance/source field exactly `"Synthetic Phase 9A test data"` or a longer string starting with it.

Generate the 21 meals with `Array.from({ length: 21 }, ...)`; do not hard-code 21 duplicate objects. This file is test support only and must never be imported by `catalog-pack-cli.ts`.

- [ ] **Step 2: Write RED authoritative-field matrix tests**

Implement one `test.each` matrix where each row clones `buildReadyCatalogPack()`, applies one mutation, and expects one diagnostic code:

| Mutation | Expected diagnostic |
| --- | --- |
| `catalogCode = "Launch"` | `INVALID_CODE` |
| `source.name = " Catalog"` | `INVALID_LABEL` |
| `source.provenance = ""` | `INVALID_PROVENANCE` |
| `preparedAt = "2026-09-06"` | `INVALID_TIMESTAMP` |
| duplicate first food code into second | `DUPLICATE_CATALOG_ENTRY` |
| food `baseUnitCode = "oz"` | `REFERENCE_CODE_UNSUPPORTED` |
| food category `unknown_category` | `REFERENCE_CODE_UNSUPPORTED` |
| mass food `baseUnitCode = "ml"` | `BASE_UNIT_DIMENSION_MISMATCH` |
| `edibleFraction = "01.0"` | `INVALID_DECIMAL` |
| one allergen status `unknown` | `UNKNOWN_ALLERGEN_LINEAGE` |
| remove one allergen | `ALLERGEN_COVERAGE_INCOMPLETE` |
| duplicate one allergen code | `DUPLICATE_CATALOG_ENTRY` |
| remove one nutrient | `REQUIRED_NUTRITION_COVERAGE_INCOMPLETE` |
| duplicate one nutrient code | `DUPLICATE_CATALOG_ENTRY` |
| duplicate conversion unit code | `DUPLICATE_CATALOG_ENTRY` |
| recipe yield `"0"` | `INVALID_DECIMAL` |
| recipe elapsed `181` | `INVALID_DURATION` |
| ingredient order `2` in one-item recipe | `INVALID_ORDER` |
| preparation note length 121 | `INVALID_LABEL` |
| step instruction length 501 | `INVALID_LABEL` |
| price `observedAt` timestamp | `INVALID_DATE` |
| `effectiveTo < effectiveFrom` | `INVALID_DATE_RANGE` |
| `packagePriceVnd = 1.5` | `INVALID_PRICE` |
| price source `"TBD"` | `INVALID_SOURCE_REFERENCE` |
| meal active `0` | `INVALID_DURATION` |
| meal component order `2` in one-item meal | `INVALID_ORDER` |
| duplicate recipe component | `DUPLICATE_CATALOG_ENTRY` |
| no `main` component | `MEAL_MAIN_COMPONENT_REQUIRED` |
| duplicate cooking style | `DUPLICATE_CATALOG_ENTRY` |
| duplicate dish role | `DUPLICATE_CATALOG_ENTRY` |

Use this concrete helper shape:

```ts
const cases: readonly {
  name: string
  mutate: (pack: MutableCatalogPackV1) => void
  code: string
}[] = [
  {
    name: "rejects non-canonical edible fraction",
    mutate: (pack) => { pack.foods[0]!.fact.edibleFraction = "01.0" },
    code: "INVALID_DECIMAL"
  }
]

test.each(cases)("$name", ({ mutate, code }) => {
  const pack = structuredClone(buildReadyCatalogPack())
  mutate(pack)
  expect(validateCatalogPackValue(pack).diagnostics.map((item) => item.code)).toContain(code)
})
```

Expand `cases` to contain every row in the table.

- [ ] **Step 3: Run RED**

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
```

Expected: FAIL because semantic validation is missing.

- [ ] **Step 4: Implement deterministic primitive helpers**

Create `catalog-pack-validator.ts` with:

```ts
import { parseCanonicalDecimal } from "../../src/domain/shared/decimal.ts"
import { parseCatalogPackShape } from "./catalog-pack-schema.ts"

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/u
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u
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

function isValidRfc3339(value: string): boolean {
  return RFC3339_PATTERN.test(value) && Number.isFinite(Date.parse(value))
}
```

Use `parseCanonicalDecimal` with current domain constraints; do not implement a second decimal grammar.

- [ ] **Step 5: Implement non-mutating semantic validation**

Implement exactly these functions:

```ts
function validateTopLevelFields(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[]): void
function validateFoodFields(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[], blockers: Set<string>): void
function validateRecipeFields(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[]): void
function validatePriceFields(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[], blockers: Set<string>): void
function validateMealOptionFields(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[]): void
```

Rules:

- all codes match `^[a-z][a-z0-9_]*$`;
- `catalogCode` code-valid; `preparedAt` RFC3339 with explicit offset/Z;
- source name 1..120 trimmed; provenance/source reference 1..500 trimmed;
- food/recipe/meal names 1..120 trimmed;
- preparation note null or 1..120 trimmed; step instruction 1..500 trimmed;
- positive safe integer versions; active >=1; elapsed >= active and <=180;
- positive canonical decimals for yields/quantities/conversions; nutrient amount canonical non-negative; edible fraction `(0,1]` with max scale 6;
- allergen set equals exactly the 10 launch codes, no duplicates, no `unknown`;
- nutrient set equals exactly the six required codes, no duplicates;
- conversion unit codes unique; launch units/categories/region only;
- unit dimension map: `g/kg -> mass`, `ml/l/tsp/tbsp -> volume`, `item -> count`;
- category ancestry unique, non-empty, first equals `categoryCode`, last equals `food`;
- dietary/recipe/protein/style/dish-role codes syntax-valid; duplicate tag/style/dish-role codes invalid;
- recipe ingredient and step order contiguous `1..N`; ingredient codes unique;
- price effective/observed dates valid, `effectiveTo >= effectiveFrom`; VND positive safe integer; placeholder source rejected;
- meal component order contiguous `1..N`; recipe component codes unique; >=1 component; >=1 `main`; one non-empty protein hint; >=1 cooking style.

For unsupported unit/category/region emit error `REFERENCE_CODE_UNSUPPORTED` and blocker of same name. Missing/duplicate/unknown allergen coverage adds `ALLERGEN_COVERAGE_INCOMPLETE`. Missing/duplicate required nutrition adds `REQUIRED_NUTRITION_COVERAGE_INCOMPLETE`.

Shape errors are converted from Zod issues to `INVALID_SHAPE` diagnostics using deterministic paths like `$.foods[0].nameVi`; if shape parsing fails, semantic/graph/readiness layers do not run and summary is all zeros.

- [ ] **Step 6: Verify and commit Task 2**

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
npm run typecheck
git add scripts/catalog-pack/catalog-pack-test-builder.ts scripts/catalog-pack/catalog-pack-validator.ts scripts/catalog-pack/catalog-pack-validator.test.ts
git commit -m "feat: validate Phase 9A catalog pack fields"
```

Expected: PASS before commit.

---

### Task 3: Cross-Pack Graph, Coverage, Warnings, and Readiness

**Files:**
- Modify: `scripts/catalog-pack/catalog-pack-validator.ts`
- Modify: `scripts/catalog-pack/catalog-pack-validator.test.ts`

**Interfaces:**
- Consumes: shape-valid `CatalogPackV1`.
- Produces: graph diagnostics, blocker set, reachable/price/protein counts.

- [ ] **Step 1: Write RED graph/readiness matrix**

Add this table as `test.each` cases:

| Mutation | Diagnostic | Blocker/warning |
| --- | --- | --- |
| recipe ingredient `foodCode = "missing_food"` | `UNRESOLVED_FOOD_REFERENCE` | `CATALOG_LINEAGE_INCOMPLETE` blocker |
| ingredient foodFactVersionNumber `2` | `FOOD_FACT_VERSION_MISMATCH` | `CATALOG_LINEAGE_INCOMPLETE` blocker |
| ingredient unit `kg` while food has only base/conversion `g` | `UNPINNED_UNIT_CONVERSION` | `CATALOG_LINEAGE_INCOMPLETE` blocker |
| step ingredientCode `missing_ingredient` | `UNRESOLVED_INGREDIENT_REFERENCE` | `CATALOG_LINEAGE_INCOMPLETE` blocker |
| remove all step references to existing ingredient | `UNUSED_RECIPE_INGREDIENT` | `CATALOG_LINEAGE_INCOMPLETE` blocker |
| meal recipeCode `missing_recipe` | `UNRESOLVED_RECIPE_REFERENCE` | `CATALOG_LINEAGE_INCOMPLETE` blocker |
| meal recipeVersionNumber `2` | `RECIPE_VERSION_MISMATCH` | `CATALOG_LINEAGE_INCOMPLETE` blocker |
| remove reachable fish price row | `MISSING_REACHABLE_PRICE` | `PRICE_COVERAGE_INCOMPLETE` blocker |
| keep only first 20 meal options | none required | `MINIMUM_MEAL_OPTIONS_NOT_MET` blocker |
| change all protein hints to `plant` | none required | `INSUFFICIENT_PRIMARY_PROTEIN_GROUP_CAPACITY` blocker |
| add extra unreferenced recipe | `UNUSED_RECIPE` | warning only |
| add extra unreferenced priced food | `UNUSED_FOOD` | warning only |
| add extra unreferenced unpriced food | `UNUSED_FOOD`, `UNUSED_FOOD_WITHOUT_PRICE` | warnings only |

For blocker rows assert `result.blockers` contains the named blocker. For warning rows assert diagnostic severity is `warning` and `valid` remains unaffected once report construction exists.

- [ ] **Step 2: Run RED**

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
```

Expected: FAIL on graph/readiness cases.

- [ ] **Step 3: Build code indexes only after duplicate checks**

```ts
const foodsByCode = new Map(pack.foods.map((food) => [food.code, food]))
const recipesByCode = new Map(pack.recipes.map((recipe) => [recipe.code, recipe]))
const priceByFoodVersion = new Map(
  pack.priceBook.prices.map((price) => [`${price.foodCode}:${price.foodFactVersionNumber}`, price])
)
```

Never treat Map overwrite as duplicate resolution.

- [ ] **Step 4: Implement exact graph traversal**

```ts
interface GraphResult {
  readonly reachableFoodCodes: ReadonlySet<string>
  readonly reachableRecipeCodes: ReadonlySet<string>
  readonly pricedReachableFoodCodes: ReadonlySet<string>
}

function validateGraph(
  pack: CatalogPackV1,
  diagnostics: CatalogPackDiagnostic[],
  blockers: Set<string>
): GraphResult
```

Algorithm:

1. Resolve every recipe ingredient `foodCode` and exact `foodFactVersionNumber`.
2. Require ingredient `unitCode` to equal food base unit or appear in fact conversions.
3. Resolve every step `ingredientCode`; track referenced ingredients and fail any never referenced.
4. Resolve every meal component `recipeCode` and exact `recipeVersionNumber`.
5. Seed `reachableRecipeCodes` from meal components.
6. For each reachable recipe, add its ingredient foods to `reachableFoodCodes`.
7. For each reachable food, lookup price key `${food.code}:${food.fact.versionNumber}`; add to `pricedReachableFoodCodes` or emit missing-price error/blocker.
8. Never resolve “latest” versions.

Any unresolved required edge adds `CATALOG_LINEAGE_INCOMPLETE`; missing reachable prices add `PRICE_COVERAGE_INCOMPLETE`.

- [ ] **Step 5: Implement warnings and launch blockers**

Warnings:

- recipe not in `reachableRecipeCodes` -> `UNUSED_RECIPE`;
- food not in `reachableFoodCodes` -> `UNUSED_FOOD`;
- unused food without exact price key -> `UNUSED_FOOD_WITHOUT_PRICE`.

Readiness blockers:

```ts
if (pack.mealOptions.length < 21) blockers.add("MINIMUM_MEAL_OPTIONS_NOT_MET")
const proteinGroups = new Set(pack.mealOptions.map((meal) => meal.version.proteinHintCode))
if (proteinGroups.size < 3) blockers.add("INSUFFICIENT_PRIMARY_PROTEIN_GROUP_CAPACITY")
```

Summary:

```ts
{
  foods: pack.foods.length,
  recipes: pack.recipes.length,
  priceRows: pack.priceBook.prices.length,
  mealOptions: pack.mealOptions.length,
  primaryProteinGroups: proteinGroups.size,
  reachableFoods: graph.reachableFoodCodes.size,
  pricedReachableFoods: graph.pricedReachableFoodCodes.size
}
```

- [ ] **Step 6: Verify and commit Task 3**

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
npm run typecheck
git add scripts/catalog-pack/catalog-pack-validator.ts scripts/catalog-pack/catalog-pack-validator.test.ts
git commit -m "feat: add catalog pack graph readiness checks"
```

Expected: PASS before commit.

---

### Task 4: Original-Byte SHA and Deterministic Final Report

**Files:**
- Modify: `scripts/catalog-pack/catalog-pack-validator.ts`
- Modify: `scripts/catalog-pack/catalog-pack-validator.test.ts`

**Interfaces:**
- Produces: `validateCatalogPackBytes(input: Uint8Array): CatalogPackValidationReport` used by CLI.

- [ ] **Step 1: Write RED deterministic-report tests**

```ts
import { validateCatalogPackBytes } from "./catalog-pack-validator.ts"

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

test("ready synthetic pack is valid and ready", () => {
  const report = validateCatalogPackBytes(bytes(buildReadyCatalogPack()))
  expect(report.valid).toBe(true)
  expect(report.ready).toBe(true)
  expect(report.summary).toMatchObject({ mealOptions: 21, primaryProteinGroups: 3 })
  expect(report.blockers).toEqual([])
})

test("identical bytes produce identical report", () => {
  const input = bytes(buildReadyCatalogPack())
  expect(validateCatalogPackBytes(input)).toEqual(validateCatalogPackBytes(input))
})

test("SHA hashes original bytes", () => {
  const compact = new TextEncoder().encode('{"schemaVersion":"1"}')
  const spaced = new TextEncoder().encode('{ "schemaVersion": "1" }')
  expect(validateCatalogPackBytes(compact).inputSha256)
    .not.toBe(validateCatalogPackBytes(spaced).inputSha256)
})
```

Add assertions that blockers are lexicographically sorted, diagnostics sort by `severity`, `code`, `path`, `message`, invalid UTF-8/JSON returns `INVALID_JSON`, and report contains no current timestamp/input path/UUID.

- [ ] **Step 2: Run RED**

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
```

Expected: FAIL because byte-level API is missing.

- [ ] **Step 3: Implement fatal UTF-8 decode and original-byte SHA**

```ts
import { createHash } from "node:crypto"

function sha256(input: Uint8Array): string {
  return createHash("sha256").update(input).digest("hex")
}

function parseJsonBytes(input: Uint8Array): { ok: true; value: unknown } | { ok: false } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(input)
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false }
  }
}
```

Invalid UTF-8/JSON -> one `error` diagnostic `{ code: "INVALID_JSON", path: "$" }`, `catalogCode: null`, zero summary, `valid: false`, `ready: false`.

- [ ] **Step 4: Implement stable report ordering and flags**

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

const diagnostics = sortDiagnostics(core.diagnostics)
const blockers = [...new Set(core.blockers)].sort()
const valid = !diagnostics.some((item) => item.severity === "error")
const ready = valid && blockers.length === 0
```

No current time, random values, environment data, filesystem paths, UUIDs, tokens, or secrets may appear in report output.

- [ ] **Step 5: Verify and commit Task 4**

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
npm run typecheck
git add scripts/catalog-pack/catalog-pack-validator.ts scripts/catalog-pack/catalog-pack-validator.test.ts
git commit -m "feat: produce deterministic catalog validation reports"
```

Expected: PASS before commit.

---

### Task 5: Offline CLI and Exact-Head Verification

**Files:**
- Create: `scripts/catalog-pack/catalog-pack-cli.ts`
- Create: `scripts/catalog-pack/catalog-pack-cli.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `validateCatalogPackBytes`.
- Produces: `npm run catalog:validate -- --input <path> [--report <path>]`.
- Exit codes: `0` ready, `2` invalid, `3` valid-but-not-ready, `1` usage/I/O/internal error.

- [ ] **Step 1: Write RED spawned CLI tests**

Create helper:

```ts
function runCli(args: readonly string[]) {
  return spawnSync(process.execPath, ["scripts/catalog-pack/catalog-pack-cli.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8"
  })
}
```

CLI test matrix:

| Input/args | Expected |
| --- | --- |
| ready synthetic temp JSON | exit `0`, stdout report `{valid:true,ready:true}`, empty stderr |
| `{ "schemaVersion": "2" }` | exit `2` |
| ready pack with 20 meals | exit `3` |
| no args | exit `1`, stderr usage, empty stdout |
| `--input` with no value | exit `1` |
| duplicate `--input` | exit `1` |
| unknown `--foo` | exit `1` |
| nonexistent input | exit `1`, concise I/O stderr |
| valid `--report path` | report file bytes equal stdout bytes |
| ready input at absolute path | stdout must not contain that path |

Use `mkdtempSync`, `writeFileSync`, `readFileSync`, `tmpdir`, and `join` for temp files. Do not connect to network or database.

- [ ] **Step 2: Run RED**

```bash
npx vitest run scripts/catalog-pack/catalog-pack-cli.test.ts --project scripts
```

Expected: FAIL because CLI is missing.

- [ ] **Step 3: Implement exact no-prompt argument parser**

```ts
type CliArgs = { readonly input: string; readonly report: string | null }
type ParseArgsResult =
  | { readonly ok: true; readonly value: CliArgs }
  | { readonly ok: false; readonly message: string }
```

Accept only one `--input <value>` and zero/one `--report <value>`. Reject duplicates, positional args, unknown flags, and missing values. Never inspect env vars and never prompt.

- [ ] **Step 4: Implement file/report/exit behavior**

```ts
import { readFileSync, writeFileSync } from "node:fs"
import process from "node:process"
import type { CatalogPackValidationReport } from "./catalog-pack-types.ts"
import { validateCatalogPackBytes } from "./catalog-pack-validator.ts"

function exitCodeForReport(report: CatalogPackValidationReport): 0 | 2 | 3 {
  if (!report.valid) return 2
  return report.ready ? 0 : 3
}
```

Serialize exactly:

```ts
const output = `${JSON.stringify(report, null, 2)}\n`
process.stdout.write(output)
if (args.report !== null) writeFileSync(args.report, output, "utf8")
process.exitCode = exitCodeForReport(report)
```

Usage/I/O/unexpected failures print one concise stderr line and exit `1`; do not print stack traces, env values, secrets, or input contents.

- [ ] **Step 5: Add package command**

Add to `package.json` scripts:

```json
"catalog:validate": "node scripts/catalog-pack/catalog-pack-cli.ts"
```

Do not wrap it in any Supabase env helper.

- [ ] **Step 6: Verify focused behavior**

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts scripts/catalog-pack/catalog-pack-cli.test.ts --project scripts
npm run catalog:validate -- --input scripts/catalog-pack/does-not-exist.json
```

Expected: tests PASS; nonexistent input exits `1` with concise stderr only.

- [ ] **Step 7: Run repository quality gates**

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run bundle:check
```

Expected: all PASS. Keep Phase 8 floors unchanged: statements >=78, branches >=70, functions >=84, lines >=82; bundle ceiling unchanged. If formatting alone fails, run `npm run format` and rerun all gates; never weaken thresholds.

- [ ] **Step 8: Prove scope containment**

```bash
git diff --check
git diff --name-only 7d9ff0dfe135d09d61424b647cfa61216ae2a77a...HEAD
git status --short
```

Allowed changed paths: approved spec/plan, `scripts/catalog-pack/**`, `tsconfig.node.json`, `package.json`. Fail review if diff contains `supabase/migrations/**`, production catalog JSON/CSV, `.env*`, Vercel config, or service-role/secret material.

- [ ] **Step 9: Commit Task 5**

```bash
git add scripts/catalog-pack/catalog-pack-cli.ts scripts/catalog-pack/catalog-pack-cli.test.ts package.json
git commit -m "feat: add offline catalog validation CLI"
```

- [ ] **Step 10: Fresh exact-head completion verification**

```bash
git rev-parse HEAD
git status --short
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts scripts/catalog-pack/catalog-pack-cli.test.ts --project scripts
npm run verify:web
```

Do not claim `PHASE_9A_PASS` without fresh PASS output on the exact final HEAD. Do not create a PR, merge, mutate production, or deploy without separate user authorization.

---

## Plan Self-Review Coverage

1. Strict shape/no coercion: Task 1.
2. Authoritative values never inferred/repaired: Task 2.
3. Ten allergens + six nutrients + `unknown` rejection: Task 2.
4. Launch units/categories/region/dimension and exact timestamp/date/decimal rules: Task 2.
5. Recipe/step/meal/version/conversion/price graph pins: Task 3.
6. Reachable price coverage and unused warnings: Task 3.
7. 21 meal options + three protein hints: Task 3.
8. Original-byte SHA and deterministic sorting: Task 4.
9. Exit codes 0/1/2/3 and no-network/no-secret CLI: Task 5.
10. Full repo verification and scope containment: Task 5.
