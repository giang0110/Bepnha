export const CATALOG_DIMENSIONS = ["mass", "volume", "count"] as const

export type CatalogDimension = (typeof CATALOG_DIMENSIONS)[number]

export interface FoodFactUnitConversion {
  readonly unitId: string
  readonly unitCode: string
  readonly sourceDimension: CatalogDimension
  readonly sourceToDimensionBase: string
  readonly foodBaseUnitId: string
  readonly foodBaseDimension: CatalogDimension
  readonly foodBaseUnitToDimensionBase: string
  readonly baseQuantityPerUnit: string
  readonly grossGramsPerUnit: string
  readonly displayStep: string
}

export const SUPPORTED_ALLERGEN_CODES = [
  "peanut",
  "tree_nut",
  "dairy",
  "egg",
  "soy",
  "wheat",
  "fish",
  "crustacean",
  "mollusc",
  "sesame"
] as const

export type SupportedAllergenCode = (typeof SUPPORTED_ALLERGEN_CODES)[number]
export type AllergenAssessmentStatus = "absent" | "contains" | "may_contain" | "unknown"

export interface AllergenAssessment {
  readonly allergenCode: string
  readonly status: AllergenAssessmentStatus
}

export const REQUIRED_NUTRIENT_CODES = [
  "energy_kcal",
  "protein_g",
  "carbohydrate_g",
  "fat_g",
  "fibre_g",
  "sodium_mg"
] as const

export type RequiredNutrientCode = (typeof REQUIRED_NUTRIENT_CODES)[number]

export interface FoodFactNutrientAmount {
  readonly nutrientCode: string
  readonly amountPer100g: string
}

export interface FoodFactLineageInput {
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly edibleFraction: string
  readonly allergenAssessments: readonly AllergenAssessment[]
  readonly nutrients: readonly FoodFactNutrientAmount[]
  readonly categoryAncestry: readonly string[]
  readonly dietaryTagCodes: readonly string[]
}

export interface RecipeIngredientLineage {
  readonly recipeIngredientId: string
  readonly allergenAssessments: readonly AllergenAssessment[]
  readonly categoryAncestry: readonly string[]
  readonly dietaryTagCodes: readonly string[]
}
