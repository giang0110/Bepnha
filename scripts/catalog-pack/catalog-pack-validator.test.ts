import { describe, expect, test } from "vitest"

import { parseCatalogPackShape } from "./catalog-pack-schema.ts"
import {
  buildReadyCatalogPack,
  type MutableCatalogPackV1
} from "./catalog-pack-test-builder.ts"
import { validateCatalogPackValue } from "./catalog-pack-validator.ts"

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

type SemanticCase = {
  readonly name: string
  readonly mutate: (pack: MutableCatalogPackV1) => void
  readonly code: string
}

const semanticCases: readonly SemanticCase[] = [
  {
    name: "rejects invalid catalog code",
    mutate: (pack) => {
      pack.catalogCode = "Launch"
    },
    code: "INVALID_CODE"
  },
  {
    name: "rejects untrimmed source name",
    mutate: (pack) => {
      pack.source.name = " Catalog"
    },
    code: "INVALID_LABEL"
  },
  {
    name: "rejects empty source provenance",
    mutate: (pack) => {
      pack.source.provenance = ""
    },
    code: "INVALID_PROVENANCE"
  },
  {
    name: "rejects date-only preparedAt",
    mutate: (pack) => {
      pack.preparedAt = "2026-09-06"
    },
    code: "INVALID_TIMESTAMP"
  },
  {
    name: "rejects duplicate food code",
    mutate: (pack) => {
      pack.foods[1]!.code = pack.foods[0]!.code
    },
    code: "DUPLICATE_CATALOG_ENTRY"
  },
  {
    name: "rejects unsupported food base unit",
    mutate: (pack) => {
      pack.foods[0]!.baseUnitCode = "oz"
    },
    code: "REFERENCE_CODE_UNSUPPORTED"
  },
  {
    name: "rejects unsupported category",
    mutate: (pack) => {
      pack.foods[0]!.fact.categoryCode = "unknown_category"
      pack.foods[0]!.fact.categoryAncestry[0] = "unknown_category"
    },
    code: "REFERENCE_CODE_UNSUPPORTED"
  },
  {
    name: "rejects base unit dimension mismatch",
    mutate: (pack) => {
      pack.foods[0]!.baseUnitCode = "ml"
    },
    code: "BASE_UNIT_DIMENSION_MISMATCH"
  },
  {
    name: "rejects non-canonical edible fraction",
    mutate: (pack) => {
      pack.foods[0]!.fact.edibleFraction = "01.0"
    },
    code: "INVALID_DECIMAL"
  },
  {
    name: "rejects unknown allergen status",
    mutate: (pack) => {
      pack.foods[0]!.fact.allergenAssessments[0]!.status = "unknown"
    },
    code: "UNKNOWN_ALLERGEN_LINEAGE"
  },
  {
    name: "rejects missing allergen coverage",
    mutate: (pack) => {
      pack.foods[0]!.fact.allergenAssessments.pop()
    },
    code: "ALLERGEN_COVERAGE_INCOMPLETE"
  },
  {
    name: "rejects duplicate allergen code",
    mutate: (pack) => {
      pack.foods[0]!.fact.allergenAssessments.push(
        structuredClone(pack.foods[0]!.fact.allergenAssessments[0]!)
      )
    },
    code: "DUPLICATE_CATALOG_ENTRY"
  },
  {
    name: "rejects missing required nutrient",
    mutate: (pack) => {
      pack.foods[0]!.fact.nutrients.pop()
    },
    code: "REQUIRED_NUTRITION_COVERAGE_INCOMPLETE"
  },
  {
    name: "rejects duplicate nutrient code",
    mutate: (pack) => {
      pack.foods[0]!.fact.nutrients.push(structuredClone(pack.foods[0]!.fact.nutrients[0]!))
    },
    code: "DUPLICATE_CATALOG_ENTRY"
  },
  {
    name: "rejects duplicate conversion unit",
    mutate: (pack) => {
      pack.foods[0]!.fact.conversions.push(structuredClone(pack.foods[0]!.fact.conversions[0]!))
    },
    code: "DUPLICATE_CATALOG_ENTRY"
  },
  {
    name: "rejects zero recipe yield",
    mutate: (pack) => {
      pack.recipes[0]!.version.yieldAdultEquivalent = "0"
    },
    code: "INVALID_DECIMAL"
  },
  {
    name: "rejects recipe elapsed duration above authority limit",
    mutate: (pack) => {
      pack.recipes[0]!.version.elapsedMinutes = 181
    },
    code: "INVALID_DURATION"
  },
  {
    name: "rejects non-contiguous ingredient order",
    mutate: (pack) => {
      pack.recipes[0]!.version.ingredients[0]!.order = 2
    },
    code: "INVALID_ORDER"
  },
  {
    name: "rejects preparation note longer than 120 characters",
    mutate: (pack) => {
      pack.recipes[0]!.version.ingredients[0]!.preparationNoteVi = "x".repeat(121)
    },
    code: "INVALID_LABEL"
  },
  {
    name: "rejects step instruction longer than 500 characters",
    mutate: (pack) => {
      pack.recipes[0]!.version.steps[0]!.instructionVi = "x".repeat(501)
    },
    code: "INVALID_LABEL"
  },
  {
    name: "rejects price observation timestamp",
    mutate: (pack) => {
      pack.priceBook.prices[0]!.observedAt = "2026-09-06T12:00:00Z"
    },
    code: "INVALID_DATE"
  },
  {
    name: "rejects reversed price-book date range",
    mutate: (pack) => {
      pack.priceBook.effectiveTo = "2026-09-05"
    },
    code: "INVALID_DATE_RANGE"
  },
  {
    name: "rejects fractional VND price",
    mutate: (pack) => {
      pack.priceBook.prices[0]!.packagePriceVnd = 1.5
    },
    code: "INVALID_PRICE"
  },
  {
    name: "rejects placeholder price source reference",
    mutate: (pack) => {
      pack.priceBook.prices[0]!.sourceReference = "TBD"
    },
    code: "INVALID_SOURCE_REFERENCE"
  },
  {
    name: "rejects zero meal active duration",
    mutate: (pack) => {
      pack.mealOptions[0]!.version.activeMinutes = 0
    },
    code: "INVALID_DURATION"
  },
  {
    name: "rejects non-contiguous meal component order",
    mutate: (pack) => {
      pack.mealOptions[0]!.version.components[0]!.order = 2
    },
    code: "INVALID_ORDER"
  },
  {
    name: "rejects duplicate recipe components",
    mutate: (pack) => {
      const duplicate = structuredClone(pack.mealOptions[0]!.version.components[0]!)
      duplicate.order = 2
      pack.mealOptions[0]!.version.components.push(duplicate)
    },
    code: "DUPLICATE_CATALOG_ENTRY"
  },
  {
    name: "requires a main meal component",
    mutate: (pack) => {
      pack.mealOptions[0]!.version.components[0]!.mealRole = "side"
    },
    code: "MEAL_MAIN_COMPONENT_REQUIRED"
  },
  {
    name: "rejects duplicate cooking style",
    mutate: (pack) => {
      pack.mealOptions[0]!.version.cookingStyleCodes.push("boil")
    },
    code: "DUPLICATE_CATALOG_ENTRY"
  },
  {
    name: "rejects duplicate dish role",
    mutate: (pack) => {
      pack.mealOptions[0]!.version.dishRoleCodes.push("main")
    },
    code: "DUPLICATE_CATALOG_ENTRY"
  }
]

describe("validateCatalogPackValue authoritative fields", () => {
  test("synthetic builder is strict-shape valid", () => {
    expect(parseCatalogPackShape(buildReadyCatalogPack()).success).toBe(true)
  })

  test.each(semanticCases)("$name", ({ mutate, code }) => {
    const pack = structuredClone(buildReadyCatalogPack())
    mutate(pack)
    expect(validateCatalogPackValue(pack).diagnostics.map((item) => item.code)).toContain(code)
  })
})
