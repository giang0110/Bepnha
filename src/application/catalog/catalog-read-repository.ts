import type { RecipeCalculationInputV1 } from "@/domain/calculation/recipe-calculation-input"

type CalculationRecipe = RecipeCalculationInputV1["recipe"]
type CalculationIngredient = CalculationRecipe["ingredients"][number]

export type PublishedRecipeReadDto = Omit<CalculationRecipe, "ingredients"> & {
  readonly ingredients: readonly (Omit<CalculationIngredient, "food"> & {
    readonly food: CalculationIngredient["food"] & {
      readonly nameVi: string
    }
  })[]
}

export interface PublishedRecipeCalculationRecord {
  readonly recipePublicationStatus: "draft" | "published"
  readonly priceBookPublicationStatus: "draft" | "published"
  readonly priceBookRetiredAt: string | null
  readonly recipe: PublishedRecipeReadDto
  readonly priceBook: RecipeCalculationInputV1["priceBook"]
}

export type CatalogReadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: "NOT_FOUND" | "DEPENDENCY_UNAVAILABLE" }

export interface CatalogReadRepository {
  readonly getCurrentPriceBook: (
    regionId: string
  ) => Promise<CatalogReadResult<{ readonly priceBookId: string }>>
  readonly getPublishedRecipeCalculation: (
    recipeVersionId: string,
    priceBookId: string
  ) => Promise<CatalogReadResult<PublishedRecipeCalculationRecord>>
}
