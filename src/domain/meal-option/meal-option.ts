import type { RecipeVersionInput } from "@/domain/recipe/recipe"

export const MEAL_OPTION_ROLES = ["staple", "main", "vegetable", "soup", "side"] as const
export type MealOptionRole = (typeof MEAL_OPTION_ROLES)[number]

export type MealOptionTagKind = "protein_hint" | "cooking_style"

export interface MealOptionTagInput {
  readonly tagId: string
  readonly code: string
  readonly kind: MealOptionTagKind
}

export interface MealOptionRecipeInput {
  readonly mealOptionRecipeId: string
  readonly recipeId: string
  readonly recipeVersionId: string
  readonly recipeVersionNumber: number
  readonly recipeContentHash: string
  readonly recipeStatus: "published"
  readonly quantityMultiplier: string
  readonly mealRole: MealOptionRole
  readonly sortOrder: number
  readonly recipe: RecipeVersionInput
}

export interface MealOptionVersionInput {
  readonly mealOptionId: string
  readonly mealOptionVersionId: string
  readonly versionNumber: number
  readonly contentHash: string
  readonly status: "draft" | "published"
  readonly yieldAdultEquivalent: string
  readonly activeMinutes: number
  readonly elapsedMinutes: number
  readonly components: readonly MealOptionRecipeInput[]
  readonly tags: readonly MealOptionTagInput[]
}

export interface NormalizedMealOptionVersion extends MealOptionVersionInput {
  readonly components: readonly MealOptionRecipeInput[]
  readonly tags: readonly MealOptionTagInput[]
  readonly primaryProteinGroup: string
  readonly cookingStyleCodes: readonly string[]
  readonly mainRecipeVersionIds: readonly string[]
}

export type MealOptionValidationErrorCode =
  | "INVALID_MEAL_OPTION_IDENTITY"
  | "INVALID_MEAL_OPTION_VERSION"
  | "INVALID_MEAL_OPTION_YIELD"
  | "INVALID_MEAL_OPTION_TIME"
  | "INVALID_MEAL_OPTION_COMPONENTS"
  | "INVALID_RECIPE_VERSION_PIN"
  | "MEAL_OPTION_YIELD_MISMATCH"
  | "MISSING_MAIN_COMPONENT"
  | "INVALID_MEAL_OPTION_TAGS"
  | "INVALID_PROTEIN_HINT"
  | "MISSING_COOKING_STYLE"

export type MealOptionValidationResult =
  | { readonly ok: true; readonly value: NormalizedMealOptionVersion }
  | { readonly ok: false; readonly error: { readonly code: MealOptionValidationErrorCode } }
