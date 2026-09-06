import { parseCatalogPackShape } from "./catalog-pack-schema.ts"
import type {
  CatalogPackDiagnostic,
  CatalogPackV1,
  CatalogPackValidationReport
} from "./catalog-pack-types.ts"

export interface CatalogPackValidationCoreResult {
  readonly pack: CatalogPackV1 | null
  readonly catalogCode: string | null
  readonly diagnostics: readonly CatalogPackDiagnostic[]
  readonly blockers: readonly string[]
  readonly summary: CatalogPackValidationReport["summary"]
}

const ZERO_SUMMARY: CatalogPackValidationReport["summary"] = {
  foods: 0,
  recipes: 0,
  priceRows: 0,
  mealOptions: 0,
  primaryProteinGroups: 0,
  reachableFoods: 0,
  pricedReachableFoods: 0
}

export function validateCatalogPackValue(value: unknown): CatalogPackValidationCoreResult {
  const parsed = parseCatalogPackShape(value)
  if (!parsed.success) {
    return {
      pack: null,
      catalogCode: null,
      diagnostics: parsed.error.issues.map((issue) => ({
        severity: "error" as const,
        code: "INVALID_SHAPE",
        path: "$",
        message: issue.message
      })),
      blockers: [],
      summary: ZERO_SUMMARY
    }
  }

  const pack = parsed.data
  return {
    pack,
    catalogCode: pack.catalogCode,
    diagnostics: [],
    blockers: [],
    summary: {
      foods: pack.foods.length,
      recipes: pack.recipes.length,
      priceRows: pack.priceBook.prices.length,
      mealOptions: pack.mealOptions.length,
      primaryProteinGroups: new Set(pack.mealOptions.map((meal) => meal.version.proteinHintCode))
        .size,
      reachableFoods: 0,
      pricedReachableFoods: 0
    }
  }
}
