# Phase 9A Production Catalog Pack & Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, offline `CatalogPackV1` validator and CLI that proves a human-curated BepNha production catalog pack is structurally valid and launch-pack ready before any production database write.

**Architecture:** Keep Phase 9A under `scripts/catalog-pack/`. A strict Zod parser handles JSON shape only; a semantic validator checks authoritative values and code-based graph pins; deterministic readiness logic calculates blockers/warnings; a Node 24 CLI reads original bytes, emits a stable SHA-256 report, and maps validity/readiness to exit codes. The CLI uses Node 24 native TypeScript stripping with relative `.ts` imports, reusing only self-contained deterministic domain constants/helpers.

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

- Create `scripts/catalog-pack/catalog-pack-types.ts` — pack/report types and fixed launch reference sets.
- Create `scripts/catalog-pack/catalog-pack-schema.ts` — strict Zod shape parser only.
- Create `scripts/catalog-pack/catalog-pack-validator.ts` — semantic, graph, readiness, SHA/report logic.
- Create `scripts/catalog-pack/catalog-pack-test-builder.ts` — mutable synthetic test pack builder only.
- Create `scripts/catalog-pack/catalog-pack-validator.test.ts` — unit tests for shape, authority, graph, readiness, determinism.
- Create `scripts/catalog-pack/catalog-pack-cli.ts` — argument parsing, file I/O, output, exit codes.
- Create `scripts/catalog-pack/catalog-pack-cli.test.ts` — spawned CLI contract tests with temp files.
- Modify `tsconfig.node.json` — permit explicit `.ts` import specifiers in no-emit Node scripts.
- Modify `package.json` — add `catalog:validate`.

---

### Task 1: Strict Pack Types, Reference Policy, and Shape Parser

**Files:**
- Create: `scripts/catalog-pack/catalog-pack-types.ts`
- Create: `scripts/catalog-pack/catalog-pack-schema.ts`
- Create: `scripts/catalog-pack/catalog-pack-validator.test.ts`
- Modify: `tsconfig.node.json`

**Interfaces:**
- Consumes: `SUPPORTED_ALLERGEN_CODES`, `REQUIRED_NUTRIENT_CODES` from `../../src/domain/catalog/catalog.ts`.
- Produces: `CatalogPackV1`, report/diagnostic types, launch constants, `parseCatalogPackShape(value: unknown)`.

- [ ] **Step 1: Enable explicit `.ts` imports**

Add to `tsconfig.node.json`:

```json
"allowImportingTsExtensions": true
```

Keep `noEmit: true` unchanged.

- [ ] **Step 2: Define reviewed constants and report types**

Create `catalog-pack-types.ts` with:

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

Define the approved `CatalogPackFood`, `CatalogPackRecipe`, `CatalogPackPriceBook`, `CatalogPackMealOption`, and `CatalogPackV1` shapes exactly as the spec; do not add UUIDs, revision IDs, environment names, or database-only fields.

- [ ] **Step 3: Write RED strict-shape tests**

Start `catalog-pack-validator.test.ts` with:

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

- [ ] **Step 5: Implement strict Zod shape only**

Use `z.strictObject` for every object, `z.array` for arrays, literal/enums for structural enum values, and never use `z.coerce`, `.trim()`, `.transform()`, `.default()`, or numeric coercion.

Top-level pattern:

```ts
import { z } from "zod"
import { CATALOG_PACK_SCHEMA_VERSION, LAUNCH_REGION_CODE } from "./catalog-pack-types.ts"

const codeText = z.string()
const decimalText = z.string()

const catalogPackSchema = z.strictObject({
  schemaVersion: z.literal(CATALOG_PACK_SCHEMA_VERSION),
  catalogCode: codeText,
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
  return catalogPackSchema.safeParse(value)
}
```

Implement the nested schemas with the approved primitive fields only. Semantic code/date/decimal/length/reference checks stay out of this file.

- [ ] **Step 6: Verify Task 1**

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tsconfig.node.json scripts/catalog-pack/catalog-pack-types.ts scripts/catalog-pack/catalog-pack-schema.ts scripts/catalog-pack/catalog-pack-validator.test.ts
git commit -m "feat: add Phase 9A catalog pack schema"
```

---

### Task 2: Synthetic Mutable Test Pack and Authoritative Field Validation

**Files:**
- Create: `scripts/catalog-pack/catalog-pack-test-builder.ts`
- Create: `scripts/catalog-pack/catalog-pack-validator.ts`
- Modify: `scripts/catalog-pack/catalog-pack-validator.test.ts`

**Interfaces:**
- Consumes: `parseCatalogPackShape`, launch constants, `parseCanonicalDecimal` from `../../src/domain/shared/decimal.ts`.
- Produces: `validateCatalogPackValue(value: unknown): CatalogPackValidationCoreResult`.

- [ ] **Step 1: Create a mutable test-only builder**

Define a deep mutable helper so tests can clone and modify one authoritative field without TypeScript `readonly` errors:

```ts
import type { CatalogPackV1 } from "./catalog-pack-types.ts"

type Mutable<T> =
  T extends readonly (infer U)[] ? Mutable<U>[] :
  T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T

export type MutableCatalogPackV1 = Mutable<CatalogPackV1>

export function buildReadyCatalogPack(): MutableCatalogPackV1 {
  // return the concrete synthetic object described below
}
```

The returned pack must contain exactly 3 foods (`test_tofu`, `test_chicken`, `test_fish`), 3 recipes, 3 prices, and 21 meal options. Every source/provenance string must contain `Synthetic Phase 9A test data`. Each food has all 10 launch allergen assessments and all six required nutrients. Use `g` as base/conversion unit. Cycle meal protein hints `plant`, `poultry`, `fish`.

Generate meal options deterministically:

```ts
const mealOptions = Array.from({ length: 21 }, (_, index) => {
  const slot = index % 3
  const recipeCode = slot === 0
    ? "test_tofu_recipe"
    : slot === 1 ? "test_chicken_recipe" : "test_fish_recipe"
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
      components: [{
        recipeCode,
        recipeVersionNumber: 1,
        quantityMultiplier: "1",
        mealRole: "main" as const,
        order: 1
      }]
    }
  }
})
```

The CLI must never import this builder.

- [ ] **Step 2: Write RED field-invariant tests**

Use `structuredClone(buildReadyCatalogPack())` and mutate exactly one field per test. Required examples:

```ts
test("rejects unknown allergen lineage", () => {
  const pack = structuredClone(buildReadyCatalogPack())
  pack.foods[0]!.fact.allergenAssessments[0]!.status = "unknown"
  expect(validateCatalogPackValue(pack).diagnostics.map((d) => d.code))
    .toContain("UNKNOWN_ALLERGEN_LINEAGE")
})

test("rejects non-canonical decimals", () => {
  const pack = structuredClone(buildReadyCatalogPack())
  pack.foods[0]!.fact.edibleFraction = "01.0"
  expect(validateCatalogPackValue(pack).diagnostics.map((d) => d.code))
    .toContain("INVALID_DECIMAL")
})

test("observedAt must stay a calendar date", () => {
  const pack = structuredClone(buildReadyCatalogPack())
  pack.priceBook.prices[0]!.observedAt = "2026-09-06T12:00:00Z"
  expect(validateCatalogPackValue(pack).diagnostics.map((d) => d.code))
    .toContain("INVALID_DATE")
})
```

Add explicit tests for: invalid/untrimmed `catalogCode`, `source.name`, `source.provenance`, `preparedAt`; duplicate food/recipe/meal codes; unsupported unit/category/region; base-dimension mismatch; duplicate/missing allergen; duplicate/missing nutrient; duplicate conversion; invalid edible fraction; invalid label/provenance length; invalid recipe yield/timing/order; recipe instruction >500; preparation note >120; invalid price effective dates; non-positive/non-integer VND; placeholder source reference (`unknown`, `n/a`, `na`, `todo`, `tbd` case-insensitive); invalid meal timing/order; duplicate meal recipe components; missing `main`; duplicate style/dish-role codes.

`preparedAt` must be accepted only when it is an RFC3339 timestamp with explicit `Z` or numeric offset; validation does not rewrite it.

- [ ] **Step 3: Run RED**

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
```

Expected: FAIL because semantic validation is missing.

- [ ] **Step 4: Implement pure validation helpers**

Start `catalog-pack-validator.ts` with:

```ts
import { parseCanonicalDecimal } from "../../src/domain/shared/decimal.ts"
import { parseCatalogPackShape } from "./catalog-pack-schema.ts"
import type {
  CatalogPackDiagnostic,
  CatalogPackV1,
  CatalogPackValidationReport
} from "./catalog-pack-types.ts"

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

Use existing `parseCanonicalDecimal` with the same constraints as current domain/catalog validation. Do not write another decimal parser.

- [ ] **Step 5: Implement field validation without mutation**

Implement these functions:

```ts
function validateTopLevelFields(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[]): void
function validateFoodFields(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[]): void
function validateRecipeFields(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[]): void
function validatePriceFields(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[]): void
function validateMealOptionFields(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[]): void
```

Rules to encode directly:

- code pattern `^[a-z][a-z0-9_]*$`;
- `nameVi` food/recipe/meal length 1..120 and already trimmed;
- provenance/source reference 1..500 and trimmed;
- preparation note null or 1..120 trimmed;
- recipe instruction 1..500 trimmed;
- positive safe integer versions; active minutes >=1; elapsed >= active and <=180;
- positive canonical decimals for yield/quantity/conversions; nutrient amounts canonical non-negative; edible fraction `(0,1]` with max scale 6;
- all 10 allergen codes exactly once, none `unknown`;
- all six required nutrients exactly once;
- only reviewed launch unit/category/region codes;
- unit dimension map: `g/kg -> mass`, `ml/l/tsp/tbsp -> volume`, `item -> count`;
- `categoryAncestry` unique, non-empty, first equals `categoryCode`, last equals `food`;
- ingredient/step/component order exactly contiguous `1..N`;
- price `observedAt` and effective dates are `YYYY-MM-DD`; `effectiveTo >= effectiveFrom` when not null;
- `packagePriceVnd` positive safe integer;
- placeholder price source references rejected;
- meal option has >=1 component, >=1 `main`, unique recipe component codes, exactly one non-empty protein hint, >=1 unique cooking style, unique dish-role codes.

For unsupported reference values emit `REFERENCE_CODE_UNSUPPORTED` and add blocker `REFERENCE_CODE_UNSUPPORTED`. Missing nutrient/allergen coverage also adds `REQUIRED_NUTRITION_COVERAGE_INCOMPLETE` / `ALLERGEN_COVERAGE_INCOMPLETE` respectively.

Shape failures become `INVALID_SHAPE` diagnostics with deterministic JSON-like paths. If shape parsing fails, no semantic layer runs and summary counts are all zero.

- [ ] **Step 6: Verify Task 2**

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/catalog-pack/catalog-pack-test-builder.ts scripts/catalog-pack/catalog-pack-validator.ts scripts/catalog-pack/catalog-pack-validator.test.ts
git commit -m "feat: validate Phase 9A catalog pack fields"
```

---

### Task 3: Cross-Pack Graph, Coverage, Warnings, and Readiness

**Files:**
- Modify: `scripts/catalog-pack/catalog-pack-validator.ts`
- Modify: `scripts/catalog-pack/catalog-pack-validator.test.ts`

**Interfaces:**
- Consumes: shape-valid `CatalogPackV1`.
- Produces: code-based graph diagnostics, blocker set, reachable/price/protein summary counts.

- [ ] **Step 1: Write RED graph/readiness tests**

Add:

```ts
test("blocks unresolved recipe food references", () => {
  const pack = structuredClone(buildReadyCatalogPack())
  pack.recipes[0]!.version.ingredients[0]!.foodCode = "missing_food"
  const result = validateCatalogPackValue(pack)
  expect(result.blockers).toContain("CATALOG_LINEAGE_INCOMPLETE")
  expect(result.diagnostics.map((d) => d.code)).toContain("UNRESOLVED_FOOD_REFERENCE")
})

test("blocks missing reachable price", () => {
  const pack = structuredClone(buildReadyCatalogPack())
  pack.priceBook.prices = pack.priceBook.prices.filter((p) => p.foodCode !== "test_fish")
  expect(validateCatalogPackValue(pack).blockers).toContain("PRICE_COVERAGE_INCOMPLETE")
})

test("requires 21 meal options", () => {
  const pack = structuredClone(buildReadyCatalogPack())
  pack.mealOptions = pack.mealOptions.slice(0, 20)
  expect(validateCatalogPackValue(pack).blockers).toContain("MINIMUM_MEAL_OPTIONS_NOT_MET")
})

test("requires three protein groups", () => {
  const pack = structuredClone(buildReadyCatalogPack())
  for (const meal of pack.mealOptions) meal.version.proteinHintCode = "plant"
  expect(validateCatalogPackValue(pack).blockers)
    .toContain("INSUFFICIENT_PRIMARY_PROTEIN_GROUP_CAPACITY")
})
```

Also cover exact food-fact version mismatch, ingredient unit not base/conversion, unresolved step ingredient, ingredient never referenced by any step, exact recipe-version mismatch from meal option, unused recipe warning, unused food warning, and unused unpriced food warning.

- [ ] **Step 2: Run RED**

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
```

Expected: FAIL on graph/readiness expectations.

- [ ] **Step 3: Build deterministic code indexes**

After duplicate checks, build:

```ts
const foodsByCode = new Map(pack.foods.map((food) => [food.code, food]))
const recipesByCode = new Map(pack.recipes.map((recipe) => [recipe.code, recipe]))
const priceByFoodVersion = new Map(
  pack.priceBook.prices.map((price) => [`${price.foodCode}:${price.foodFactVersionNumber}`, price])
)
```

Never use Map overwrite as duplicate resolution; duplicates remain validation errors.

- [ ] **Step 4: Validate graph pins exactly**

Implement:

```ts
function validateGraph(pack: CatalogPackV1, diagnostics: CatalogPackDiagnostic[]) {
  return {
    reachableFoodCodes: new Set<string>(),
    reachableRecipeCodes: new Set<string>(),
    pricedReachableFoodCodes: new Set<string>()
  }
}
```

Populate sets while enforcing:

1. recipe ingredient `foodCode` resolves inside this pack;
2. ingredient `foodFactVersionNumber` equals referenced `food.fact.versionNumber`;
3. ingredient unit equals food base unit or appears in fact conversions;
4. step ingredient codes resolve inside same recipe and every ingredient appears in >=1 step;
5. meal component `recipeCode` resolves and `recipeVersionNumber` equals exact recipe version;
6. reachability begins at all meal-option components and flows recipe -> food;
7. each reachable food/version has exactly one price row;
8. no implicit latest-version lookup.

Unresolved required edges emit specific errors and blocker `CATALOG_LINEAGE_INCOMPLETE`; missing reachable prices add `PRICE_COVERAGE_INCOMPLETE`.

- [ ] **Step 5: Add deterministic warnings**

Emit warnings only:

- `UNUSED_RECIPE` for recipe not reachable from any meal option;
- `UNUSED_FOOD` for food not reachable from any meal option;
- `UNUSED_FOOD_WITHOUT_PRICE` for unused food with no price row.

Deduplicate by `(code,path)`.

- [ ] **Step 6: Add launch blockers and summary**

```ts
if (pack.mealOptions.length < 21) blockers.add("MINIMUM_MEAL_OPTIONS_NOT_MET")
const proteinGroups = new Set(pack.mealOptions.map((meal) => meal.version.proteinHintCode))
if (proteinGroups.size < 3) blockers.add("INSUFFICIENT_PRIMARY_PROTEIN_GROUP_CAPACITY")
```

Summary must be:

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

- [ ] **Step 7: Verify Task 3**

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/catalog-pack/catalog-pack-validator.ts scripts/catalog-pack/catalog-pack-validator.test.ts
git commit -m "feat: add catalog pack graph readiness checks"
```

---

### Task 4: Stable Byte-Level SHA and Final Report

**Files:**
- Modify: `scripts/catalog-pack/catalog-pack-validator.ts`
- Modify: `scripts/catalog-pack/catalog-pack-validator.test.ts`

**Interfaces:**
- Produces: `validateCatalogPackBytes(input: Uint8Array): CatalogPackValidationReport`, the only validator API used by CLI.

- [ ] **Step 1: Write RED determinism tests**

```ts
import { validateCatalogPackBytes } from "./catalog-pack-validator.ts"

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

test("ready synthetic pack is valid and ready", () => {
  const report = validateCatalogPackBytes(bytes(buildReadyCatalogPack()))
  expect(report.valid).toBe(true)
  expect(report.ready).toBe(true)
  expect(report.summary.mealOptions).toBe(21)
  expect(report.summary.primaryProteinGroups).toBe(3)
  expect(report.blockers).toEqual([])
})

test("identical bytes produce identical report", () => {
  const input = bytes(buildReadyCatalogPack())
  expect(validateCatalogPackBytes(input)).toEqual(validateCatalogPackBytes(input))
})

test("SHA is over original bytes", () => {
  const a = new TextEncoder().encode('{"schemaVersion":"1"}')
  const b = new TextEncoder().encode('{ "schemaVersion": "1" }')
  expect(validateCatalogPackBytes(a).inputSha256)
    .not.toBe(validateCatalogPackBytes(b).inputSha256)
})
```

Also assert blockers are lexicographically sorted and diagnostics sort by severity, code, path, message.

- [ ] **Step 2: Run RED**

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
```

Expected: FAIL because byte-level report API is missing.

- [ ] **Step 3: Implement fatal UTF-8 decode, JSON parse, and SHA**

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

Invalid UTF-8/JSON returns one `INVALID_JSON` error, `catalogCode: null`, zero summary counts, `valid: false`, `ready: false`.

- [ ] **Step 4: Implement stable report ordering**

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

Final flags:

```ts
const diagnostics = sortDiagnostics(core.diagnostics)
const blockers = [...new Set(core.blockers)].sort()
const valid = !diagnostics.some((item) => item.severity === "error")
const ready = valid && blockers.length === 0
```

Report contains no current time, random value, input path, environment value, UUID, token, or secret.

- [ ] **Step 5: Verify Task 4**

```bash
npx vitest run scripts/catalog-pack/catalog-pack-validator.test.ts --project scripts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/catalog-pack/catalog-pack-validator.ts scripts/catalog-pack/catalog-pack-validator.test.ts
git commit -m "feat: produce deterministic catalog validation reports"
```

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

```ts
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { buildReadyCatalogPack } from "./catalog-pack-test-builder.ts"

function runCli(args: readonly string[]) {
  return spawnSync(process.execPath, ["scripts/catalog-pack/catalog-pack-cli.ts", ...args], {
    cwd: process.cwd(), encoding: "utf8"
  })
}

test("ready pack exits 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "bepnha-catalog-"))
  const input = join(dir, "pack.json")
  writeFileSync(input, JSON.stringify(buildReadyCatalogPack()), "utf8")
  const result = runCli(["--input", input])
  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, ready: true })
  expect(result.stderr).toBe("")
})

test("invalid pack exits 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "bepnha-catalog-"))
  const input = join(dir, "pack.json")
  writeFileSync(input, '{"schemaVersion":"2"}', "utf8")
  expect(runCli(["--input", input]).status).toBe(2)
})

test("valid but not ready pack exits 3", () => {
  const dir = mkdtempSync(join(tmpdir(), "bepnha-catalog-"))
  const input = join(dir, "pack.json")
  const pack = buildReadyCatalogPack()
  pack.mealOptions = pack.mealOptions.slice(0, 20)
  writeFileSync(input, JSON.stringify(pack), "utf8")
  expect(runCli(["--input", input]).status).toBe(3)
})
```

Also test: missing/duplicate `--input`, unknown flag, missing value, nonexistent input -> `1`; `--report` file equals stdout byte-for-byte; stdout contains no absolute input path.

- [ ] **Step 2: Run RED**

```bash
npx vitest run scripts/catalog-pack/catalog-pack-cli.test.ts --project scripts
```

Expected: FAIL because CLI is missing.

- [ ] **Step 3: Implement no-prompt argument parser**

```ts
type CliArgs = { readonly input: string; readonly report: string | null }
type ParseArgsResult =
  | { readonly ok: true; readonly value: CliArgs }
  | { readonly ok: false; readonly message: string }
```

Accept only `--input <value>` and optional `--report <value>`. Reject duplicates, positional args, unknown flags, and missing values. Do not read environment variables.

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

Usage/I/O/unexpected errors print one concise stderr line and exit `1`; no stack trace, secret, env variable, or input file content is printed.

- [ ] **Step 5: Add package command**

```json
"catalog:validate": "node scripts/catalog-pack/catalog-pack-cli.ts"
```

Do not wrap it with any Supabase env helper.

- [ ] **Step 6: Verify focused CLI behavior**

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

Expected: all PASS. Keep Phase 8 coverage floors statements >=78, branches >=70, functions >=84, lines >=82 and bundle ceiling unchanged.

If formatting alone fails, run `npm run format`, then rerun the full sequence; do not weaken gates.

- [ ] **Step 8: Prove scope containment**

```bash
git diff --check
git diff --name-only 7d9ff0dfe135d09d61424b647cfa61216ae2a77a...HEAD
git status --short
```

Allowed changed paths are only the approved spec/plan, `scripts/catalog-pack/**`, `tsconfig.node.json`, and `package.json`. Reject the implementation if the diff contains `supabase/migrations/**`, production catalog data, `.env*`, Vercel config, or service-role/secret material.

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

Do not claim `PHASE_9A_PASS` without fresh PASS output for these exact-head checks. Do not create a PR, merge, mutate production, or deploy without separate user authorization.

---

## Plan Self-Review Coverage

- Strict shape/no coercion: Task 1.
- Authoritative values never inferred/repaired: Task 2.
- 10 allergens + six nutrients + `unknown` rejection: Task 2.
- Units/categories/region/dimension and exact date/decimal rules: Task 2.
- Recipe/step/meal/version/conversion/price graph pins: Task 3.
- Reachable price coverage and unused warnings: Task 3.
- 21 meal options + three protein hints: Task 3.
- Original-byte SHA and deterministic sorting: Task 4.
- Exit codes 0/1/2/3 and no-network/no-secret CLI: Task 5.
- Full repo verification and scope containment: Task 5.
