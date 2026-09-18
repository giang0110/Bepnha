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
/**
 * What the catalog knows about one allergen in one food.
 *
 * The three middle values are all "this might reach the plate", and the planner excludes on every
 * one of them; they differ in what the author actually established, which is what the app tells the
 * cook and what a later SKU-level survey would refine.
 *
 * - `absent` — not an ingredient, and handling is cleared too. This is a safety claim about a
 *   specific product and needs evidence at SKU or supplier level; it is not reachable by reasoning
 *   from a generic food's identity.
 * - `contains` — an ingredient of the food.
 * - `may_contain` — the entry covers products that differ, or the product carries precautionary
 *   allergen labelling. Generic `nuoc_tuong` is the example: brewed soy sauce uses wheat, certified
 *   gluten-free versions use rice.
 * - `cross_contact_unverified` — not an ingredient of the food, with the supplier's handling
 *   unverified. This is the honest status for a generic market ingredient, and the only one whose
 *   effect the household decides: see {@link AllergenStrictness}.
 * - `unknown` — nobody has assessed it. A pack carrying any of these cannot be published.
 */
export type AllergenAssessmentStatus =
  "absent" | "contains" | "may_contain" | "cross_contact_unverified" | "unknown"

export const ALLERGEN_ASSESSMENT_STATUSES = [
  "absent",
  "contains",
  "may_contain",
  "cross_contact_unverified",
  "unknown"
] as const satisfies readonly AllergenAssessmentStatus[]

export function isAllergenAssessmentStatus(value: unknown): value is AllergenAssessmentStatus {
  return (
    typeof value === "string" && (ALLERGEN_ASSESSMENT_STATUSES as readonly string[]).includes(value)
  )
}

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
