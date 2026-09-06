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
